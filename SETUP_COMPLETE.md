# Setup Complete: React + Node.js Full Stack with Docker & EC2

## ✅ What's Been Created

### 1. **Backend (Node.js + Express)**
- ✅ `/backend/server.js` - Express server with API endpoints
- ✅ `/backend/package.json` - Dependencies and scripts
- ✅ `/backend/Dockerfile` - Production-ready Docker build
- ✅ `/backend/.env.example` - Environment variables template
- ✅ `/backend/.dockerignore` - Docker build optimization

**Features:**
- REST API endpoints for processing and data management
- CORS enabled for frontend communication
- Health check endpoint
- Error handling middleware

### 2. **Frontend (React + Vite)**
- ✅ Updated `/ascii-framer/src/App.jsx` - Backend API integration
- ✅ `/ascii-framer/Dockerfile` - Multi-stage Docker build
- ✅ `/ascii-framer/.env` - Local development config
- ✅ `/ascii-framer/.env.production` - Production config
- ✅ `/ascii-framer/.dockerignore` - Build optimization

**Features:**
- Vite for fast development
- React with Framer Motion
- Backend API integration
- Environment-based configuration

### 3. **Docker Configuration**
- ✅ `/docker-compose.yml` - Local development orchestration
- ✅ `/docker-compose.prod.yml` - Production with Nginx
- ✅ `/nginx.conf` - Reverse proxy configuration
- ✅ Multi-stage builds for optimized images

### 4. **EC2 Deployment**
- ✅ `/ec2-setup.sh` - Automated EC2 setup script
- ✅ `/EC2_DEPLOYMENT_GUIDE.md` - Comprehensive deployment guide
- ✅ GitHub Actions CI/CD pipeline (`.github/workflows/deploy.yml`)
- ✅ Systemd service configuration instructions

### 5. **Documentation**
- ✅ `/README.md` - Complete project documentation
- ✅ `/QUICKSTART.md` - Quick start guide with common commands
- ✅ `/EC2_DEPLOYMENT_GUIDE.md` - Detailed deployment instructions
- ✅ `/Makefile` - Convenient command shortcuts

### 6. **Project Configuration**
- ✅ `/.gitignore` - Git ignore rules
- ✅ Health checks configured
- ✅ Auto-restart policies enabled
- ✅ Network isolation with Docker networks

---

## 🚀 Quick Start

### Local Development
```bash
# Navigate to project
cd /home/abhinav/H4G

# Option 1: Using make (easiest)
make install
make build
make up

# Option 2: Using docker-compose directly
docker-compose up -d

# View logs
docker-compose logs -f

# Access:
# - Frontend: http://localhost:3000
# - Backend: http://localhost:5000/api/health
```

### Stop Services
```bash
make down
# or
docker-compose down
```

---

## 📊 Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    EC2 Instance                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌────────────────────────────────────────────────┐    │
│  │         Docker Container Network               │    │
│  │                                                │    │
│  │  ┌──────────────┐    ┌──────────────┐         │    │
│  │  │   Frontend   │    │   Backend    │         │    │
│  │  │  React/Vite │◄──►│ Express.js   │         │    │
│  │  │  Port: 3000 │    │ Port: 5000   │         │    │
│  │  └──────────────┘    └──────────────┘         │    │
│  │                                                │    │
│  │  ┌──────────────────────────────────────────┐ │    │
│  │  │  Nginx Reverse Proxy (Production)        │ │    │
│  │  │  Routes traffic to frontend/backend      │ │    │
│  │  │  Port: 80/443                            │ │    │
│  │  └──────────────────────────────────────────┘ │    │
│  │                                                │    │
│  └────────────────────────────────────────────────┘    │
│                                                         │
│  Security Groups: Allow ports 80, 443, 3000, 5000    │
│                                                         │
└─────────────────────────────────────────────────────────┘
                          ▲
                          │
                  Public IP / Domain
```

---

## 📁 Project Structure

```
/home/abhinav/H4G/
│
├── README.md                    # Main documentation
├── QUICKSTART.md               # Quick reference
├── EC2_DEPLOYMENT_GUIDE.md     # Deployment guide
├── Makefile                    # Command shortcuts
├── .gitignore                  # Git configuration
│
├── ascii-framer/               # React Frontend
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── .env                    # Local dev
│   ├── .env.production         # Production
│   ├── package.json
│   ├── index.html
│   └── src/
│       ├── App.jsx             # Updated with API calls
│       ├── main.jsx
│       ├── AsciiArt.jsx
│       ├── processor.js
│       ├── db.js
│       └── styles.css
│
├── backend/                    # Node.js Backend
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── server.js               # Express API
│   ├── package.json
│   └── .env.example
│
├── docker-compose.yml          # Dev orchestration
├── docker-compose.prod.yml     # Prod with Nginx
├── nginx.conf                  # Reverse proxy
├── ec2-setup.sh               # EC2 automation
│
└── .github/
    └── workflows/
        └── deploy.yml          # GitHub Actions CI/CD
