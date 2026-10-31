#!/usr/bin/env bash
# ==============================================================================
# CloudPix - Automated EC2 Setup Script for Ubuntu 22.04 / 24.04 LTS
# ==============================================================================
# Usage:
#   chmod +x setup.sh
#   sudo ./setup.sh
# ==============================================================================

set -e

# Color helpers
RED='\033[0;31m'
GREEN='\033[0;32m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${PURPLE}====================================================================${NC}"
echo -e "${PURPLE}        CloudPix - Automated Production Deployment for AWS EC2       ${NC}"
echo -e "${PURPLE}====================================================================${NC}"

# 1. Verify sudo / root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Please run this script as root or with sudo.${NC}"
  exit 1
fi

APP_USER="${SUDO_USER:-ubuntu}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo -e "${CYAN}[1/7] Updating system packages and installing prerequisites...${NC}"
apt-get update -y
apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    apache2 \
    curl \
    git \
    ufw

echo -e "${CYAN}[2/7] Enabling required Apache modules...${NC}"
a2enmod proxy
a2enmod proxy_http
a2enmod headers
a2enmod rewrite

echo -e "${CYAN}[3/7] Setting up Python virtual environment...${NC}"
cd "$APP_DIR"
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo -e "${GREEN}Created Python virtual environment in ${APP_DIR}/venv${NC}"
fi

# Upgrade pip and install requirements
"$APP_DIR/venv/bin/pip" install --upgrade pip
"$APP_DIR/venv/bin/pip" install -r "$APP_DIR/backend/requirements.txt"
"$APP_DIR/venv/bin/pip" install gunicorn

echo -e "${CYAN}[4/7] Checking environment configuration (.env)...${NC}"
if [ ! -f "$APP_DIR/.env" ]; then
    echo -e "${PURPLE}Creating .env from .env.example...${NC}"
    cp "$APP_DIR/.env.example" "$APP_DIR/.env"
    echo -e "${GREEN}Created .env file. Please review your S3_BUCKET_NAME and settings.${NC}"
fi

# Ensure local upload directories exist
mkdir -p "$APP_DIR/backend/uploads"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
chmod -R 755 "$APP_DIR/backend/uploads"

echo -e "${CYAN}[5/7] Creating Systemd service for Gunicorn (cloudpix.service)...${NC}"
cat <<EOF > /etc/systemd/system/cloudpix.service
[Unit]
Description=CloudPix Image Platform Gunicorn Application Server
After=network.target

[Service]
User=$APP_USER
Group=www-data
WorkingDirectory=$APP_DIR/backend
Environment="PATH=$APP_DIR/venv/bin"
EnvironmentFile=$APP_DIR/.env
ExecStart=$APP_DIR/venv/bin/gunicorn --workers 3 --bind 127.0.0.1:5000 app:app
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable cloudpix
systemctl restart cloudpix

echo -e "${CYAN}[6/7] Configuring Apache VirtualHost...${NC}"
cp "$APP_DIR/deployment/apache-config.conf" /etc/apache2/sites-available/cloudpix.conf

# Disable default site, enable cloudpix site
a2dissite 000-default.conf || true
a2ensite cloudpix.conf

# Validate Apache configuration syntax
apache2ctl configtest
systemctl restart apache2

echo -e "${CYAN}[7/7] Configuring firewall (UFW) rules...${NC}"
if ufw status | grep -q "Status: active"; then
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw reload
    echo -e "${GREEN}Firewall rules updated for HTTP (80) and HTTPS (443).${NC}"
fi

echo -e "\n${GREEN}====================================================================${NC}"
echo -e "${GREEN}  ✓ CloudPix successfully deployed and running!                    ${NC}"
echo -e "${GREEN}====================================================================${NC}"
echo -e "Service Status:  systemctl status cloudpix"
echo -e "Apache Logs:     tail -f /var/log/apache2/cloudpix_error.log"
echo -e "Application:     curl http://localhost/api/health"
echo -e "\n${PURPLE}Next Steps:${NC}"
echo -e "1. Edit ${APP_DIR}/.env to configure your S3_BUCKET_NAME and AWS_REGION."
echo -e "2. If using an EC2 IAM Role, no secret keys are needed!"
echo -e "3. Restart the service after changing .env: sudo systemctl restart cloudpix"
echo -e "4. Access your server in your browser using your EC2 Public IP or Domain."

