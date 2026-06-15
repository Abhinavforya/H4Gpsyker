#!/bin/bash

# ASCII Framer EC2 Deployment Setup Script
# Run this on a fresh EC2 instance (Ubuntu 22.04 or Amazon Linux 2)

set -e

echo "=========================================="
echo "ASCII Framer - EC2 Setup Script"
echo "=========================================="

# Update system
echo "Updating system packages..."
sudo apt-get update -y
sudo apt-get upgrade -y

# Install Docker
echo "Installing Docker..."
sudo apt-get install -y docker.io

# Install Docker Compose
echo "Installing Docker Compose..."
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Add current user to docker group
echo "Configuring Docker permissions..."
sudo usermod -aG docker $USER

# Install Git
echo "Installing Git..."
sudo apt-get install -y git

# Create app directory
echo "Creating application directory..."
mkdir -p ~/apps
cd ~/apps

# Clone repository (replace with your repo URL)
echo "Cloning application repository..."
# git clone YOUR_REPO_URL ascii-framer

echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Clone or upload your project: git clone <repo-url> ascii-framer"
echo "2. Navigate to project: cd ascii-framer"
echo "3. Start containers: docker-compose up -d"
echo "4. Check status: docker-compose ps"
echo "5. Access frontend: http://<EC2_PUBLIC_IP>:3000"
echo "6. Backend API: http://<EC2_PUBLIC_IP>:5000/api/health"
echo ""
echo "To enable Auto-start on reboot:"
echo "  - Create a systemd service (see ec2-systemd-service.conf)"
echo ""
echo "To view logs:"
echo "  - docker-compose logs -f"
echo ""
