# 🎵 Cozy Music Player — Spotify Integration Guide

**Version**: 1.0.0  
**Status**: Production Ready  
**Last Updated**: May 3, 2026

## 📋 Quick Start

### 1. Access the Player

```
http://localhost:8000/cozy-player
```

### 2. Connect to Spotify

- Click **"Connect Spotify"** button in the top right
- You'll be redirected to Spotify's login page
- Authorize the application
- Automatically redirected back to the player with playback enabled

### 3. Start Playing

- Select a device or use the web player
- Choose a track from your Spotify library
- Enjoy the real-time visual art synchronized with the music

---

## 🏗️ Architecture Overview

### Zero Interference Design

The cozy player maintains **complete separation** from Spotify's playback pipeline:

```
┌─────────────────────────────────────────────────┐
│        Spotify Web Playback SDK                 │
│  (Handles all playback, device management)      │
├─────────────────────────────────────────────────┤
│   Cozy Player Controller                        │
│   (Observes state, fetches metadata ONLY)       │
├─────────────────────────────────────────────────┤
│   Visual Engine (p5.js)                         │
│   (Renders reactive art based on metadata)      │
└─────────────────────────────────────────────────┘
```

**Key Principle**: The Cozy Player controller **never** interferes with Spotify's SDK. It only:
- Reads current playback state
- Fetches audio features from Spotify API
- Updates UI elements
- Renders visualizations

---

## 🎨 Components

### 1. **cozy-player.html**
Main HTML interface with:
- Player controls (play, pause, prev, next)
- Track information display
- Audio features visualization
- Device selector
- Visual mode switcher
- Album artwork display

### 2. **cozy-player.css**
Cozy aesthetic styling featuring:
- Warm color palette (oranges, browns, golds)
- Glass-morphism effects
- Smooth animations and transitions
- Responsive design
- Modern typography

### 3. **cozy-player-controller.js**
Core playback controller:
```javascript
class CozyPlayerController {
  // Spotify Web Playback SDK initialization
  initSpotifyPlayer()
  
  // Read-only state observers
  setupPlayerListeners()
  
  // UI Updates & metadata fetching
  updateTrackInfo(track)
  fetchAudioFeatures(trackId)
  
  // Playback controls (safe wrappers around SDK methods)
  togglePlayback()
  nextTrack()
  previousTrack()
  seekToPosition(percentage)
  setVolume(volumePercent)
  switchDevice(deviceId)
}
```

### 4. **cozy-visual-engine.js**
Real-time visualization system:
```javascript
class CozyVisualEngine {
  // Audio features → Visual parameters
  setAudioFeatures(features)
  
  // Seven render modes:
  renderParticles()     // Energy-based particles
  renderWaves()         // Danceability-influenced waves
  renderMandala()       // Complex geometric patterns
  renderConstellation() // Sparse star connections
  renderSpectrum()      // Audio spectrum style
  renderSpiral()        // Rotating spiral patterns
  renderReactive()      // Highly energy-responsive
}
```

---

## 🔐 Authentication Flow

### OAuth2 Process

```
1. User clicks "Connect Spotify"
   ↓
2. Redirected to /auth/spotify
   ↓
3. Backend initiates OAuth2 code flow
   ↓
4. User logs in to Spotify
   ↓
5. Spotify redirects to /auth/spotify/callback with code
   ↓
6. Backend exchanges code for access_token
   ↓
7. Token stored in session
   ↓
8. Redirect to /cozy-player?token=<access_token>
   ↓
9. Frontend extracts token from URL
   ↓
10. Token stored in localStorage for persistence
```

### Scopes Required

```javascript
[
  'user-read-private',        // Read user profile
  'user-read-email',          // Read user email
  'user-library-read',        // Read liked songs
  'user-top-read',            // Read top tracks/artists
  'playlist-read-private',    // Read private playlists
  'playlist-read-collaborative' // Read collaborative playlists
  'streaming',                // Required for Web Playback SDK
]
```

### Token Management

