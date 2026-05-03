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

Set these environment variables in Vercel:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SESSION_SECRET`
- `REDIRECT_URI` as `https://YOUR_DOMAIN/auth/spotify/callback`

Use `chargen` as the Vercel project root if deploying from the parent folder.
