#!/bin/bash

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Music Visualizer Environment Setup & Startup Script${NC}\n"

# Resolve the project directory relative to this script
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if .env exists
if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo -e "${RED}❌ .env file not found!${NC}"
    echo "Creating .env from template..."
    cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
    echo -e "${GREEN}✅ .env created${NC}\n"
else
    echo -e "${GREEN}✅ .env file exists${NC}\n"
fi

# Verify environment variables
echo -e "${BLUE}📋 Checking environment variables...${NC}"
cd "$PROJECT_DIR"
source .env

if [ -z "$SPOTIFY_CLIENT_ID" ]; then
    echo -e "${RED}❌ SPOTIFY_CLIENT_ID not set in .env${NC}"
    exit 1
fi

if [ -z "$SPOTIFY_CLIENT_SECRET" ]; then
    echo -e "${RED}❌ SPOTIFY_CLIENT_SECRET not set in .env${NC}"
    exit 1
fi

echo -e "${GREEN}✅ SPOTIFY_CLIENT_ID configured${NC}"
echo -e "${GREEN}✅ SPOTIFY_CLIENT_SECRET configured${NC}"
echo -e "${GREEN}✅ PORT: $PORT${NC}\n"

# Check if dependencies are installed
echo -e "${BLUE}📦 Checking dependencies...${NC}"
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
else
    echo -e "${GREEN}✅ Dependencies already installed${NC}\n"
fi

# Check ngrok
echo -e "${BLUE}🌐 Checking ngrok...${NC}"
NGROK_URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | jq -r '.tunnels[0].public_url' 2>/dev/null)

if [ -z "$NGROK_URL" ] || [ "$NGROK_URL" = "null" ]; then
    echo -e "${YELLOW}⚠️  ngrok not running${NC}"
    echo "To enable ngrok tunneling, run in another terminal:"
    echo -e "${BLUE}  ngrok http 8000${NC}\n"
    REDIRECT_URI="http://localhost:8000/auth/spotify/callback"
else
    echo -e "${GREEN}✅ ngrok active: $NGROK_URL${NC}\n"
    REDIRECT_URI="$NGROK_URL/auth/spotify/callback"
fi

# Verify server syntax
echo -e "${BLUE}✔️  Checking server syntax...${NC}"
if node --check server.js > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Server syntax valid${NC}\n"
else
    echo -e "${RED}❌ Server has syntax errors${NC}"
    exit 1
fi

# Display startup info
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ ALL CHECKS PASSED${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

echo -e "${YELLOW}📝 Configuration Summary:${NC}"
echo "  Server Port: $PORT"
echo "  Node Env: $NODE_ENV"
echo "  Redirect URI: $REDIRECT_URI"
echo ""

echo -e "${YELLOW}⚠️  IMPORTANT - Update Spotify Dashboard:${NC}"
echo "  Add redirect URIs:"
echo "    • http://localhost:8000/auth/spotify/callback"
if [ ! -z "$NGROK_URL" ] && [ "$NGROK_URL" != "null" ]; then
    echo "    • $NGROK_URL/auth/spotify/callback"
fi
echo ""

echo -e "${BLUE}🎯 Ready to start server!${NC}"
echo -e "${BLUE}Run: npm start${NC}\n"

# Ask to start server
read -p "Start server now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${GREEN}🚀 Starting server...${NC}\n"
    npm start
fi
