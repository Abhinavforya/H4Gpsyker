# Cozy Studio

Spotify visual player and MIDI artwork studio, prepared for Vercel.

## Structure

- `public/` - static pages and browser assets served by Vercel
- `public/cozy-player/` - main Spotify visual player
- `public/midi-to-image/` - MIDI artwork studio
- `api/` - Vercel serverless entry points
- `server.js` - Express app used locally and by `api/server.js`
- `generated-artworks/` - saved artwork output

## Local Run

```sh
npm install
npm run dev
```

Open `http://localhost:8000/cozy-player`.

## Vercel

Tech Stack

Frontend: Plain HTML/CSS/JavaScript, no bundler required for the main app.

Main UI: cozy-player.html, cozy-player.css, cozy-player-controller.js
Visual engine: cozy-visual-engine.js
MIDI/art tool UI: midi-to-image/index.html, midi-to-image/*.js
Uses CDN scripts for p5.js and Spotify Web Playback SDK.
Backend: Node.js + Express.

Main server: server.js
Starts with npm start or npm run dev
Serves static pages and owns most Spotify OAuth/API routes.
Uses express, express-session, cors, axios, dotenv.
Spotify integration:

OAuth login via /auth/spotify
Callback via /auth/spotify/callback
Session-based token storage
Spotify Web Playback SDK in browser
Spotify Web API calls proxied through backend for profile, playlists, recently played, audio features, etc.
Generative visuals/art:

Browser visuals use p5.js.
Spotify audio features drive visual state: energy, valence, danceability, tempo, acousticness, etc.
Generated artwork is stored under generated-artworks/.
Python side: Flask/audio-analysis pipeline, likely older or parallel backend.

Main file: app_backend.py
Helpers: audio_analyzer.py, event_processor.py, art_generator.py, spotify_api.py
Dependencies in requirements_flask.txt: Flask, requests, python-dotenv, numpy, scipy.
Handles audio uploads and analysis into events/ASCII/p5 config.
Experimental/scaffolded pieces:

client/ contains React/TypeScript-style hooks/components, but the root package.json does not include React/Vite/etc., so this looks like scaffolded or future code rather than the current runnable app.
api/ contains reusable/Vercel-style Spotify handlers.
server/index.js + server/auth.js is a smaller OAuth server separate from the main server.js.
Primary Workflow

Configure .env

Required:
SPOTIFY_CLIENT_ID
SPOTIFY_CLIENT_SECRET
REDIRECT_URI
SESSION_SECRET
PORT, usually 8000
Install dependencies:

npm install
Start the main app:
npm start
Open:
http://localhost:8000/cozy-player
Click Connect Spotify.

Browser goes to /auth/spotify.
Server redirects to Spotify OAuth.
Spotify returns to /auth/spotify/callback.
Server exchanges the code for tokens.
User lands back in the Cozy Player.
Frontend initializes Spotify playback.

cozy-player-controller.js loads/uses the Spotify Web Playback SDK.
It observes playback state, track metadata, device state, progress, volume.
It fetches audio features through backend routes like /api/audio-features/:trackId.
Visuals update live.

cozy-visual-engine.js receives normalized audio features.
p5.js renders visual modes like particles, waves, mandala, constellation, spectrum, spiral, reactive, mood biome, live paint, and ASCII modes.
Optional generated-art workflow.

Every fifth Spotify track appears to trigger/save a MIDI/art-style capture.
Saved output goes into generated-artworks/.
Gallery is available at /artworks.
Useful URLs

Main cozy player: https://h4-gpsyker.vercel.app/cozy-player
MIDI/art tool: https://h4-gpsyker.vercel.app/midi-to-image/index.html
Artwork gallery: (https://h4-gpsyker.vercel.app/artworks)
DEMO VIDEO : https://drive.google.com/file/d/1675AR0fRldLaFQo4ossvEVcGjcO-d32b/view?usp=drive_link

Mental Model

The repo is basically a music visualization lab with one main production path: Express server + static Cozy Player + Spotify OAuth/Web Playback + p5.js visuals. The Python Flask pipeline and React/TS client folder are related experiments or alternate directions, but the current working route is centered on server.js and the plain JS cozy player files.

Set these environment variables in Vercel:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SESSION_SECRET`
- `REDIRECT_URI` as `https://YOUR_DOMAIN/auth/spotify/callback`

Use `chargen` as the Vercel project root if deploying from the parent folder.
