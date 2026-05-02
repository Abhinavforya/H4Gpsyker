#!/bin/bash
# Script to start/fetch the current ngrok URL and update .env file

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"
PORT="${PORT:-8000}"

if [ -f .env ]; then
    set -a
    source .env
    set +a
    PORT="${PORT:-8000}"
fi

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

echo "📡 Fetching current ngrok URL..."

# Start ngrok if its local API is not already available.
if ! curl -sf http://127.0.0.1:4040/api/tunnels >/dev/null 2>&1; then
    NGROK_BIN="$(find_ngrok || true)"
    if [ -z "$NGROK_BIN" ]; then
        echo "❌ ngrok is not installed or not on PATH."
        exit 1
    fi

    echo "🌐 Starting ngrok tunnel for http://localhost:$PORT ..."
    nohup "$NGROK_BIN" http "$PORT" >/tmp/chargen-ngrok.log 2>&1 &
    sleep 2
fi

NGROK_URL=""
for _ in {1..10}; do
    NGROK_URL=$(curl -s http://127.0.0.1:4040/api/tunnels | jq -r '.tunnels[] | select(.proto == "https") | .public_url' 2>/dev/null | head -n 1)
    if [ -n "$NGROK_URL" ] && [ "$NGROK_URL" != "null" ]; then
        break
    fi
    sleep 1
done

if [ -z "$NGROK_URL" ] || [ "$NGROK_URL" = "null" ]; then
    echo "❌ Failed to get ngrok URL. Check /tmp/chargen-ngrok.log for details."
    exit 1
fi

echo "✅ Found ngrok URL: $NGROK_URL"

touch .env

upsert_env() {
    local key="$1"
    local value="$2"
    if grep -q "^${key}=" .env; then
        sed -i "s|^${key}=.*|${key}=${value}|" .env
    else
        echo "${key}=${value}" >> .env
    fi
}

upsert_env "NGROK_URL" "$NGROK_URL"
upsert_env "SPOTIFY_SITE_URL" "$NGROK_URL"
upsert_env "SPOTIFY_REDIRECT_URI" "$NGROK_URL/auth/spotify/callback"
upsert_env "REDIRECT_URI" "$NGROK_URL/auth/spotify/callback"

if grep -q "^SPOTIFY_POST_LOGIN_PATH=" .env; then
    sed -i "s|^SPOTIFY_POST_LOGIN_PATH=.*|SPOTIFY_POST_LOGIN_PATH=/cozy-player|" .env
else
    echo "SPOTIFY_POST_LOGIN_PATH=/cozy-player" >> .env
fi

echo "✅ Updated .env with ngrok URL"
echo ""
echo "📋 Next steps:"
echo "1. Go to Spotify Dashboard: https://developer.spotify.com/dashboard"
echo "2. Edit your app settings"
echo "3. Update Redirect URIs to: $NGROK_URL/auth/spotify/callback"
echo "4. Save changes"
echo ""
echo "Then restart your server: npm start"
