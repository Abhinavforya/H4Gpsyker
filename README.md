# Spotify API Handlers

Reusable API handlers for Spotify Web API integration.

## Files

- `api/login.js` - Authentication and login flow
- `api/callback.js` - OAuth callback handler
- `api/me.js` - Get current user profile
- `api/playlists.js` - Get user playlists
- `api/recently-played.js` - Get recently played tracks

## Setup

1. Install dependencies: `npm install`
2. Set up environment variables (see `.env.example`)
3. Use these files in your project by importing or copying them

## Environment Variables

Required:
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `REDIRECT_URI`