- **Storage**: Session cookie (secure, httpOnly) + localStorage
- **Expiration**: 3600 seconds (1 hour)
- **Refresh**: Automatic refresh before expiration
- **Validation**: Checked on every API call

---

## 🎵 Audio Features Explained

The visualization system uses Spotify's audio features API to create responsive art:

| Feature | Range | Meaning | Visual Effect |
|---------|-------|---------|---------------|
| **Energy** | 0-1 | Intensity (loud/fast vs quiet/slow) | Particle density, animation speed |
| **Valence** | 0-1 | Musical positivity (happy vs sad) | Color palette (warm vs cool) |
| **Danceability** | 0-1 | Rhythm regularity | Wave frequency, pattern smoothness |
| **Tempo** | BPM | Beats per minute | Animation timing, rotation speed |
| **Acousticness** | 0-1 | Acoustic (unplugged) vs electronic | Pattern complexity |
| **Instrumentalness** | 0-1 | Absence of vocals | Connection density (constellation) |
| **Liveness** | 0-1 | Live performance presence | Reactive element intensity |
| **Speechiness** | 0-1 | Spoken words vs music | Detail level of visualization |

---

## 🎮 Player Controls

### Playback Controls
- **Play/Pause**: Toggle playback (SDK-controlled)
- **Previous**: Skip to previous track
- **Next**: Skip to next track

### Progress Control
- Click on progress bar to seek
- Displays current time and total duration
- Real-time update while playing

### Volume Control
- Adjust volume slider (0-100%)
- Changes speaker volume

### Device Selection
- Select which device plays the music
- Automatically transferred when changed

### Visual Mode Selector
Choose from 7 visualization modes:
1. **Particles**: Floating particles with energy-based movement
2. **Waves**: Flowing wave patterns responsive to danceability
3. **Mandala**: Geometric mandala with rotating layers
4. **Constellation**: Star connections forming patterns
5. **Spectrum**: Audio spectrum visualization style
6. **Spiral**: Rotating spiral based on track energy
7. **Reactive**: Highly responsive to real-time energy changes

---

## 📊 Audio Features Display

Real-time bars showing:
- **Energy**: 0-100% intensity bar
- **Valence**: 0-100% happiness bar
- **Danceability**: 0-100% rhythm regularity bar
- **Tempo**: Beats per minute value

---

## 🔌 API Endpoints

### Authentication
```
GET /auth/spotify
  → Initiates OAuth2 flow with Spotify

GET /auth/spotify/callback
  → Spotify callback handler
  → Exchanges code for token
  → Redirects to /cozy-player?token=<token>
```

### Token Management
```
GET /api/spotify/token
  → Returns current access token (if authenticated)
  → Response: { access_token, token_type: "Bearer" }
```

### User Data
```
GET /api/spotify/profile
  → Returns authenticated user profile

GET /api/spotify/me/tracks
  → Returns user's liked songs with audio features

GET /api/spotify/me/player/recently-played
  → Returns recently played tracks

GET /api/spotify/playlists
  → Returns user's playlists

GET /api/spotify/recently-played-artists
  → Returns unique artists from recently played

GET /api/spotify/playlist/:playlistId/tracks
  → Returns tracks from specific playlist
```

---

## ⚙️ Configuration

### Environment Variables Required

```bash
# .env file
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
REDIRECT_URI=http://localhost:8000/auth/spotify/callback
SESSION_SECRET=your_session_secret_here
PORT=8000
NGROK_URL=https://your-ngrok-url.ngrok-free.dev  # Optional for production
```

### Getting Spotify Credentials

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new application
3. Accept the terms and create app
4. Copy **Client ID** and **Client Secret**
5. Add redirect URI: `http://localhost:8000/auth/spotify/callback`
6. Update `.env` file

---

## 🚀 Deployment

### Local Development
```bash
# Install dependencies
npm install

# Start server
npm start

# Access at http://localhost:8000/cozy-player
```

### End-to-End Verification Checklist

Use this flow to confirm the full Spotify-controlled experience:

