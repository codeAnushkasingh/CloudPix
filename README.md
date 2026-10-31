# CloudPix – Your Images, Your Cloud

<div align="center">

![CloudPix Logo](frontend/assets/icons/logo.svg)

### Modern Cloud Image Hosting Platform with Python Flask & AWS S3

[![Python](https://img.shields.io/badge/Python-3.9+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.0+-000000?logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![AWS S3](https://img.shields.io/badge/AWS_S3-Boto3_Ready-FF9900?logo=amazons3&logoColor=white)](https://aws.amazon.com/s3/)
[![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla_ES6+-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/)
[![CSS3](https://img.shields.io/badge/CSS3-Modern_Responsive-1572B6?logo=css3&logoColor=white)](https://www.w3.org/Style/CSS/)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)

</div>

> [!IMPORTANT]
> **Storage Status Note**: AWS S3 is **NOT connected yet** by default. CloudPix is currently configured and running in **Local Demo Mode**, which persists all uploaded images locally on your computer inside `backend/uploads/`. No AWS account, credentials, or paid cloud services are required to run, test, or develop on this project. When you are ready to connect a real AWS bucket, simply provide your bucket details in `.env`.

---

## 🌟 Overview

**CloudPix** is a modern, full-stack cloud image hosting platform engineered with pure **HTML5, CSS3, and vanilla JavaScript** on the frontend, a lightweight **Python Flask** REST API backend, and **AWS S3 via Boto3** for private cloud object storage.

The platform is designed to provide bank-grade security and simplicity:
- **100% Private S3 Storage**: Public access is completely blocked. Files are viewed and downloaded via short-lived, cryptographically signed **Presigned URLs**.
- **Zero Frontend Secrets**: AWS access keys, secret keys, and IAM roles are strictly managed server-side and never touch the browser.
- **Transparent Local Demo Mode**: Works completely offline out-of-the-box. Demo uploads are clearly labeled in the UI and never pretend to be uploaded to AWS S3.
- **Production Ready for Ubuntu AWS EC2**: Complete with automated installation (`setup.sh`), Apache reverse-proxy VirtualHost configuration, and Gunicorn systemd service.

---

## 🎨 Design System & Color Palette

CloudPix features a clean, responsive aesthetic adhering strictly to the following design palette:

| Color | Hex Code | Role in Interface |
| :--- | :--- | :--- |
| **Deep Plum** | `#400849` | Primary brand color, headers, primary buttons, high-contrast text |
| **Soft Orchid** | `#E7B0DE` | Secondary accent, button gradients, glowing borders, active badges |
| **Warm Lilac Surface** | `#F8F0F8` | Light page background, card surfaces, clean contrast |
| **Lavender Tint** | `#DCC5E8` | Card borders, dividers, badge backgrounds, pill filters |

---

## ✨ Features

- **Landing Page & Dashboard**: Hero section highlighting cloud security, live stats counters (total images, total storage, active engine, security window), and an instant health badge.
- **Drag-and-Drop & File Picker**: Interactive drop zone with visual dashed borders, hover highlights, and standard file browser support.
- **Live Preview Before Upload**: Real-time thumbnail preview, detected file format, and size validation before committing the upload.
- **Strict Format & Size Guard**: Supports `JPG`, `JPEG`, `PNG`, and `WEBP` formats with a strict **5 MB file size limit**.
- **Responsive Gallery**: Masonry and responsive grid layouts, card hover quick actions (preview, download, delete), and skeleton loading state.
- **Real-Time Search & Filters**: Client-side search by filename, filter pills by format (All, PNG, JPG/JPEG, WEBP), and multi-criteria sorting (Newest, Oldest, Largest, Smallest, Name).
- **Full-Size Preview Modal**: High-resolution image modal with an integrated metadata sidebar (filename, format, byte size, upload date, storage engine, and presigned access window).
- **Direct Download & Copy Link**: One-click download preserving original filenames and copyable presigned URLs with feedback tooltips.
- **Delete Confirmation Modal**: Confirmation dialog with permanent server-side file deletion.
- **Toast Notifications**: Floating alerts for uploads, deletions, link copying, and validation warnings.
- **Local Demo Mode**: Clearly labeled in the UI, storing files locally with zero AWS requirements.

---

## 🏗️ Architecture & Security Flow

```
                                      +------------------------------------+
                                      |      AWS Cloud Infrastructure      |
                                      |                                    |
[ User Browser ]                      |   +----------------------------+   |
       |                              |   |    Private S3 Bucket       |   |
       | 1. HTTP / HTTPS              |   |  - Block Public Access: ON |   |
       |    (Port 80 / 443)           |   |  - Presigned URLs (60m)    |   |
       v                              |   +-------------^--------------+   |
+--------------+                      |                 |                  |
| Apache 2.4   | (Reverse Proxy)      |                 | 3. Boto3         |
+------+-------+                      |                 |    (IAM Role)    |
       | 2. Proxy Pass (127.0.0.1:5000)|                |                  |
       v                              |   +-------------+--------------+   |
+--------------+                      |   | Ubuntu 22.04 / 24.04 LTS   |   |
| Gunicorn /   | -------------------->|   | AWS EC2 Instance           |   |
| Flask Backend|                      |   +----------------------------+   |
+--------------+                      +------------------------------------+
       |
       | (When S3 is unconfigured)
       v
+-------------------------------+
| Local Demo Storage            |
| backend/uploads/              |
| (100% Offline & Free)         |
+-------------------------------+
```

### Security Highlights
1. **Private S3 Buckets Only**: The AWS S3 bucket never has public read policies or open ACLs enabled.
2. **Time-Limited Presigned URLs**: Images are accessed via short-lived URLs cryptographically generated by Boto3 (default expiration: 3600 seconds).
3. **No Frontend Credential Leakage**: `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are never passed to the browser.
4. **EC2 IAM Role Integration**: On EC2, credentials are automatically resolved via the EC2 Instance Metadata Service (IMDS).

---

## 💻 Working Local Demo Mode Explained

CloudPix includes an integrated **Local Demo Mode** that allows complete local development without AWS credentials:

- **Automatic Detection**: When `STORAGE_MODE=local` (or when AWS credentials/bucket are not set), the server automatically enters Local Demo Mode.
- **Storage Location**: Uploaded images are stored in `backend/uploads/` and tracked in `backend/uploads/metadata.json`.
- **Local Streaming**: Images are streamed through `/api/images/raw/<key>` with proper MIME types and caching headers.
- **Clear UI Labeling**: The UI prominently displays a purple **"Local Demo Mode"** badge and an informational banner explaining that files are stored locally on disk—never pretending they are in AWS.

---

## 📁 Project Structure

```
CloudPix/
├── frontend/
│   ├── index.html                  # Semantic responsive markup & modal templates
│   ├── style.css                   # Custom CSS design system (#400849, #E7B0DE, etc.)
│   ├── script.js                   # Vanilla JS controller (API, drag-drop, modals)
│   └── assets/
│       ├── images/                 # Custom vector illustrations
│       │   ├── hero-illustration.svg
│       │   └── empty-gallery.svg
│       └── icons/                  # Scalable vector icons
│           ├── logo.svg
│           ├── upload-cloud.svg
│           ├── trash.svg
│           ├── download.svg
│           ├── eye.svg
│           ├── search.svg
│           ├── copy.svg
│           ├── alert-triangle.svg
│           └── check-circle.svg
├── backend/
│   ├── app.py                      # Flask REST API & static web server
│   ├── storage.py                  # S3 Boto3 & Local Demo Storage Manager
│   ├── config.py                   # Environment configuration & limits
│   ├── requirements.txt            # Python dependencies (Flask, Boto3, dotenv, etc.)
│   └── uploads/                    # Local demo uploads folder (.gitignore tracked)
├── deployment/
│   ├── aws-ec2-guide.md            # Step-by-step Ubuntu EC2 & IAM Role guide
│   ├── setup.sh                    # Automated production install script for Ubuntu
│   └── apache-config.conf          # Apache 2.4 reverse proxy VirtualHost config
├── screenshots/
│   └── README.md                   # Visual architecture blueprint and screenshot guide
├── .env.example                    # Environment template with comprehensive docs
├── .gitignore                      # Python, venv, secrets, and upload ignore rules
├── README.md                       # Comprehensive project documentation
└── LICENSE                         # MIT License
```

---

## 🚀 Windows Quickstart Guide

Run CloudPix locally on Windows with Python in just a few commands. No Node.js or React required!

### 1. Prerequisites
- **Python 3.9 or higher** (Python 3.10+ recommended)
- **PowerShell** or **Command Prompt**

### 2. Clone the Repository
```powershell
git clone https://github.com/your-username/CloudPix.git
cd CloudPix
```

### 3. Create and Activate Virtual Environment
```powershell
# Create the virtual environment
python -m venv venv

# Activate the virtual environment
.\venv\Scripts\Activate.ps1
```
> *Tip: If PowerShell displays a script execution policy restriction, run:*  
> `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`

### 4. Install Dependencies
```powershell
python -m pip install -r backend\requirements.txt
```

### 5. Set Up Configuration File
Copy the example configuration to `.env`:
```powershell
Copy-Item .env.example .env
```
*(By default, `.env` runs in `STORAGE_MODE=local`, which runs in Local Demo Mode with zero AWS configuration).*

### 6. Start the Server
```powershell
python backend\app.py
```

You will see:
```text
======================================================================
  CloudPix - Your Images, Your Cloud
  Storage Status: Local Demo Mode active (configured via STORAGE_MODE=local).
  Web Server: http://localhost:5000
======================================================================
```

### 7. Open in Your Browser
Open your browser and navigate to:
```
http://localhost:5000
```
- The frontend will load with the **"Local Demo Mode"** badge active.
- Drag and drop any image (JPG, PNG, WEBP &le; 5 MB) to test the upload, preview, search, download, and delete functionality!

---

## ☁️ Connecting AWS S3 Storage (When Ready)

When you are ready to connect a private AWS S3 bucket:

1. Open `.env` in your editor:
   ```env
   # Set storage mode
   STORAGE_MODE=auto

   # AWS S3 Settings
   S3_BUCKET_NAME=your-actual-bucket-name
   AWS_REGION=us-east-1

   # Your IAM User Credentials (Optional if running on EC2 with IAM Role)
   AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
   AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
   ```
2. Restart the Flask server:
   ```powershell
   python backend\app.py
   ```
3. CloudPix verifies bucket connectivity via `head_bucket`.
4. Refresh your browser at `http://localhost:5000`—the status badge will turn **Green** and display **"AWS S3 Connected"**!

---

## 🐧 Production Deployment: Ubuntu AWS EC2

CloudPix is engineered to deploy seamlessly on Ubuntu 22.04 or 24.04 LTS on AWS EC2.

### Summary Steps:
1. **Create Private S3 Bucket**: Block 100% of public access.
2. **Create IAM Role**: Attach policy granting `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, and `s3:ListBucket` to the bucket.
3. **Launch EC2 Instance**: Select Ubuntu, attach the IAM Role to the instance profile, and open ports **80** (HTTP) and **22** (SSH).
4. **Deploy with Automated Script**:
   ```bash
   git clone https://github.com/your-username/CloudPix.git /var/www/CloudPix
   cd /var/www/CloudPix
   chmod +x deployment/setup.sh
   sudo ./deployment/setup.sh
   ```
5. **Configure `.env`**: Set `S3_BUCKET_NAME=your-bucket-name`. Leave `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` **blank**—Boto3 will automatically use the EC2 IAM Role!
6. **Restart & Done**:
   ```bash
   sudo systemctl restart cloudpix
   ```

For comprehensive step-by-step instructions with screenshots and policy JSON, see [deployment/aws-ec2-guide.md](deployment/aws-ec2-guide.md).

---

## 🔌 API Reference

All API routes return standardized JSON payloads:

### 1. System Health Check
- **Endpoint**: `GET /api/health`
- **Description**: Returns system status, active storage mode, bucket name, and constraints.
- **Response `200 OK` (Local Demo Mode)**:
```json
{
  "status": "healthy",
  "storage_mode": "local",
  "is_s3_connected": false,
  "storage_label": "Local Demo Mode",
  "bucket_name": null,
  "region": null,
  "max_file_size_bytes": 5242880,
  "max_file_size_formatted": "5.0 MB",
  "allowed_extensions": ["jpeg", "jpg", "png", "webp"],
  "presigned_url_expiry_seconds": 3600,
  "server_time": "2026-10-31T10:15:00Z"
}
```

### 2. List Images
- **Endpoint**: `GET /api/images`
- **Description**: Returns all stored images with updated Presigned URLs or local stream URLs.
- **Response `200 OK`**:
```json
{
  "success": true,
  "count": 1,
  "storage_mode": "local",
  "storage_label": "Local Demo Storage",
  "images": [
    {
      "id": "e8d7a31b-7a5f-4d32-9cb4-927181c01579",
      "filename": "sunset_mountain.jpg",
      "format": "JPG",
      "mime_type": "image/jpeg",
      "size_bytes": 2415124,
      "size_formatted": "2.30 MB",
      "upload_date": "2026-10-31T10:12:00Z",
      "timestamp": 1793441520,
      "url": "/api/images/raw/e8d7a31b-7a5f-4d32-9cb4-927181c01579_sunset_mountain.jpg",
      "storage_mode": "local",
      "is_demo": true
    }
  ]
}
```

### 3. Upload Image
- **Endpoint**: `POST /api/upload`
- **Content-Type**: `multipart/form-data`
- **Body**: `image` (binary file, &le; 5 MB)
- **Response `201 Created`**:
```json
{
  "success": true,
  "message": "Image 'sunset_mountain.jpg' uploaded successfully.",
  "image": {
    "id": "e8d7a31b-7a5f-4d32-9cb4-927181c01579",
    "filename": "sunset_mountain.jpg",
    "format": "JPG",
    "size_bytes": 2415124,
    "size_formatted": "2.30 MB",
    "upload_date": "2026-10-31T10:12:00Z",
    "url": "/api/images/raw/e8d7a31b-7a5f-4d32-9cb4-927181c01579_sunset_mountain.jpg",
    "storage_mode": "local",
    "is_demo": true
  }
}
```

### 4. Delete Image
- **Endpoint**: `DELETE /api/images/<image_id>`
- **Description**: Deletes image object from storage and removes metadata.
- **Response `200 OK`**:
```json
{
  "success": true,
  "message": "Image 'sunset_mountain.jpg' deleted from Local Demo storage.",
  "deleted_id": "e8d7a31b-7a5f-4d32-9cb4-927181c01579"
}
```

---

## 📸 Screenshots & UI Blueprint

See [screenshots/README.md](screenshots/README.md) for capturing production screenshots. Below is the architectural blueprint of the CloudPix interface:

```
+---------------------------------------------------------------------------------+
|  [Logo] CloudPix    Home   Features   Dashboard   Architecture   [● Demo] [Upload]|
+---------------------------------------------------------------------------------+
|                                                                                 |
|       Your Images, Your Cloud.                              [ Cloud Engine ]    |
|       Modern S3 Storage & Presigned URLs                     [ Illustration ]   |
|       [Go to Dashboard]   [How It Works]                                        |
|                                                                                 |
+---------------------------------------------------------------------------------+
|  [●] Storage Engine: Local Demo Mode (or AWS S3 Bucket: bucket-name)           |
+---------------------------------------------------------------------------------+
|  Total Images: 12   | Storage: 14.2 MB | Active: Local Demo | Security: 60m     |
+---------------------------------------------------------------------------------+
|  +---------------------------------------------------------------------------+  |
|  |                        [ Cloud Upload Dropzone ]                          |  |
|  |                 Drag & drop your images here or browse                    |  |
|  |                    PNG, JPG, JPEG, WEBP (Max 5 MB)                        |  |
|  +---------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------+
|  [Search...]   [All][PNG][JPG][WEBP]   Sort: [Newest v]   [Grid][List]   [↻]   |
+---------------------------------------------------------------------------------+
|  +----------------+  +----------------+  +----------------+  +----------------+ |
|  | [Thumbnail]    |  | [Thumbnail]    |  | [Thumbnail]    |  | [Thumbnail]    | |
|  | PNG  Local     |  | WEBP Local     |  | JPG  Local     |  | PNG  Local     | |
|  | photo_01.png   |  | banner.webp    |  | avatar.jpg     |  | chart.png      | |
|  | 2.1 MB • 2m    |  | 840 KB • 10m   |  | 1.4 MB • 1h    |  | 350 KB • 1d    | |
|  +----------------+  +----------------+  +----------------+  +----------------+ |
+---------------------------------------------------------------------------------+
```

---

## 📄 License

This project is licensed under the **MIT License** – see the [LICENSE](LICENSE) file for details.
