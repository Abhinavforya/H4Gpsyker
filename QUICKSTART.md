# Quickstart Commands

## Local Development

### Start all services
```bash
cd /home/abhinav/H4G
docker-compose up -d
```

### View logs
```bash
docker-compose logs -f
docker-compose logs -f frontend
docker-compose logs -f backend
```

### Access services
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000/api/health
- Backend Process: POST http://localhost:5000/api/process

### Stop services
```bash
docker-compose down
```

### Rebuild images
```bash
docker-compose build --no-cache
docker-compose up -d
```

---

## EC2 Deployment

### Prerequisites
- AWS EC2 instance (Ubuntu 22.04)
- Security group allowing ports 80, 443, 3000, 5000
- Key pair for SSH access

### Deploy

1. SSH into your EC2 instance:
```bash
ssh -i your-key.pem ubuntu@your-ec2-public-ip
```

2. Clone your repository:
```bash
git clone <your-repo-url> ~/apps/ascii-framer
cd ~/apps/ascii-framer
```

3. Run setup script (if available):
```bash
chmod +x ec2-setup.sh
./ec2-setup.sh
```

4. Start services:
```bash
docker-compose up -d
```

5. Access your app:
- Frontend: http://your-ec2-public-ip:3000
- Backend: http://your-ec2-public-ip:5000/api/health

---

## Project Structure

```
/home/abhinav/H4G/
├── ascii-framer/              # React frontend (Vite)
│   ├── Dockerfile
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── ...
│   ├── package.json
│   └── .env / .env.production
├── backend/                   # Express.js backend
│   ├── Dockerfile
│   ├── server.js
│   ├── package.json
│   └── .env.example
├── docker-compose.yml         # Local development
├── docker-compose.prod.yml    # Production with Nginx
├── nginx.conf                 # Nginx configuration
├── EC2_DEPLOYMENT_GUIDE.md   # Full deployment guide
├── ec2-setup.sh              # EC2 setup automation
└── QUICKSTART.md             # This file
```

---

## Available API Endpoints

### Backend (http://localhost:5000)

- **Health Check**
  ```
  GET /api/health
  Response: { status: "Backend is running", timestamp: "..." }
  ```

- **Process Data**
  ```
  POST /api/process
  Body: { input: "text", mode: "text" }
  ```

- **Save Snapshot**
  ```
  POST /api/save-snapshot
  Body: { snapshot: {...} }
  ```

- **Get Snapshots**
  ```
  GET /api/snapshots
  Response: { snapshots: [], total: 0 }
  ```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Port already in use | Change ports in docker-compose.yml or kill existing process |
| Cannot connect to backend | Check if backend container is running: `docker-compose ps` |
| Build fails | Clear cache: `docker-compose build --no-cache` |
| Permission denied | Add user to docker group: `sudo usermod -aG docker $USER` |

---

## Next Steps

1. **Customize backend** - Add your business logic to `/backend/server.js`
2. **Connect database** - Update docker-compose to include database service
3. **Add authentication** - Implement JWT or OAuth in the backend
4. **Configure domain** - Point your domain to EC2, set up SSL with Let's Encrypt
5. **Monitor & scale** - Set up CloudWatch, auto-scaling on AWS
