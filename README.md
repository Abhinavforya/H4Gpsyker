# ASCII Framer - Full Stack Docker Deployment

A complete React frontend + Node.js backend application, dockerized and ready for EC2 deployment.

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────────┐
│   Frontend  │◄────►│  Nginx/Node  │◄────►│  Backend API    │
│ (React/Vite)│      │   Reverse    │      │  (Express.js)   │
│   Port 3000 │      │  Proxy 80    │      │   Port 5000     │
└─────────────┘      └──────────────┘      └─────────────────┘
   Docker Container    Docker Container    Docker Container
```

## Project Structure

```
ascii-framer/
├── ascii-framer/              # React frontend (Vite)
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── .env                   # Local dev config
│   ├── .env.production        # Production config
│   ├── src/
│   │   ├── App.jsx           # Main component with backend API calls
│   │   ├── AsciiArt.jsx
│   │   ├── processor.js
│   │   ├── db.js
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── package.json
│   └── index.html
│
├── backend/                   # Express.js backend
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── server.js             # Express server with API routes
│   ├── package.json
│   └── .env.example
│
├── docker-compose.yml         # Local development orchestration
├── docker-compose.prod.yml    # Production with Nginx
├── nginx.conf                 # Reverse proxy configuration
│
├── .github/
│   └── workflows/
│       └── deploy.yml        # GitHub Actions CI/CD pipeline
│
├── EC2_DEPLOYMENT_GUIDE.md   # Detailed deployment instructions
├── QUICKSTART.md             # Quick start guide
├── .gitignore
└── README.md                 # This file
```

## Features

✅ **React Frontend** - Modern UI with Vite bundler  
✅ **Express Backend** - REST API with CORS support  
✅ **Docker Support** - Multi-stage builds, optimized images  
✅ **Docker Compose** - Single command to run both services  
✅ **Nginx Reverse Proxy** - Production-ready configuration  
✅ **EC2 Ready** - Deployment scripts and guides  
✅ **CI/CD Pipeline** - GitHub Actions for automated deployment  
✅ **Health Checks** - Container monitoring and restart policies  

## Quick Start

### Local Development

```bash
# Clone and navigate
git clone <repo> ascii-framer
cd ascii-framer

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

**Access:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000/api/health

### Production (EC2)

```bash
# On EC2 instance
git clone <repo> ~/apps/ascii-framer
cd ~/apps/ascii-framer

# Start with production config
docker-compose -f docker-compose.prod.yml up -d

# Access via domain or public IP on port 80
```

## API Endpoints

### Health Check
```
GET /api/health
→ { status: "Backend is running", timestamp: "2024-..." }
```

### Process Data
```
POST /api/process
Body: {
  "input": "your text or data",
  "mode": "text"
}
→ { input, mode, processed: true, data: ... }
```

### Save Snapshot
```
POST /api/save-snapshot
Body: { "snapshot": {...} }
→ { success: true, id: 123, message: "Snapshot saved" }
```

### Get Snapshots
```
GET /api/snapshots
→ { snapshots: [], total: 0 }
```

## Docker Commands

```bash
# Build images
docker-compose build

# Start services in background
docker-compose up -d

# View running containers
docker-compose ps

# View logs (all services)
docker-compose logs -f

# View logs (specific service)
docker-compose logs -f backend
docker-compose logs -f frontend

# Execute command in container
docker-compose exec backend npm install package-name
docker-compose exec frontend npm install package-name

# SSH into container
docker-compose exec backend sh
docker-compose exec frontend sh

# Stop services
docker-compose down

# Remove volumes (warning: data loss)
docker-compose down -v

# Rebuild without cache
docker-compose build --no-cache
docker-compose up -d
```

## Environment Variables

### Frontend (.env)
```
VITE_API_URL=http://localhost:5000
```

### Frontend (.env.production)
```
VITE_API_URL=/api
```

### Backend (.env)
```
PORT=5000
NODE_ENV=development
```

