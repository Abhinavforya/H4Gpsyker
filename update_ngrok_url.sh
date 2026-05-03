#!/bin/bash
# Script to fetch current ngrok URL and update .env file

echo "📡 Fetching current ngrok URL..."

# Get the ngrok URL from the API
NGROK_URL=$(curl -s http://127.0.0.1:4040/api/tunnels | jq -r '.tunnels[0].public_url' 2>/dev/null)

if [ -z "$NGROK_URL" ] || [ "$NGROK_URL" = "null" ]; then
    echo "❌ Failed to get ngrok URL. Make sure ngrok is running: ngrok http 8000"
    exit 1
fi

echo "✅ Found ngrok URL: $NGROK_URL"

# Update .env file
if grep -q "^NGROK_URL=" .env; then
    sed -i "s|^NGROK_URL=.*|NGROK_URL=$NGROK_URL|" .env
    sed -i "s|^REDIRECT_URI=.*|REDIRECT_URI=$NGROK_URL/auth/spotify/callback|" .env
else
    echo "" >> .env
    echo "NGROK_URL=$NGROK_URL" >> .env
    echo "REDIRECT_URI=$NGROK_URL/auth/spotify/callback" >> .env
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
