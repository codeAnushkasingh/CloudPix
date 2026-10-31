# CloudPix – Complete AWS EC2 & S3 Deployment Guide

This guide walks you step-by-step through deploying **CloudPix – Your Images, Your Cloud** to an **Ubuntu AWS EC2** virtual server connected to a private **AWS S3** bucket.

---

## Architecture Overview

```
                                      +-------------------------------+
                                      |     AWS Cloud Infrastructure  |
                                      |                               |
[ User Browser ]                      |   +-----------------------+   |
       |                              |   |    Private S3 Bucket  |   |
       | 1. HTTP/HTTPS (Port 80/443)  |   |  - Block Public: ON   |   |
       v                              |   |  - Presigned URLs     |   |
+--------------+                      |   +-----------^-----------+   |
| Apache 2.4   | (Reverse Proxy)      |               |               |
+------+-------+                      |               | 3. Boto3      |
       | 2. Proxy Pass (127.0.0.1:5000)|              |    (IAM Role) |
       v                              |               |               |
+--------------+                      |   +-----------+-----------+   |
| Gunicorn /   | -------------------->|   | Ubuntu 22.04 / 24.04  |   |
| Flask Backend|                      |   | EC2 Instance          |   |
+--------------+                      |   +-----------------------+   |
                                      +-------------------------------+
```

---

## Step 1: Create a Private AWS S3 Bucket

1. Sign in to the **AWS Management Console** and navigate to **Amazon S3**.
2. Click **Create bucket**.
3. Configure the bucket settings:
   - **Bucket name**: Enter a globally unique name (e.g., `cloudpix-vault-yourname`).
   - **AWS Region**: Choose your preferred region (e.g., `us-east-1` or `eu-west-1`).
   - **Block Public Access settings for this bucket**:
     - Check **Block *all* public access** (IMPORTANT: Keep this enabled! CloudPix uses secure presigned URLs generated server-side, so your bucket remains completely private).
   - **Bucket Versioning**: Optional (Disabled by default).
   - **Default encryption**: Enable (Amazon S3 managed keys `SSE-S3`).
4. Click **Create bucket**.

### (Optional) S3 CORS Configuration
If you plan to perform cross-origin downloads from another domain, configure CORS under **Bucket -> Permissions -> Cross-origin resource sharing (CORS)**:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## Step 2: Create an EC2 IAM Role (Least Privilege)

Using an **IAM Role** attached to your EC2 instance is an AWS security best practice: **you do not need to store secret keys in your `.env` file on the server**. Boto3 automatically retrieves temporary session credentials from the EC2 Instance Metadata Service (IMDS).