### AWS Access for S3 Uploads
- Use an EC2 IAM role with S3 write access
- Set the bucket, region, and prefix in [backend/awsConfig.js](backend/awsConfig.js)
- No AWS access keys are required in `.env`

## Deployment Steps

### 1. Prepare EC2 Instance
```bash
# SSH into instance
ssh -i key.pem ubuntu@your-ec2-ip

# Run setup (if available)
chmod +x ec2-setup.sh
./ec2-setup.sh
```

### 2. Clone Repository
```bash
mkdir -p ~/apps
cd ~/apps
git clone <your-repo> ascii-framer
cd ascii-framer
```

### 3. Configure Environment
```bash
# Create .env file with production values
cp backend/.env.example backend/.env
# Edit as needed: nano backend/.env
```

### 4. Start Services
```bash
# Using production config with Nginx
docker-compose -f docker-compose.prod.yml up -d

# Or standard config
docker-compose up -d
```

### 5. Verify Deployment
```bash
# Check containers
docker-compose ps

# Check logs
docker-compose logs -f

# Test API
curl http://your-ec2-ip:5000/api/health
```

### 6. Set Up Auto-Start (Optional)
See [EC2_DEPLOYMENT_GUIDE.md](EC2_DEPLOYMENT_GUIDE.md) for systemd service setup.

## GitHub Actions (CI/CD)

Automatic deployment on every push to `main` branch.

### Setup Secrets
Add to your GitHub repo (Settings → Secrets and variables → Actions):
- `EC2_HOST` - Your EC2 public IP
- `EC2_USER` - SSH user (ubuntu or ec2-user)
- `EC2_PRIVATE_KEY` - Your EC2 SSH private key

### Deploy
```bash
git push origin main
# GitHub Actions will automatically build and deploy!
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Port already in use | Change ports in docker-compose.yml or: `sudo lsof -i :3000 && sudo kill -9 <PID>` |
| Cannot connect to backend | Check: `docker-compose ps` and `docker-compose logs -f backend` |
| Images won't build | Clear cache: `docker-compose build --no-cache` |
| Permission denied | Add to docker group: `sudo usermod -aG docker $USER` |
| Out of disk space | Clean up: `docker system prune -a` |
| Container keeps restarting | Check logs: `docker-compose logs -f` |

## Performance Tips

- Use `.dockerignore` to exclude unnecessary files
- Multi-stage builds to reduce image size
- Environment-specific configurations (.env files)
- Health checks for container monitoring
- Resource limits in docker-compose.yml

## Security Best Practices

1. **Never commit secrets** - Use .env files and .gitignore
2. **Use environment variables** - For API keys, passwords, etc.
3. **Enable firewall** - Restrict SSH and ports
4. **SSL/TLS** - Use Let's Encrypt with Nginx
5. **Update regularly** - Keep Docker, images, and dependencies updated
6. **Security scanning** - Check for vulnerabilities:
   ```bash
   docker scan ascii-framer-backend
   docker scan ascii-framer-frontend
   ```

## Scaling & Production

For production deployments:

1. **Use managed container orchestration** - AWS ECS, EKS, or GKE
2. **Set resource limits** - Prevent runaway processes
3. **Configure auto-scaling** - Based on metrics
4. **Use CloudWatch/DataDog** - For monitoring and alerts
5. **Database** - Add persistent data layer (PostgreSQL, MongoDB)
6. **CDN** - Cache static assets with CloudFront
7. **Domain & SSL** - Custom domain with HTTPS

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
- [AWS EC2 Guide](https://docs.aws.amazon.com/ec2/)
- [Nginx Configuration](https://nginx.org/en/docs/)
- [Express.js Guide](https://expressjs.com/)
- [React Documentation](https://react.dev/)

## License

MIT

## Support

For issues or questions:
1. Check [EC2_DEPLOYMENT_GUIDE.md](EC2_DEPLOYMENT_GUIDE.md)
2. Check [QUICKSTART.md](QUICKSTART.md)
3. Review logs: `docker-compose logs -f`
4. Open an issue on GitHub

---

**Made with ❤️ for cloud deployment**
