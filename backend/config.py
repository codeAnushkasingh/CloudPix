"""
CloudPix - Application Configuration
Handles loading environment variables, validating file parameters,
and configuring storage settings for AWS S3 and Local Demo Mode.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Base paths
BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"

# Load environment variables (check PROJECT_ROOT/.env first, then BACKEND_DIR/.env)
env_path = PROJECT_ROOT / ".env"
if not env_path.exists():
    env_path = BACKEND_DIR / ".env"
load_dotenv(dotenv_path=env_path)


class Config:
    """Central configuration class for CloudPix backend."""

    # Server Settings
    SECRET_KEY = os.getenv("SECRET_KEY", "cloudpix-default-dev-secret-key-2026")
    FLASK_ENV = os.getenv("FLASK_ENV", "development")
    DEBUG = os.getenv("FLASK_DEBUG", "True").lower() in ("true", "1", "yes")
    PORT = int(os.getenv("PORT", 5000))

    # Path Settings
    UPLOAD_FOLDER = BACKEND_DIR / "uploads"
    METADATA_FILE = UPLOAD_FOLDER / "metadata.json"
    FRONTEND_DIR = FRONTEND_DIR

    # Upload Constraints
    # 5 MB maximum allowed file size
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", 5 * 1024 * 1024))
    ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
    ALLOWED_MIME_TYPES = {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
    }

    # AWS S3 Settings
    S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "").strip()
    AWS_REGION = os.getenv("AWS_REGION", "us-east-1").strip()
    AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "").strip() or None
    AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "").strip() or None
    PRESIGNED_URL_EXPIRY = int(os.getenv("PRESIGNED_URL_EXPIRY", 3600))  # 1 hour

    # Storage Mode: 'auto' | 's3' | 'local'
    STORAGE_MODE = os.getenv("STORAGE_MODE", "auto").strip().lower()

    @classmethod
    def ensure_upload_dir(cls):
        """Ensures the local uploads directory exists."""
        cls.UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)


def is_allowed_file(filename: str) -> bool:
    """Checks if the filename has a supported extension."""
    if not filename or "." not in filename:
        return False
    ext = filename.rsplit(".", 1)[1].lower()
    return ext in Config.ALLOWED_EXTENSIONS


def get_file_extension(filename: str) -> str:
    """Returns normalized extension for a file."""
    if "." in filename:
        return filename.rsplit(".", 1)[1].lower()
    return ""


def format_bytes(size: int) -> str:
    """Formats raw byte count into human-readable string (KB, MB)."""
    if size < 1024:
        return f"{size} B"
    elif size < 1024 * 1024:
        return f"{size / 1024:.1f} KB"
    else:
        return f"{size / (1024 * 1024):.2f} MB"

