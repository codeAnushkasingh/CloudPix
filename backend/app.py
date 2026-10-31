"""
CloudPix - Modern Cloud Image Hosting Platform
Flask REST API and Full-Stack Server
Endpoints:
  - GET  /api/health
  - GET  /api/images
  - POST /api/upload
  - DELETE /api/images/<image_id>
  - GET  /api/images/raw/<path:storage_key>
  - GET  / (Frontend static file serving)
"""

import os
import sys
from pathlib import Path
from flask import Flask, jsonify, request, send_file, send_from_directory
from flask_cors import CORS
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.utils import secure_filename

# Ensure backend directory is in Python path for direct script execution
CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from config import Config, is_allowed_file, format_bytes
from storage import StorageManager

# Initialize Flask application
app = Flask(
    __name__,
    static_folder=str(Config.FRONTEND_DIR),
    static_url_path="",
)

# Apply configuration
app.config["SECRET_KEY"] = Config.SECRET_KEY
app.config["MAX_CONTENT_LENGTH"] = Config.MAX_CONTENT_LENGTH

# Enable Cross-Origin Resource Sharing
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Initialize Storage Layer (AWS S3 or Local Demo Mode)
storage = StorageManager()


# =============================================================================
# Error Handlers
# =============================================================================

@app.errorhandler(413)
def request_entity_too_large(error):
    """Handles file uploads exceeding MAX_CONTENT_LENGTH (5 MB)."""
    return jsonify({
        "success": False,
        "error": f"File size exceeds the allowed limit of {format_bytes(Config.MAX_CONTENT_LENGTH)} (5 MB).",
    }), 413


@app.errorhandler(404)
def not_found(error):
    """Custom 404 handler for API and static paths."""
    if request.path.startswith("/api/"):
        return jsonify({
            "success": False,
            "error": "The requested API endpoint was not found.",
        }), 404
    # For web navigation, serve index.html
    index_file = Config.FRONTEND_DIR / "index.html"
    if index_file.exists():
        return send_file(index_file)
    return "Page Not Found", 404


@app.errorhandler(500)
def internal_server_error(error):
    """Custom 500 handler."""
    return jsonify({
        "success": False,
        "error": "An unexpected server error occurred. Please try again later.",
    }), 500


# =============================================================================
# API Endpoints
# =============================================================================

@app.route("/api/health", methods=["GET"])
def health_check():
    """
    Returns system status, active storage mode (AWS S3 vs Local Demo),
    and upload restrictions.
    """
    health_info = storage.get_health_status()
    return jsonify(health_info), 200


@app.route("/api/images", methods=["GET"])
def get_images():
    """
    Returns the list of all uploaded images with updated presigned URLs
    or local stream URLs, format, file size, and upload timestamps.
    """
    try:
        images = storage.list_images()
        return jsonify({
            "success": True,
            "count": len(images),
            "storage_mode": storage.mode,
            "storage_label": storage.get_health_status()["storage_label"],
            "images": images,
        }), 200
    except Exception as e:
        app.logger.error(f"Error listing images: {e}")
        return jsonify({
            "success": False,
            "error": "Failed to retrieve images.",
            "details": str(e),
        }), 500


@app.route("/api/upload", methods=["POST"])
def upload_image():
    """
    Uploads an image (JPG, JPEG, PNG, WEBP up to 5MB).
    Saves to AWS S3 (private with presigned URL) or Local Demo storage.
    """
    # Check if image file was sent
    if "image" not in request.files:
        return jsonify({
            "success": False,
            "error": "No file part in the request. Please provide an 'image' file field.",
        }), 400

    file = request.files["image"]

    if not file or file.filename.strip() == "":
        return jsonify({
            "success": False,
            "error": "No file selected for upload.",
        }), 400

    original_filename = secure_filename(file.filename)
    if not original_filename:
        original_filename = "unnamed_image.png"

    # Validate file extension
    if not is_allowed_file(original_filename):
        allowed = ", ".join(sorted(list(Config.ALLOWED_EXTENSIONS))).upper()
        return jsonify({
            "success": False,
            "error": f"Unsupported file type. Allowed formats: {allowed}.",
        }), 400

    # Perform upload via storage manager
    success, record, error_msg = storage.upload_image(file, original_filename)

    if not success:
        return jsonify({
            "success": False,
            "error": error_msg or "Failed to upload image.",
        }), 400

    return jsonify({
        "success": True,
        "message": f"Image '{original_filename}' uploaded successfully.",
        "image": record,
    }), 201


@app.route("/api/images/<image_id>", methods=["DELETE"])
def delete_image(image_id):
    """
    Deletes an image by ID from AWS S3 or Local Demo storage.
    """
    if not image_id or not image_id.strip():
        return jsonify({
            "success": False,
            "error": "Missing image_id parameter.",
        }), 400

    success, message = storage.delete_image(image_id.strip())

    if not success:
        return jsonify({
            "success": False,
            "error": message,
        }), 404

    return jsonify({
        "success": True,
        "message": message,
        "deleted_id": image_id,
    }), 200


@app.route("/api/images/raw/<path:storage_key>", methods=["GET"])
def serve_local_image(storage_key):
    """
    Streams local demo images with correct MIME headers and caching.
    Used exclusively in Local Demo Mode.
    """
    file_path = storage.get_local_file_path(storage_key)
    if not file_path:
        return jsonify({"success": False, "error": "Image file not found."}), 404

    return send_file(file_path)


# =============================================================================
# Frontend Static File Serving
# =============================================================================

@app.route("/", methods=["GET"])
def index():
    """Serves the main CloudPix frontend index.html."""
    return send_from_directory(str(Config.FRONTEND_DIR), "index.html")


@app.route("/<path:filename>", methods=["GET"])
def serve_frontend_static(filename):
    """Serves CSS, JS, images, icons, and static assets from frontend/."""
    file_path = Config.FRONTEND_DIR / filename
    if file_path.exists() and file_path.is_file():
        return send_from_directory(str(Config.FRONTEND_DIR), filename)
    # Fallback to index.html for client-side navigation
    return send_from_directory(str(Config.FRONTEND_DIR), "index.html")


if __name__ == "__main__":
    print("=" * 70)
    print("  CloudPix - Your Images, Your Cloud")
    print(f"  Storage Status: {storage.status_message}")
    print(f"  Web Server: http://localhost:{Config.PORT}")
    print("=" * 70)
    app.run(
        host="0.0.0.0",
        port=Config.PORT,
        debug=Config.DEBUG,
    )

