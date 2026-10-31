"""
CloudPix - Storage Management Layer
Handles dual-storage backends:
1. AWS S3 using Boto3 (private bucket with secure Presigned URLs, EC2 IAM role support)
2. Local Demo Storage (fallback for local development without AWS credentials)

Never pretends demo uploads are saved to AWS S3.
"""

import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError, NoCredentialsError

from config import Config, format_bytes, get_file_extension

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cloudpix.storage")


class StorageManager:
    """Manages image persistence across AWS S3 and Local Demo Storage."""

    def __init__(self):
        Config.ensure_upload_dir()
        self.mode = "local"  # 's3' or 'local'
        self.s3_client = None
        self.bucket_name = Config.S3_BUCKET_NAME
        self.region = Config.AWS_REGION
        self.status_message = "Initializing storage..."
        self.s3_index_key = "cloudpix_metadata.json"

        self._initialize_storage()

    def _initialize_storage(self):
        """Initializes S3 or Local storage according to configuration and credentials."""
        requested_mode = Config.STORAGE_MODE

        if requested_mode == "local":
            self.mode = "local"
            self.status_message = "Local Demo Mode active (configured via STORAGE_MODE=local)."
            logger.info("Storage initialized in Local Demo Mode.")
            return

        # Attempt to initialize AWS S3
        if not self.bucket_name:
            if requested_mode == "s3":
                self.mode = "local"
                self.status_message = (
                    "Warning: STORAGE_MODE is 's3', but S3_BUCKET_NAME is not set. "
                    "Falling back to Local Demo Mode."
                )
                logger.warning(self.status_message)
            else:
                self.mode = "local"
                self.status_message = (
                    "Local Demo Mode active. Set S3_BUCKET_NAME and AWS credentials in .env to connect S3."
                )
                logger.info(self.status_message)
            return

        try:
            # Build boto3 client. If explicit keys are provided, use them;
            # otherwise boto3 automatically resolves credentials via the AWS chain
            # (Environment variables -> ~/.aws/credentials -> EC2 IAM Instance Profile / Role)
            session_kwargs = {"region_name": self.region}
            if Config.AWS_ACCESS_KEY_ID and Config.AWS_SECRET_ACCESS_KEY:
                session_kwargs["aws_access_key_id"] = Config.AWS_ACCESS_KEY_ID
                session_kwargs["aws_secret_access_key"] = Config.AWS_SECRET_ACCESS_KEY

            boto_config = BotoConfig(
                signature_version="s3v4",
                retries={"max_attempts": 3, "mode": "standard"},
            )

            client = boto3.client("s3", config=boto_config, **session_kwargs)

            # Test bucket access (Bucket existence and permissions)
            client.head_bucket(Bucket=self.bucket_name)

            self.s3_client = client
            self.mode = "s3"
            self.status_message = f"Connected to AWS S3 bucket '{self.bucket_name}' in region '{self.region}'."
            logger.info(self.status_message)

        except (ClientError, NoCredentialsError) as e:
            error_code = ""
            if isinstance(e, ClientError):
                error_code = e.response.get("Error", {}).get("Code", "Unknown")

            if requested_mode == "s3":
                self.mode = "local"
                self.status_message = (
                    f"AWS S3 Connection Failed ({error_code or str(e)}). "
                    f"Please check IAM permissions or bucket name. Operating in Local Demo Mode."
                )
                logger.error(f"S3 Connection Error: {e}. Fallback to Local Demo Mode.")
            else:
                self.mode = "local"
                self.status_message = (
                    f"AWS credentials or bucket not verified ({error_code or 'no credentials'}). "
                    f"Operating safely in Local Demo Mode."
                )
                logger.info(self.status_message)
        except Exception as ex:
            self.mode = "local"
            self.status_message = f"Storage initialization fallback: {str(ex)}"
            logger.warning(f"Storage init error: {ex}")

    # =========================================================================
    # Metadata Storage Helpers
    # =========================================================================

    def _read_local_metadata(self) -> List[Dict]:
        """Reads metadata index from local JSON file."""
        if not Config.METADATA_FILE.exists():
            return []
        try:
            with open(Config.METADATA_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to read local metadata: {e}")
            return []

    def _write_local_metadata(self, metadata: List[Dict]):
        """Writes metadata index to local JSON file."""
        try:
            with open(Config.METADATA_FILE, "w", encoding="utf-8") as f:
                json.dump(metadata, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to write local metadata: {e}")

    def _read_s3_metadata(self) -> List[Dict]:
        """Reads metadata index from private S3 bucket."""
        if not self.s3_client:
            return []
        try:
            response = self.s3_client.get_object(
                Bucket=self.bucket_name, Key=self.s3_index_key
            )
            body = response["Body"].read().decode("utf-8")
            return json.loads(body)
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code")
            if code in ("NoSuchKey", "404"):
                return []
            logger.warning(f"Error fetching S3 metadata index: {e}")
            return []
        except Exception as e:
            logger.warning(f"Unexpected error fetching S3 metadata: {e}")
            return []

    def _write_s3_metadata(self, metadata: List[Dict]):
        """Persists metadata index back to private S3 bucket."""
        if not self.s3_client:
            return
        try:
            payload = json.dumps(metadata, indent=2).encode("utf-8")
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=self.s3_index_key,
                Body=payload,
                ContentType="application/json",
            )
        except Exception as e:
            logger.error(f"Failed to write S3 metadata index: {e}")

    # =========================================================================
    # Presigned URL Generation
    # =========================================================================

    def generate_presigned_url(self, key: str, expires_in: Optional[int] = None) -> Optional[str]:
        """
        Generates a secure, temporary Presigned GET URL for an S3 object.
        Keeps the S3 bucket 100% private.
        """
        if not self.s3_client or self.mode != "s3":
            return None

        expiry = expires_in or Config.PRESIGNED_URL_EXPIRY
        try:
            url = self.s3_client.generate_presigned_url(
                ClientMethod="get_object",
                Params={"Bucket": self.bucket_name, "Key": key},
                ExpiresIn=expiry,
            )
            return url
        except Exception as e:
            logger.error(f"Failed to generate presigned URL for key '{key}': {e}")
            return None

    # =========================================================================
    # Core API Operations: List, Upload, Delete, Health
    # =========================================================================

    def list_images(self) -> List[Dict]:
        """
        Returns all stored images with updated URLs and metadata.
        For S3: re-generates fresh presigned URLs.
        For Local: serves from /api/images/raw/<key>.
        """
        if self.mode == "s3":
            items = self._read_s3_metadata()
            refreshed = []
            for item in items:
                # Do not expose internal storage keys in URL
                key = item.get("storage_key", "")
                url = self.generate_presigned_url(key)
                item_copy = dict(item)
                item_copy["url"] = url
                item_copy["storage_mode"] = "s3"
                item_copy["storage_label"] = f"AWS S3 ({self.bucket_name})"
                item_copy["is_demo"] = False
                refreshed.append(item_copy)
            # Sort newest first
            return sorted(refreshed, key=lambda x: x.get("timestamp", 0), reverse=True)
        else:
            items = self._read_local_metadata()
            formatted = []
            for item in items:
                item_copy = dict(item)
                key = item.get("storage_key", "")
                item_copy["url"] = f"/api/images/raw/{key}"
                item_copy["storage_mode"] = "local"
                item_copy["storage_label"] = "Local Demo Storage"
                item_copy["is_demo"] = True
                formatted.append(item_copy)
            return sorted(formatted, key=lambda x: x.get("timestamp", 0), reverse=True)

    def upload_image(self, file_obj, original_filename: str) -> Tuple[bool, Dict, str]:
        """
        Uploads an image file to either AWS S3 or Local Demo storage.
        Returns (success_bool, image_metadata_dict, error_message).
        """
        try:
            # Generate a secure unique ID and storage key
            image_id = str(uuid.uuid4())
            ext = get_file_extension(original_filename)
            safe_basename = "".join(
                c for c in Path(original_filename).stem if c.isalnum() or c in ("-", "_")
            ) or "image"
            storage_key = f"{image_id}_{safe_basename}.{ext}"

            # Calculate file size
            file_obj.seek(0, os.SEEK_END)
            size_bytes = file_obj.tell()
            file_obj.seek(0)

            if size_bytes > Config.MAX_CONTENT_LENGTH:
                return (
                    False,
                    {},
                    f"File exceeds maximum allowed size of {format_bytes(Config.MAX_CONTENT_LENGTH)}.",
                )

            mime_type = Config.ALLOWED_MIME_TYPES.get(ext, "application/octet-stream")
            now_iso = datetime.now(timezone.utc).isoformat()
            timestamp = int(time.time())

            record = {
                "id": image_id,
                "filename": original_filename,
                "storage_key": storage_key,
                "format": ext.upper(),
                "mime_type": mime_type,
                "size_bytes": size_bytes,
                "size_formatted": format_bytes(size_bytes),
                "upload_date": now_iso,
                "timestamp": timestamp,
            }

            if self.mode == "s3":
                logger.info(f"Uploading '{storage_key}' to AWS S3 bucket '{self.bucket_name}'...")
                self.s3_client.upload_fileobj(
                    file_obj,
                    self.bucket_name,
                    storage_key,
                    ExtraArgs={"ContentType": mime_type},
                )
                # Update S3 metadata
                existing = self._read_s3_metadata()
                existing.append(record)
                self._write_s3_metadata(existing)

                # Generate presigned URL
                url = self.generate_presigned_url(storage_key)
                record["url"] = url
                record["storage_mode"] = "s3"
                record["storage_label"] = f"AWS S3 ({self.bucket_name})"
                record["is_demo"] = False
                logger.info(f"Successfully uploaded {image_id} to AWS S3.")
                return True, record, ""

            else:
                # Local Demo Mode
                destination_path = Config.UPLOAD_FOLDER / storage_key
                logger.info(f"Saving '{storage_key}' to Local Demo storage ({destination_path})...")
                file_obj.save(destination_path)

                # Update Local metadata
                existing = self._read_local_metadata()
                existing.append(record)
                self._write_local_metadata(existing)

                record["url"] = f"/api/images/raw/{storage_key}"
                record["storage_mode"] = "local"
                record["storage_label"] = "Local Demo Storage"
                record["is_demo"] = True
                logger.info(f"Successfully saved {image_id} to Local Demo storage.")
                return True, record, ""

        except Exception as e:
            logger.error(f"Failed to upload image: {e}")
            return False, {}, str(e)

    def delete_image(self, image_id: str) -> Tuple[bool, str]:
        """
        Deletes the image by ID from S3 or Local storage.
        Returns (success_bool, message).
        """
        try:
            if self.mode == "s3":
                items = self._read_s3_metadata()
                target = next((item for item in items if item.get("id") == image_id), None)
                if not target:
                    return False, f"Image with ID '{image_id}' not found."

                storage_key = target.get("storage_key")
                logger.info(f"Deleting '{storage_key}' from AWS S3 bucket '{self.bucket_name}'...")
                self.s3_client.delete_object(Bucket=self.bucket_name, Key=storage_key)

                # Update metadata
                remaining = [item for item in items if item.get("id") != image_id]
                self._write_s3_metadata(remaining)
                return True, f"Image '{target.get('filename')}' deleted from AWS S3."

            else:
                items = self._read_local_metadata()
                target = next((item for item in items if item.get("id") == image_id), None)
                if not target:
                    return False, f"Image with ID '{image_id}' not found."

                storage_key = target.get("storage_key")
                file_path = Config.UPLOAD_FOLDER / storage_key
                if file_path.exists():
                    try:
                        file_path.unlink()
                    except Exception:
                        # On Windows, open handles from recent send_file may briefly hold the lock
                        import gc
                        gc.collect()
                        time.sleep(0.05)
                        try:
                            file_path.unlink()
                        except Exception as fe:
                            logger.warning(f"Could not unlink local file {file_path}: {fe}")

                # Update metadata
                remaining = [item for item in items if item.get("id") != image_id]
                self._write_local_metadata(remaining)
                return True, f"Image '{target.get('filename')}' deleted from Local Demo storage."

        except Exception as e:
            logger.error(f"Failed to delete image '{image_id}': {e}")
            return False, str(e)

    def get_local_file_path(self, storage_key: str) -> Optional[Path]:
        """Returns the local file path for local demo mode streaming."""
        file_path = Config.UPLOAD_FOLDER / storage_key
        if file_path.exists() and file_path.is_file():
            return file_path
        return None

    def get_health_status(self) -> Dict:
        """Returns storage health, active mode, and configurations."""
        return {
            "status": "healthy",
            "storage_mode": self.mode,
            "is_s3_connected": self.mode == "s3",
            "storage_label": f"AWS S3 ({self.bucket_name})" if self.mode == "s3" else "Local Demo Mode",
            "bucket_name": self.bucket_name if self.mode == "s3" else None,
            "region": self.region if self.mode == "s3" else None,
            "status_message": self.status_message,
            "max_file_size_bytes": Config.MAX_CONTENT_LENGTH,
            "max_file_size_formatted": format_bytes(Config.MAX_CONTENT_LENGTH),
            "allowed_extensions": sorted(list(Config.ALLOWED_EXTENSIONS)),
            "presigned_url_expiry_seconds": Config.PRESIGNED_URL_EXPIRY,
            "server_time": datetime.now(timezone.utc).isoformat(),
        }
