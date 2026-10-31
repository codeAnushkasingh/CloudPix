"""
CloudPix - WSGI Application Entry Point
Enables production WSGI servers (Gunicorn, uWSGI) to run from the root directory:
  gunicorn wsgi:app --bind 0.0.0.0:$PORT
"""

import sys
from pathlib import Path

# Add backend directory to sys.path
ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import app
from config import Config

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=Config.PORT, debug=Config.DEBUG)