```

---

## 🔌 API Endpoints

All endpoints are relative to `/api` in production:

```
GET  /api/health              Health check
POST /api/process             Process data
POST /api/save-snapshot       Save snapshot
GET  /api/snapshots           Retrieve snapshots
```

**Example Usage:**
```javascript
// Frontend code
const response = await fetch('/api/process', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ input: 'text', mode: 'text' })
});
```

---

## 🐳 Docker Commands Reference

| Command | Purpose |
|---------|---------|
| `docker-compose up -d` | Start all services |
| `docker-compose down` | Stop all services |
| `docker-compose logs -f` | Stream logs |
| `docker-compose ps` | List containers |
| `docker-compose build` | Build images |
| `docker-compose exec backend sh` | SSH into backend |
| `docker system prune -a` | Clean up Docker |

---

## ⚙️ Environment Variables

### Frontend
- **Development** (`.env`): `VITE_API_URL=http://localhost:5000`
- **Production** (`.env.production`): `VITE_API_URL=/api`

### Backend
- **Development**: `NODE_ENV=development` `PORT=5000`
- **Production**: `NODE_ENV=production` `PORT=5000`

---

## 🚀 EC2 Deployment Steps

### 1. Launch EC2 Instance
- Ubuntu 22.04 or Amazon Linux 2
- t3.small or larger (1GB RAM minimum)
- Allow ports: 22 (SSH), 80 (HTTP), 443 (HTTPS), 3000, 5000

### 2. SSH into Instance
```bash
ssh -i your-key.pem ubuntu@your-ec2-ip
```

### 3. Clone Repository
```bash
git clone <your-repo-url> ~/apps/ascii-framer
cd ~/apps/ascii-framer
```

### 4. Run Setup
```bash
chmod +x ec2-setup.sh
./ec2-setup.sh
```

Or manual setup:
```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install docker.io docker-compose git -y
sudo usermod -aG docker $USER
newgrp docker
```

### 5. Deploy
```bash
# Development mode
docker-compose up -d

# Production mode with Nginx
docker-compose -f docker-compose.prod.yml up -d
```

### 6. Access Application
- Frontend: `http://your-ec2-ip:3000`
- Backend: `http://your-ec2-ip:5000/api/health`
- Or via domain if configured

---

## 🔄 GitHub Actions CI/CD

**Automatic deployment on push to main:**

1. Add secrets to GitHub repo:
   - `EC2_HOST` - Your EC2 public IP
   - `EC2_USER` - SSH username
   - `EC2_PRIVATE_KEY` - Your EC2 SSH private key

2. Push code:
   ```bash
   git push origin main
   ```

3. GitHub Actions will:
   - Build Docker images
   - Push to registry (if configured)
   - SSH into EC2 and pull latest code
   - Restart containers

---

## 📊 Make Commands (Shortcuts)

```bash
make help             # Show all commands
make install          # Install dependencies
make build            # Build Docker images
make up               # Start services
make down             # Stop services
make logs             # View logs
make restart          # Restart services
make clean            # Remove containers
make status           # Show container status
make prod-up          # Start production
make backend-shell    # SSH into backend
make frontend-shell   # SSH into frontend
```

---

## 🔒 Security Checklist

- [ ] Add `.env` files to `.gitignore` (already done)
- [ ] Use environment variables for secrets
- [ ] Enable EC2 firewall/security groups
- [ ] Set up SSL/TLS with Let's Encrypt
- [ ] Enable auto-updates for Docker
- [ ] Configure regular backups
- [ ] Monitor logs and health checks
- [ ] Keep dependencies updated

---

## 🛠️ Next Steps

1. **Configure Backend Database** (optional)
   - Add PostgreSQL/MongoDB service to docker-compose
   - Update connection strings in .env

2. **Set Up Custom Domain** (optional)
   - Update Route 53 DNS or your domain registrar
   - Point to EC2 elastic IP
   - Configure SSL with Let's Encrypt

3. **Enable Auto-Scaling** (production)
   - Use AWS Auto Scaling Groups
   - Set CloudWatch alarms
   - Configure load balancer

4. **Add Monitoring** (production)
   - CloudWatch for logs and metrics
   - DataDog or New Relic for APM
   - Set up alerts

5. **Implement CI/CD** (if not using GitHub Actions)
   - Configure GitLab CI/CD or Jenkins
   - Add testing stages
   - Automated deployments

---

## 📚 Resources

- [Docker Documentation](https://docs.docker.com/)
- [Express.js Guide](https://expressjs.com/)
- [React Documentation](https://react.dev/)
- [AWS EC2 Guide](https://docs.aws.amazon.com/ec2/)
- [Nginx Documentation](https://nginx.org/en/docs/)

---

## ✨ What's Ready

✅ Fully containerized React + Node.js stack  
✅ Production-ready Docker setup  
✅ EC2 deployment automation  
✅ GitHub Actions CI/CD  
✅ Nginx reverse proxy  
✅ Health checks & monitoring  
✅ Environment-based configuration  
✅ Complete documentation  
✅ Make commands for easy management  

---

## 🎯 Your Next Move

**To get started immediately:**
```bash
cd /home/abhinav/H4G
make install
make build
make up
```

Then access:
- Frontend: http://localhost:3000
- Backend: http://localhost:5000/api/health

For production deployment, see [EC2_DEPLOYMENT_GUIDE.md](EC2_DEPLOYMENT_GUIDE.md)

---

**Everything is ready for deployment! 🚀**