1. Go to **AWS IAM Console** -> **Roles** -> **Create role**.
2. Select **AWS service** -> Choose **EC2** -> Click **Next**.
3. Under **Add permissions**, click **Create policy**.
4. Switch to the **JSON** tab and paste the following least-privilege policy (replace `your-cloudpix-bucket-name` with your actual bucket name):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudPixS3BucketActions",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": "arn:aws:s3:::your-cloudpix-bucket-name"
    },
    {
      "Sid": "CloudPixS3ObjectActions",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::your-cloudpix-bucket-name/*"
    }
  ]
}
```

5. Name the policy `CloudPixS3Policy` and click **Create policy**.
6. Back in the role creation tab, search for `CloudPixS3Policy`, check it, and click **Next**.
7. Name the role `CloudPixEC2Role` and click **Create role**.

---

## Step 3: Launch an Ubuntu EC2 Instance

1. Navigate to **EC2 Dashboard** -> Click **Launch Instance**.
2. **Name**: `CloudPix-Server`.
3. **Application and OS Images**: **Ubuntu Server 22.04 LTS** or **24.04 LTS** (64-bit x86).
4. **Instance type**: `t2.micro` or `t3.micro` (Free Tier eligible).
5. **Key pair**: Select an existing key pair or create a new `.pem` key pair to connect via SSH.
6. **Network settings (Security Group)**:
   - Check **Allow SSH traffic from** -> Your IP or Anywhere.
   - Check **Allow HTTP traffic from the internet** (Port 80).
   - Check **Allow HTTPS traffic from the internet** (Port 443).
7. **Advanced Details**:
   - Locate **IAM instance profile** and select `CloudPixEC2Role` (created in Step 2).
8. Click **Launch instance**.

---

## Step 4: Connect & Deploy CloudPix

### 4.1 SSH into your EC2 Instance
```bash
ssh -i /path/to/your-key.pem ubuntu@<YOUR_EC2_PUBLIC_IP>
```

### 4.2 Clone or Transfer the Repository
```bash
# Clone the repository onto EC2
git clone https://github.com/your-username/CloudPix.git /var/www/CloudPix
cd /var/www/CloudPix
```

### 4.3 Run the Automated Setup Script
We've provided a fully automated bash script `deployment/setup.sh` that updates Ubuntu, installs Apache, creates a Python virtual environment, installs dependencies, configures the Gunicorn systemd service, and sets up Apache reverse proxying:

```bash
chmod +x deployment/setup.sh
sudo ./deployment/setup.sh
```

### 4.4 Configure `.env` on EC2
Edit the `.env` file created by the setup script:

```bash
nano /var/www/CloudPix/.env
```

Set your configuration values:
```env
FLASK_ENV=production
FLASK_DEBUG=False
PORT=5000
SECRET_KEY=generate-a-strong-random-key-here

STORAGE_MODE=auto
S3_BUCKET_NAME=your-cloudpix-bucket-name
AWS_REGION=us-east-1

# Leave these BLANK if you attached the IAM Role in Step 2!
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

Save and exit (`Ctrl + O`, `Enter`, `Ctrl + X`).

### 4.5 Restart the CloudPix Service
Whenever you change `.env`, reload the Gunicorn service:

```bash
sudo systemctl restart cloudpix
```

### 4.6 Verify Health Status
Check if the API reports that AWS S3 is active:

```bash
curl http://localhost/api/health
```

Expected output:
```json
{
  "status": "healthy",
  "storage_mode": "s3",
  "is_s3_connected": true,
  "storage_label": "AWS S3 (your-cloudpix-bucket-name)",
  "bucket_name": "your-cloudpix-bucket-name",
  "region": "us-east-1"
}
```

---

## Step 5: Enable Free HTTPS with Let's Encrypt (Certbot)

If you have a domain name pointed to your EC2 Public IP address (e.g., `images.yourdomain.com`):

1. Install Certbot for Apache:
   ```bash
   sudo apt-get install -y certbot python3-certbot-apache
   ```
2. Request and install your SSL certificate:
   ```bash
   sudo certbot --apache -d images.yourdomain.com
   ```
3. Certbot will automatically configure the SSL VirtualHost and set up automatic renewal!

---

## Step 6: Operations & Troubleshooting

### Useful Management Commands
| Goal | Command |
| :--- | :--- |
| **Check App Service Status** | `sudo systemctl status cloudpix` |
| **Restart CloudPix Backend** | `sudo systemctl restart cloudpix` |
| **View Live Backend Logs** | `sudo journalctl -u cloudpix -f` |
| **Check Apache Status** | `sudo systemctl status apache2` |
| **View Apache Error Logs** | `sudo tail -f /var/log/apache2/cloudpix_error.log` |
| **Test S3 Permissions from EC2** | `aws s3 ls s3://your-cloudpix-bucket-name` |

### Common Issues & Solutions
1. **Status badge shows "Local Demo Mode" instead of "AWS S3":**
   - Check that `S3_BUCKET_NAME` in `/var/www/CloudPix/.env` matches your bucket name exactly.
   - Verify that the IAM Role `CloudPixEC2Role` is attached to your EC2 instance under **Actions -> Security -> Modify IAM role**.
2. **"413 Request Entity Too Large":**
   - CloudPix is limited to 5 MB images. Apache's `LimitRequestBody 5242880` in `deployment/apache-config.conf` enforces this. If you wish to allow larger images, adjust both `LimitRequestBody` and `MAX_CONTENT_LENGTH` in `.env`.
3. **Cannot connect via Browser:**
   - Verify that your EC2 Security Group allows inbound traffic on **Port 80 (HTTP)** and **Port 443 (HTTPS)** from `0.0.0.0/0`.