1. Start the backend and open `http://localhost:8000/cozy-player`.
2. Click **Connect Spotify** and complete OAuth with a Premium account.
3. Confirm the SDK connects and the play/pause/seek/volume controls respond.
4. Open a playlist or a recently played track from the new library section.
5. Click **Play** on a track and verify playback starts in the app-controlled device.
6. Check the audio-features request for the selected track and confirm the canvas reacts.
7. Pause/resume playback and verify the visual engine degrades gracefully when no track is active.

### ngrok Setup for Local OAuth

If Spotify needs a public callback URL, expose the local server with ngrok and set:

```bash
ngrok http 8000
```

Then update your Spotify app redirect URI and local environment:

```bash
REDIRECT_URI=https://<your-ngrok-subdomain>.ngrok-free.dev/auth/spotify/callback
NGROK_URL=https://<your-ngrok-subdomain>.ngrok-free.dev
```

### Production Considerations

1. **HTTPS Only**: Spotify Web Playback SDK requires HTTPS in production
2. **CORS**: Update allowed origins in server.js
3. **Environment Variables**: Set all required ENV vars
4. **Rate Limiting**: Consider adding rate limits to API endpoints
5. **Token Expiry**: Implement token refresh strategy

### Docker Deployment
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8000

ENV NODE_ENV=production

CMD ["npm", "start"]
```

---

## 🐛 Troubleshooting

### Issue: "Not authenticated"
**Solution**: Make sure you've clicked "Connect Spotify" and the OAuth flow completed successfully.

### Issue: No device available
**Solution**: 
- Open Spotify on another device or browser
- It will appear as an available device
- Select it in the device dropdown

### Issue: Visualizations not moving
**Solution**: 
- Check that audio features are being fetched (console: `[Visual] Audio features updated`)
- Try switching visual modes
- Restart playback

### Issue: Token expired
**Solution**: 
- Automatic refresh should handle this
- If persists, disconnect and reconnect Spotify

### Issue: Audio features API 429 (Rate Limited)
**Solution**: 
- Spotify API has rate limits
- Wait a few minutes before retrying
- Consider implementing request queuing

---

## 📱 Browser Compatibility

- **Chrome**: ✅ Full support
- **Firefox**: ✅ Full support
- **Safari**: ✅ Full support (iOS 11+)
- **Edge**: ✅ Full support
- **Opera**: ✅ Full support

**Requirements**:
- JavaScript enabled
- WebGL for canvas rendering
- Cookies enabled for session

---

## 🎯 Key Features

✅ **Official Spotify Web Playback SDK** - No unofficial workarounds  
✅ **Zero Interference** - Never modifies playback pipeline  
✅ **Real-time Visualizations** - 7 dynamic render modes  
✅ **Audio-Responsive** - Uses official Spotify audio features API  
✅ **Cozy Aesthetic** - Beautiful, warm, modern interface  
✅ **Responsive Design** - Works on all devices  
✅ **Token Management** - Automatic refresh handling  
✅ **Device Switching** - Play on any Spotify device  
✅ **Volume Control** - Adjust speaker volume  
✅ **Progress Control** - Seek anywhere in track  
✅ **Album Artwork** - Beautiful album art display  
✅ **Library Browser** - Select playlists and recently played tracks
✅ **Cached Audio Features** - Backend proxy for track feature lookups

---

## 📚 Additional Resources

- [Spotify Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk)
- [Spotify Web API](https://developer.spotify.com/documentation/web-api)
- [Audio Features API](https://developer.spotify.com/documentation/web-api/reference/get-audio-features)
- [OAuth 2.0 Flow](https://developer.spotify.com/documentation/general/guides/authorization/)
- [p5.js Documentation](https://p5js.org/reference/)

---

## 🤝 Contributing

This is a demonstration project. Feel free to customize:
- Add more visualization modes
- Implement playlist selection
- Add equalizer controls
- Create custom color themes
- Extend with lyrics display

---

## 📄 License

MIT License - Feel free to use and modify

---

## 🎉 Enjoy!

The cozy music player is ready to use. Start by connecting to Spotify and exploring the beautiful visualizations while you enjoy your music!

**Happy listening! 🎵**
