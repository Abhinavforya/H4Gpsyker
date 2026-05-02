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
set -a
source .env
set +a
PORT="${PORT:-8000}"

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

find_ngrok() {
    local candidate
    while IFS= read -r candidate; do
        if [ -x "$candidate" ] && "$candidate" version >/dev/null 2>&1; then
            echo "$candidate"
            return 0
        fi
    done < <(which -a ngrok 2>/dev/null)

    return 1
}

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
    NGROK_BIN="$(find_ngrok || true)"
    if [ -z "$NGROK_BIN" ]; then
        echo -e "${RED}❌ ngrok is not installed or not on PATH${NC}"
        exit 1
    fi

    echo -e "${YELLOW}⚠️  ngrok not running; starting tunnel for http://localhost:$PORT${NC}"
    nohup "$NGROK_BIN" http "$PORT" >/tmp/chargen-ngrok.log 2>&1 &

    for _ in {1..10}; do
        NGROK_URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | jq -r '.tunnels[] | select(.proto == "https") | .public_url' 2>/dev/null | head -n 1)
        if [ -n "$NGROK_URL" ] && [ "$NGROK_URL" != "null" ]; then
            break
        fi
        sleep 1
    done

    if [ -z "$NGROK_URL" ] || [ "$NGROK_URL" = "null" ]; then
        echo -e "${RED}❌ Could not start ngrok. Check /tmp/chargen-ngrok.log${NC}"
        exit 1
    fi
else
    NGROK_URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | jq -r '.tunnels[] | select(.proto == "https") | .public_url' 2>/dev/null | head -n 1)
fi

echo -e "${GREEN}✅ ngrok active: $NGROK_URL${NC}\n"
REDIRECT_URI="$NGROK_URL/auth/spotify/callback"

upsert_env() {
    local key="$1"
    local value="$2"
    if grep -q "^${key}=" "$PROJECT_DIR/.env"; then
        sed -i "s|^${key}=.*|${key}=${value}|" "$PROJECT_DIR/.env"
    else
        echo "${key}=${value}" >> "$PROJECT_DIR/.env"
    fi
}

upsert_env "NGROK_URL" "$NGROK_URL"
upsert_env "SPOTIFY_SITE_URL" "$NGROK_URL"
upsert_env "SPOTIFY_REDIRECT_URI" "$REDIRECT_URI"
upsert_env "REDIRECT_URI" "$REDIRECT_URI"

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
echo "  Add this exact redirect URI:"
echo "    • $NGROK_URL/auth/spotify/callback"
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
