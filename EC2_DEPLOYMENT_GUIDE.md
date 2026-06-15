# ASCII Framer - EC2 Deployment Guide

## Prerequisites
- EC2 instance (Ubuntu 22.04 or Amazon Linux 2)
- At least 1 GB RAM, 2 GB storage
- Security group with ports 80, 443, 3000, 5000 open
- Public IP or domain name

## Step 1: SSH into EC2 Instance

```bash
ssh -i your-key.pem ubuntu@your-ec2-public-ip
# or for Amazon Linux 2:
# ssh -i your-key.pem ec2-user@your-ec2-public-ip
```

## Step 2: Run Setup Script

```bash
curl -O https://raw.githubusercontent.com/yourusername/repo/main/ec2-setup.sh
chmod +x ec2-setup.sh
./ec2-setup.sh
```

Or manually install Docker and Docker Compose:

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y docker.io docker-compose git

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

## Step 3: Clone and Deploy

```bash
mkdir -p ~/apps
cd ~/apps

# Clone your repository
git clone <your-repo-url> ascii-framer
cd ascii-framer

# Confirm this is the real app, not the hello-ec2 demo.
ls
```

You should see `backend`, `ascii-framer`, and `docker-compose.prod.yml`. If you only see `index.js` and a small Express app that says "Hello from EC2!", you are in the demo project and S3 uploads will not work.

Stop the demo container if it is running:

```bash
docker stop hello-ec2
```

Create the production environment file:

```bash

# Configure upload storage. Do not add AWS access keys on EC2.
cat > .env <<'EOF'
AWS_REGION=ap-southeast-2
S3_UPLOAD_BUCKET=nino87
S3_UPLOAD_PREFIX=ascii-framer/uploads
S3_PUBLIC_BASE_URL=
EOF

# Start services
docker-compose -f docker-compose.prod.yml up -d --build

# Check status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f backend
```

## Step 3a: S3 Upload Permissions

Attach an IAM role to the EC2 instance with permission to write uploaded files to the S3 bucket. The backend uses the AWS SDK default credential chain, so Amazon Linux/EC2 should use the instance profile instead of API keys.

Simple setup:

1. Open AWS Console -> IAM -> Roles -> Create role.
2. Select trusted entity: AWS service.
3. Select use case: EC2.
4. Attach the S3 policy below.
5. Open AWS Console -> EC2 -> Instances.
6. Select the app instance.
7. Actions -> Security -> Modify IAM role.
8. Choose the new IAM role.

Profile files are stored under `ascii-framer/uploads/users/<profile-id>/` with `audio/`, `art/`, and `metadata/` folders.

Minimum policy for profile uploads and gallery loading:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::nino87",
      "Condition": {
        "StringLike": {
          "s3:prefix": ["ascii-framer/uploads/users/*"]
        }
      }
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::nino87/ascii-framer/uploads/*"
    }
  ]
}
```

After starting the backend, check the logs:

```bash
docker logs -f ascii-framer-backend
```

Expected message:

```text
S3 uploads enabled: s3://nino87/ascii-framer/uploads
AWS credentials: using the default AWS SDK provider chain
```

Upload a file in the app, then check this S3 location:

```text
s3://nino87/ascii-framer/uploads/users/
```

Common issues:

- `Missing S3_UPLOAD_BUCKET environment variable`: the `.env` file is missing `S3_UPLOAD_BUCKET=nino87`.
- `AccessDenied`: the EC2 IAM role is missing the S3 policy or is not attached to the instance.
- `NoSuchBucket`: the bucket name is wrong.
- Region errors: keep `AWS_REGION=ap-southeast-2` for the Sydney bucket.

If the backend runs in Docker and logs show missing AWS credentials, update the EC2 instance metadata options so `HttpPutResponseHopLimit` is `2`. This allows containers on the bridge network to reach the instance profile metadata service.

## Step 4: Configure Security & DNS (Optional)

### Set up Nginx Reverse Proxy

The production Compose file mounts the checked-in `nginx.conf` from the project root. If you want a custom reverse proxy, edit `/home/ubuntu/apps/ascii-framer/nginx.conf`:

```nginx
upstream frontend {
    server frontend:3000;
}

upstream backend {
    server backend:5000;
}

server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/ {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Add Nginx to docker-compose.yml (see nginx-docker-compose.yml)

### Install SSL Certificate (Let's Encrypt)

```bash
docker run --rm -it \
  -v /home/ubuntu/apps/certs:/etc/letsencrypt \
  -p 80:80 \
  certbot/certbot certonly --standalone \
  -d your-domain.com
```

## Step 5: Set Up Auto-Start on Reboot

Create `/etc/systemd/system/ascii-framer.service`:

```ini
[Unit]
Description=ASCII Framer Docker Compose Service
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/ubuntu/apps/ascii-framer
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
User=ubuntu

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable ascii-framer
sudo systemctl start ascii-framer
```

## Step 6: Monitoring & Logs

```bash
# View all logs
docker-compose logs -f

# View specific service
docker-compose logs -f backend
docker-compose logs -f frontend

# Check resources
docker stats

# Update containers
docker-compose pull
docker-compose up -d
```

## Troubleshooting

### Port already in use
```bash
# Change ports in docker-compose.yml
# Or kill process on port
sudo lsof -i :3000
sudo kill -9 <PID>
```

### Out of disk space
```bash
# Check space
df -h

# Clean up Docker
docker system prune -a
```

### Containers keep restarting
```bash
# Check logs
docker-compose logs -f
docker-compose ps
```

## Security Best Practices

1. **Use environment variables for secrets**
   - Create `.env` file (add to `.gitignore`)
   - Reference in docker-compose.yml

2. **Enable firewall**
   ```bash
   sudo ufw enable
   sudo ufw allow 22/tcp
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   ```

3. **Set up automated backups**

4. **Monitor logs regularly**

5. **Keep Docker and dependencies updated**
   ```bash
   sudo apt-get update && sudo apt-get upgrade -y
   docker-compose pull
   docker-compose up -d
   ```

## Additional Commands

```bash
# Restart services
docker-compose restart

# Rebuild images
docker-compose build --no-cache

# Remove volumes
docker-compose down -v

# Run commands inside container
docker-compose exec backend npm install new-package
docker-compose exec frontend npm install new-package

# SSH into container
docker-compose exec backend sh
docker-compose exec frontend sh
```
