/**
 * server.js
 * Express backend for MIDI to Image conversion
 * Serves static files and health check endpoint
 */

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const axios = require('axios');
const crypto = require('crypto');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// Spotify OAuth Configuration
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:8000/auth/spotify/callback';

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';
const SESSION_SECRET = process.env.SESSION_SECRET || 'cozy-player-dev-secret';
const SESSION_MAX_AGE_DAYS = Number(process.env.SESSION_MAX_AGE_DAYS || 7);
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
const ARTWORKS_DIR = path.join(__dirname, 'generated-artworks');
const ARTWORK_INDEX_FILE = path.join(ARTWORKS_DIR, 'index.json');

if (!process.env.SESSION_SECRET) {
  console.warn('⚠️ SESSION_SECRET is not set. Using a stable development secret.');
}

fs.mkdirSync(ARTWORKS_DIR, { recursive: true });
if (!fs.existsSync(ARTWORK_INDEX_FILE)) {
  fs.writeFileSync(ARTWORK_INDEX_FILE, JSON.stringify({ artworks: [] }, null, 2));
}

function base64UrlEncode(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function createPkcePair() {
  const verifier = base64UrlEncode(crypto.randomBytes(64));
  const challenge = base64UrlEncode(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

// Middleware
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { secure: false, httpOnly: true, maxAge: SESSION_MAX_AGE_MS }
}));

app.use(cors({
  origin: [
    'http://localhost:3000', 
    'http://localhost:8000', 
    'http://127.0.0.1:3000', 
    'http://127.0.0.1:8000',
    'https://recoil-cusp-hypnotic.ngrok-free.dev',
    process.env.NGROK_URL
  ].filter(Boolean),
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

async function fetchAllPlaylistTracks(accessToken, playlistId) {
  const tracks = [];
  let nextUrl = `${SPOTIFY_API_URL}/playlists/${playlistId}/tracks?limit=100`;

  while (nextUrl) {
    const response = await axios.get(nextUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    tracks.push(...(response.data.items || []));
    nextUrl = response.data.next;
  }

  return tracks;
}

async function fetchAudioFeatures(accessToken, trackIds) {
  const featuresById = new Map();

  for (let i = 0; i < trackIds.length; i += 100) {
    const batch = trackIds.slice(i, i + 100);
    try {
      const response = await axios.get(`${SPOTIFY_API_URL}/audio-features`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        params: { ids: batch.join(',') }
      });

      for (const feature of response.data.audio_features || []) {
        if (feature && feature.id) {
          featuresById.set(feature.id, feature);
        }
      }
    } catch (err) {
      console.warn('⚠️ Audio features unavailable for batch:', err.response?.status || err.message);
    }
  }

  return featuresById;
}

function normalizeAudioFeatures(feature) {
  if (!feature) {
    return {
      tempo: 120,
      energy: 0.55,
      valence: 0.5,
      danceability: 0.52,
      acousticness: 0.24,
      instrumentalness: 0.08,
      liveness: 0.35,
      speechiness: 0.08,
      loudness: -8,
    };
  }

  return {
    tempo: feature.tempo ?? 0,
    energy: feature.energy ?? 0,
    valence: feature.valence ?? 0,
    danceability: feature.danceability ?? 0,
    acousticness: feature.acousticness ?? 0,
    instrumentalness: feature.instrumentalness ?? 0,
    liveness: feature.liveness ?? 0,
    speechiness: feature.speechiness ?? 0,
    loudness: feature.loudness ?? 0,
  };
}

const audioFeaturesCache = new Map();
const AUDIO_FEATURES_CACHE_TTL_MS = 10 * 60 * 1000;

function getCachedAudioFeatures(trackId) {
  const cached = audioFeaturesCache.get(trackId);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > AUDIO_FEATURES_CACHE_TTL_MS) {
    audioFeaturesCache.delete(trackId);
    return null;
  }
  return cached.value;
}

function setCachedAudioFeatures(trackId, value) {
  audioFeaturesCache.set(trackId, { cachedAt: Date.now(), value });
}

function readArtworkIndex() {
  try {
    const raw = fs.readFileSync(ARTWORK_INDEX_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.artworks) ? parsed.artworks : [];
  } catch (error) {
    console.warn('⚠️ Could not read artwork index:', error.message);
    return [];
  }
}

function writeArtworkIndex(artworks) {
  fs.writeFileSync(ARTWORK_INDEX_FILE, JSON.stringify({ artworks }, null, 2));
}

function slugify(value) {
  return String(value || 'spotify-capture')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'spotify-capture';
}

function hashString(value) {
  let hash = 0;
  const text = String(value || '');
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededRandom(seed) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = state * 16807 % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function normalizeTrackPayload(track = {}) {
  const artists = Array.isArray(track.artists)
    ? track.artists.map(artist => artist?.name || artist).filter(Boolean).join(', ')
    : String(track.artists || 'Unknown Artist');

  return {
    id: track.id || track.uri || crypto.randomUUID(),
    uri: track.uri || null,
    name: track.name || 'Unknown Track',
    artists,
    album: typeof track.album === 'string' ? track.album : (track.album?.name || track.album || 'Unknown Album'),
    duration_ms: track.duration_ms || track.duration || 0,
    image: track.image || track.album?.images?.[0]?.url || null,
    popularity: typeof track.popularity === 'number' ? track.popularity : 50,
  };
}

function generateMidiCapture(track, features = {}, captureSeconds = 20) {
  const tempo = Math.max(60, Math.min(190, Number(features.tempo) || 120));
  const energy = Math.max(0, Math.min(1, Number(features.energy ?? 0.55)));
  const valence = Math.max(0, Math.min(1, Number(features.valence ?? 0.5)));
  const danceability = Math.max(0, Math.min(1, Number(features.danceability ?? 0.52)));
  const acousticness = Math.max(0, Math.min(1, Number(features.acousticness ?? 0.24)));
  const instrumentalness = Math.max(0, Math.min(1, Number(features.instrumentalness ?? 0.08)));
  const speechiness = Math.max(0, Math.min(1, Number(features.speechiness ?? 0.08)));
  const loudness = Number(features.loudness ?? -8);
  const tpb = 480;
  const secondsPerTick = (60 / tempo) / tpb;
  const seed = hashString(`${track.id}|${track.name}|${track.artists}|${tempo}`);
  const random = seededRandom(seed);
  const scale = valence >= 0.5
    ? [0, 2, 4, 5, 7, 9, 11, 12]
    : [0, 2, 3, 5, 7, 8, 10, 12];
  const baseNote = Math.max(36, Math.min(78, 42 + Math.round(valence * 22) + Math.round((track.popularity || 50) / 10)));
  const noteCount = Math.max(28, Math.min(96, Math.round(captureSeconds * (tempo / 60) * (0.72 + danceability * 0.5))));
  const stepSec = captureSeconds / noteCount;
  const notes = [];

  for (let i = 0; i < noteCount; i++) {
    const phrase = i / Math.max(1, noteCount - 1);
    const offset = Math.floor(random() * scale.length);
    const octave = Math.floor(random() * (energy > 0.7 ? 3 : 2)) * 12;
    const wave = Math.round(Math.sin(phrase * Math.PI * 4 + random() * 2) * danceability * 5);
    const note = Math.max(36, Math.min(96, baseNote + scale[offset] + octave + wave - Math.round(acousticness * 6)));
    const startSec = i * stepSec;
    const durationSec = Math.max(0.07, stepSec * (0.42 + energy * 0.36 + instrumentalness * 0.2));
    const startTick = Math.round(startSec / secondsPerTick);
    const endTick = Math.round(Math.min(captureSeconds, startSec + durationSec) / secondsPerTick);
    const accent = i % Math.max(2, Math.round(7 - danceability * 4)) === 0 ? 14 : 0;
    const loudnessBoost = Math.max(0, Math.min(22, loudness + 24));

    notes.push({
      note,
      channel: 0,
      velocity: Math.max(24, Math.min(127, Math.round(34 + energy * 58 + loudnessBoost + accent - speechiness * 10))),
      startTick,
      endTick: Math.max(startTick + 1, endTick),
      durationTicks: Math.max(1, endTick - startTick),
      startSec,
      endSec: Math.min(captureSeconds, startSec + durationSec),
      durationSec,
      trackIdx: 0,
      trackName: 'Spotify 20s Capture',
      bpm: Math.round(tempo),
    });
  }

  const uniquePitches = [...new Set(notes.map(note => note.note))].sort((a, b) => a - b);
  const maxTick = notes.length ? Math.max(...notes.map(note => note.endTick)) : 0;
  const avgVelocity = notes.length ? notes.reduce((sum, note) => sum + note.velocity, 0) / notes.length : 0;

  return {
    name: track.name,
    header: { format: 0, ntracks: 1, division: tpb },
    tracks: [{
      index: 0,
      name: 'Spotify 20s Capture',
      noteCount: notes.length,
      notes,
      minNote: uniquePitches[0] || 0,
      maxNote: uniquePitches[uniquePitches.length - 1] || 127,
      avgVelocity,
    }],
    notes,
    bpm: Math.round(tempo),
    totalNotes: notes.length,
    maxTick,
    uniquePitches,
    duration: captureSeconds,
    sourceType: 'spotify-auto',
    captureSeconds,
    spotifyTrack: track,
  };
}

function generateAsciiFromMidi(midiData, width = 80, height = 32) {
  const chars = ' .,:;irsXA253hMHGS#9B&@';
  const grid = Array.from({ length: height }, () => Array(width).fill(' '));
  const notes = midiData.notes || [];
  const maxTick = midiData.maxTick || 1;

  for (const note of notes) {
    const x = Math.max(0, Math.min(width - 1, Math.round((note.startTick / maxTick) * (width - 1))));
    const y = Math.max(0, Math.min(height - 1, Math.round((1 - note.note / 127) * (height - 1))));
    const intensity = Math.max(0, Math.min(chars.length - 1, Math.round((note.velocity / 127) * (chars.length - 1))));
    grid[y][x] = chars[intensity];
    if (x + 1 < width && note.durationSec > 0.18) grid[y][x + 1] = chars[Math.max(0, intensity - 2)];
    if (y + 1 < height && note.velocity > 88) grid[y + 1][x] = chars[Math.max(0, intensity - 4)];
  }

  return grid.map(row => row.join('')).join('\n');
}

function generateSvgFromMidi(midiData, track, features = {}) {
  const width = 1200;
  const height = 720;
  const notes = midiData.notes || [];
  const maxTick = midiData.maxTick || 1;
  const energy = Math.max(0, Math.min(1, Number(features.energy ?? 0.55)));
  const valence = Math.max(0, Math.min(1, Number(features.valence ?? 0.5)));
  const palette = valence > 0.58
    ? ['#1ed760', '#34d399', '#f472b6', '#fbbf24', '#60a5fa']
    : ['#60a5fa', '#a78bfa', '#34d399', '#f472b6', '#e2e8f0'];
  const bg = energy > 0.66 ? '#050510' : '#08111f';
  const circles = notes.map((note, index) => {
    const x = Math.round((note.startTick / maxTick) * (width - 120) + 60);
    const y = Math.round((1 - note.note / 127) * (height - 180) + 80);
    const radius = (4 + (note.velocity / 127) * 22 + (note.durationSec || 0) * 8).toFixed(2);
    const color = palette[note.note % palette.length];
    const opacity = (0.38 + (note.velocity / 127) * 0.58).toFixed(2);
    const line = index > 0
      ? `<line x1="${Math.round(((notes[index - 1].startTick || 0) / maxTick) * (width - 120) + 60)}" y1="${Math.round((1 - (notes[index - 1].note || 60) / 127) * (height - 180) + 80)}" x2="${x}" y2="${y}" stroke="${color}" stroke-opacity="0.18" stroke-width="1"/>`
      : '';
    return `${line}<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}" fill-opacity="${opacity}"/>`;
  }).join('\n    ');

  const title = escapeXml(track.name);
  const artists = escapeXml(track.artists);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${bg}"/>
  <rect x="28" y="28" width="${width - 56}" height="${height - 56}" rx="24" fill="none" stroke="#ffffff" stroke-opacity="0.11"/>
  <g filter="url(#glow)">
    ${circles}
  </g>
  <text x="60" y="${height - 72}" fill="#e2e8f0" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="700">${title}</text>
  <text x="60" y="${height - 38}" fill="#94a3b8" font-family="Inter, Arial, sans-serif" font-size="18">${artists} · 20s / every fifth Spotify track</text>
  <defs>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
</svg>`;
}

function writeMidiBuffer(midiData) {
  const bytes = [];
  const track = [];
  const division = midiData.header?.division || 480;
  const tempo = Math.round(60000000 / (midiData.bpm || 120));

  writeVarLen(track, 0);
  track.push(0xff, 0x51, 0x03, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff);

  const events = [];
  for (const note of midiData.notes || []) {
    const channel = Math.max(0, Math.min(15, note.channel || 0));
    const pitch = Math.max(0, Math.min(127, note.note || 60));
    const velocity = Math.max(1, Math.min(127, note.velocity || 64));
    const startTick = Math.max(0, Math.round(note.startTick || 0));
    const endTick = Math.max(startTick + 1, Math.round(note.endTick || startTick + note.durationTicks || startTick + division / 4));
    events.push({ tick: startTick, order: 0, bytes: [0x90 | channel, pitch, velocity] });
    events.push({ tick: endTick, order: 1, bytes: [0x80 | channel, pitch, 0] });
  }

  events.sort((a, b) => (a.tick - b.tick) || (a.order - b.order));

  let cursor = 0;
  for (const event of events) {
    writeVarLen(track, Math.max(0, event.tick - cursor));
    track.push(...event.bytes);
    cursor = event.tick;
  }

  writeVarLen(track, 0);
  track.push(0xff, 0x2f, 0x00);

  writeAscii(bytes, 'MThd');
  writeUInt32(bytes, 6);
  writeUInt16(bytes, 0);
  writeUInt16(bytes, 1);
  writeUInt16(bytes, division);
  writeAscii(bytes, 'MTrk');
  writeUInt32(bytes, track.length);
  bytes.push(...track);

  return Buffer.from(bytes);
}

function writeAscii(target, text) {
  for (let i = 0; i < text.length; i++) {
    target.push(text.charCodeAt(i) & 0xff);
  }
}

function writeUInt16(target, value) {
  target.push((value >> 8) & 0xff, value & 0xff);
}

function writeUInt32(target, value) {
  target.push((value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
}

function writeVarLen(target, value) {
  let buffer = value & 0x7f;
  while ((value >>= 7)) {
    buffer <<= 8;
    buffer |= ((value & 0x7f) | 0x80);
  }

  while (true) {
    target.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
}

function escapeXml(value) {
  return String(value || '').replace(/[<>&"']/g, char => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  }[char]));
}

function getRequestAccessToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }
  return req.session?.access_token || null;
}

function getSessionTokenSecondsRemaining(req) {
  const expiresIn = req.session?.expires_in || 3600;
  const obtainedAt = req.session?.token_obtained_at || Math.floor(Date.now() / 1000);
  const ageSeconds = Math.max(0, Math.floor(Date.now() / 1000) - obtainedAt);
  return Math.max(0, expiresIn - ageSeconds);
}

app.get('/api/audio-features/:trackId', async (req, res) => {
  const { trackId } = req.params;
  const accessToken = getRequestAccessToken(req);

  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const cached = getCachedAudioFeatures(trackId);
  if (cached) {
    return res.json({ ...cached, cached: true });
  }

  try {
    if (req.session?.access_token) {
      await ensureValidToken(req);
    }

    const response = await axios.get(`${SPOTIFY_API_URL}/audio-features/${trackId}`, {
      headers: { Authorization: `Bearer ${req.session?.access_token || accessToken}` }
    });

    const normalized = normalizeAudioFeatures(response.data);
    const payload = {
      id: response.data?.id || trackId,
      raw: response.data,
      normalized,
    };

    setCachedAudioFeatures(trackId, payload);
    res.json({ ...payload, cached: false });
  } catch (err) {
    console.error('❌ Failed to fetch audio features:', err.message);
    const fallback = normalizeAudioFeatures(null);
    const payload = {
      id: trackId,
      raw: null,
      normalized: fallback,
      fallback: true,
    };
    setCachedAudioFeatures(trackId, payload);
    res.json({ ...payload, cached: false });
  }
});







// Send the site root to the MIDI-to-image landing page
app.get('/', (req, res) => {
  res.redirect('/midi-to-image/index.html');
});

// Make the folder route resolve to the same landing page
app.get('/midi-to-image', (req, res) => {
  res.redirect('/midi-to-image/index.html');
});

app.get('/midi-to-image/', (req, res) => {
  res.redirect('/midi-to-image/index.html');
});

// Cozy player route
app.get('/cozy-player', (req, res) => {
  res.sendFile(path.join(__dirname, 'cozy-player.html'));
});

app.get('/cozy-player/', (req, res) => {
  res.sendFile(path.join(__dirname, 'cozy-player.html'));
});

// Serve static files from the app folder (after routes so they don't intercept)
app.use('/midi-to-image', express.static(path.join(__dirname, 'midi-to-image')));
app.use('/cozy-player', express.static(path.join(__dirname, '.')));
// ==================== SPOTIFY OAUTH ROUTES ====================

// Cozy Player - Get access token for Spotify Web Playback SDK
app.get('/api/spotify/token', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    await ensureValidToken(req);
  } catch (err) {
    return res.status(401).json({ error: 'Token refresh failed' });
  }

  res.json({
    access_token: req.session.access_token,
    token_type: 'Bearer',
    expires_in: getSessionTokenSecondsRemaining(req)
  });
});

// Step 1: Redirect user to Spotify login
app.get('/auth/spotify', (req, res) => {
  const state = crypto.randomBytes(32).toString('hex');
  const pkce = createPkcePair();
  req.session.oauth_state = state;
  req.session.pkce_verifier = pkce.verifier;

  const scopes = [
    'streaming',
    'user-read-private',
    'user-read-email',
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'user-library-read',
    'user-top-read',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-read-recently-played',
  ].join(' ');

  const authUrl = new URL(SPOTIFY_AUTH_URL);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('client_id', SPOTIFY_CLIENT_ID);
  authUrl.searchParams.append('scope', scopes);
  authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.append('state', state);
  authUrl.searchParams.append('code_challenge_method', 'S256');
  authUrl.searchParams.append('code_challenge', pkce.challenge);

  console.log('🎵 Redirecting to Spotify login...');
  res.redirect(authUrl.toString());
});

async function handleSpotifyCallback(req, res) {
  const { code, state, error } = req.query;

  if (error) {
    console.error('❌ Spotify error:', error);
    return res.redirect(`/midi-to-image/index.html?error=${error}`);
  }

  if (!state || state !== req.session.oauth_state) {
    console.error('❌ State mismatch - CSRF attempt detected');
    return res.redirect('/midi-to-image/index.html?error=state_mismatch');
  }

  if (!code) {
    console.error('❌ No authorization code received');
    return res.redirect('/midi-to-image/index.html?error=no_code');
  }

  try {
    console.log('🔄 Exchanging code for token...');
    const response = await axios.post(SPOTIFY_TOKEN_URL, new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: SPOTIFY_CLIENT_ID,
      code_verifier: req.session.pkce_verifier,
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const { access_token, refresh_token, expires_in } = response.data;

    // Store tokens in session with timestamp
    req.session.access_token = access_token;
    req.session.refresh_token = refresh_token;
    req.session.expires_in = expires_in;
    req.session.token_obtained_at = Math.floor(Date.now() / 1000);

    console.log('✅ Token received! Expires in:', expires_in, 'seconds');

    // Get user profile
    const userRes = await axios.get(`${SPOTIFY_API_URL}/me`, {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });

    const user = userRes.data;
    req.session.user = {
      id: user.id,
      name: user.display_name,
      email: user.email,
      image: user.images?.[0]?.url
    };

    console.log('✅ User:', user.display_name);

    // Redirect to cozy player. The browser asks /api/spotify/token after the session cookie is set.
    const redirectUrl = new URL('/cozy-player',
      `http://${req.get('host')}`
    );

    res.redirect(redirectUrl.toString());
  } catch (err) {
    console.error('❌ Token exchange failed:', err.message);
    console.error('   Full error:', err.response?.data || err);
    console.error('   REDIRECT_URI:', REDIRECT_URI);
    console.error('   CLIENT_ID:', SPOTIFY_CLIENT_ID?.substring(0, 8) + '...');
    res.redirect(`/cozy-player?error=token_exchange_failed`);
  }
}

// Step 2: Handle Spotify callback
app.get('/auth/spotify/callback', handleSpotifyCallback);
app.get('/auth/callback', handleSpotifyCallback);

// Refresh token if expired
async function ensureValidToken(req) {
  if (!req.session.refresh_token) {
    throw new Error('No refresh token available');
  }

  const now = Math.floor(Date.now() / 1000);
  const tokenAge = now - (req.session.token_obtained_at || now);
  const expiresIn = req.session.expires_in || 3600;

  // Refresh if token is within 5 minutes of expiration
  if (tokenAge > expiresIn - 300) {
    console.log('🔄 Token expiring soon, refreshing...');
    try {
      const response = await axios.post(SPOTIFY_TOKEN_URL, new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: req.session.refresh_token,
        client_id: SPOTIFY_CLIENT_ID,
      }), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      const { access_token, expires_in } = response.data;
      req.session.access_token = access_token;
      req.session.expires_in = expires_in;
      req.session.token_obtained_at = now;
      console.log('✅ Token refreshed! New expiration: ', expires_in, 'seconds');
    } catch (err) {
      console.error('❌ Token refresh failed:', err.message);
      throw err;
    }
  }
}

// Get current user profile
app.get('/api/spotify/profile', (req, res) => {
  const token = req.session?.access_token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  res.json(req.session.user);
});

app.get('/api/me', async (req, res) => {
  const token = getRequestAccessToken(req);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  if (req.session?.user) {
    return res.json(req.session.user);
  }

  try {
    const response = await axios.get(`${SPOTIFY_API_URL}/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    res.json({
      id: response.data.id,
      name: response.data.display_name,
      email: response.data.email,
      image: response.data.images?.[0]?.url,
    });
  } catch (err) {
    console.error('❌ Failed to fetch profile:', err.message);
    res.status(401).json({ error: 'No profile available' });
  }
});

// Get user's liked songs (saved tracks)
app.get('/api/spotify/me/tracks', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    await ensureValidToken(req);
    
    const allTracks = [];
    let nextUrl = `${SPOTIFY_API_URL}/me/tracks?limit=50`;

    // Paginate through all saved tracks
    while (nextUrl) {
      const response = await axios.get(nextUrl, {
        headers: { 'Authorization': `Bearer ${req.session.access_token}` }
      });

      allTracks.push(...(response.data.items || []));
      nextUrl = response.data.next;
      console.log(`📍 Fetched ${allTracks.length} liked songs...`);
    }

    // Get audio features for all tracks
    const trackIds = allTracks
      .map(item => item.track?.id)
      .filter(Boolean);
    const audioFeatures = await fetchAudioFeatures(req.session.access_token, trackIds);

    const tracks = allTracks
      .filter(item => item.track)
      .map(item => ({
        id: item.track.id,
        uri: item.track.uri,
        name: item.track.name,
        artists: item.track.artists?.map(a => a.name).join(', '),
        album: item.track.album?.name,
        duration: item.track.duration_ms,
        previewUrl: item.track.preview_url,
        image: item.track.album?.images?.[0]?.url,
        explicit: item.track.explicit,
        popularity: item.track.popularity,
        addedAt: item.added_at,
        audioFeatures: audioFeatures.get(item.track.id) || null
      }));

    console.log(`✅ Found ${tracks.length} liked songs total`);
    res.json({ tracks, total: allTracks.length });
  } catch (err) {
    console.error('❌ Failed to fetch liked songs:', err.message);
    res.status(500).json({ error: 'Failed to fetch liked songs' });
  }
});

// Get user's recently played tracks (with pagination)
app.get('/api/spotify/me/player/recently-played', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    await ensureValidToken(req);
    
    const allTracks = [];
    let nextUrl = `${SPOTIFY_API_URL}/me/player/recently-played?limit=50`;

    // Paginate through all recently played
    while (nextUrl) {
      const response = await axios.get(nextUrl, {
        headers: { 'Authorization': `Bearer ${req.session.access_token}` }
      });

      allTracks.push(...(response.data.items || []));
      nextUrl = response.data.next;
    }

    const tracks = allTracks
      .filter(item => item.track)
      .map(item => ({
        id: item.track.id,
        uri: item.track.uri,
        name: item.track.name,
        artists: item.track.artists?.map(a => a.name).join(', '),
        album: item.track.album?.name,
        duration: item.track.duration_ms,
        previewUrl: item.track.preview_url,
        image: item.track.album?.images?.[0]?.url,
        playedAt: item.played_at
      }));

    res.json({ tracks, total: allTracks.length });
  } catch (err) {
    console.error('❌ Failed to fetch recently played:', err.message);
    res.status(500).json({ error: 'Failed to fetch recently played' });
  }
});

app.get('/api/recently-played', async (req, res) => {
  const accessToken = getRequestAccessToken(req);
  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    if (req.session?.access_token) {
      await ensureValidToken(req);
    }

    const token = req.session?.access_token || accessToken;
    const response = await axios.get(`${SPOTIFY_API_URL}/me/player/recently-played?limit=50`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const artistsMap = new Map();
    const songsMap = new Map();

    for (const item of response.data.items || []) {
      const track = item.track;
      if (!track || songsMap.has(track.id)) continue;

      songsMap.set(track.id, {
        id: track.id,
        uri: track.uri,
        name: track.name,
        artists: (track.artists || []).map(artist => ({
          id: artist.id,
          name: artist.name,
        })),
        duration: track.duration_ms,
        previewUrl: track.preview_url,
        image: track.album?.images?.[0]?.url || null,
        explicit: track.explicit,
        popularity: track.popularity,
        url: track.external_urls?.spotify || null,
      });

      for (const artist of track.artists || []) {
        if (!artistsMap.has(artist.id)) {
          artistsMap.set(artist.id, {
            id: artist.id,
            name: artist.name,
            url: artist.external_urls?.spotify || null,
          });
        }
      }
    }

    res.json({
      songs: Array.from(songsMap.values()).slice(0, 50),
      artists: Array.from(artistsMap.values()).slice(0, 30),
    });
  } catch (err) {
    console.error('❌ Failed to fetch recently played:', err.message);
    res.status(500).json({ error: 'Failed to fetch recently played' });
  }
});

app.get('/api/spotify/playlists', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    await ensureValidToken(req);
    
    const allPlaylists = [];
    let nextUrl = `${SPOTIFY_API_URL}/me/playlists?limit=50`;

    // Paginate through all playlists
    while (nextUrl) {
      const response = await axios.get(nextUrl, {
        headers: { 'Authorization': `Bearer ${req.session.access_token}` }
      });

      allPlaylists.push(...(response.data.items || []));
      nextUrl = response.data.next;
    }

    const playlists = allPlaylists.map(playlist => ({
      id: playlist.id,
      name: playlist.name,
      image: playlist.images?.[0]?.url,
      url: playlist.external_urls?.spotify,
      trackCount: playlist.tracks?.total || 0,
      owner: playlist.owner?.display_name
    }));

    res.json({ playlists, total: allPlaylists.length });
  } catch (err) {
    console.error('❌ Failed to fetch playlists:', err.message);
    res.status(500).json({ error: 'Failed to fetch playlists' });
  }
});

app.get('/api/playlists', async (req, res) => {
  const accessToken = getRequestAccessToken(req);
  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    if (req.session?.access_token) {
      await ensureValidToken(req);
    }

    const token = req.session?.access_token || accessToken;
    const allPlaylists = [];
    let nextUrl = `${SPOTIFY_API_URL}/me/playlists?limit=50`;

    while (nextUrl) {
      const response = await axios.get(nextUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });

      allPlaylists.push(...(response.data.items || []));
      nextUrl = response.data.next;
    }

    const playlists = allPlaylists.map(playlist => ({
      id: playlist.id,
      name: playlist.name,
      desc: playlist.description || '',
      image: playlist.images?.[0]?.url || null,
      url: playlist.external_urls?.spotify || null,
      trackCount: playlist.tracks?.total || 0,
      owner: playlist.owner?.display_name || 'Unknown',
    }));

    res.json({ playlists, total: allPlaylists.length });
  } catch (err) {
    console.error('❌ Failed to fetch playlists:', err.message);
    res.status(500).json({ error: 'Failed to fetch playlists' });
  }
});
// Get user's recently played artists
app.get('/api/spotify/recently-played-artists', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    await ensureValidToken(req);
    
    // Get recently played tracks
    const response = await axios.get(`${SPOTIFY_API_URL}/me/player/recently-played?limit=50`, {
      headers: { 'Authorization': `Bearer ${req.session.access_token}` }
    });

    // Extract unique artists
    const artistsMap = new Map();
    response.data.items.forEach(item => {
      if (item.track && item.track.artists) {
        item.track.artists.forEach(artist => {
          if (!artistsMap.has(artist.id)) {
            artistsMap.set(artist.id, {
              id: artist.id,
              name: artist.name,
              url: artist.external_urls?.spotify
            });
          }
        });
      }
    });

    const artists = Array.from(artistsMap.values()).slice(0, 30);
    res.json({ artists });
  } catch (err) {
    console.error('❌ Failed to fetch recently played:', err.message);
    res.status(500).json({ error: 'Failed to fetch recently played' });
  }
});

// Get songs from a specific playlist
async function handlePlaylistTracksRequest(req, res, playlistId) {
  const accessToken = getRequestAccessToken(req);
  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    if (req.session?.access_token) {
      await ensureValidToken(req);
    }
    const token = req.session?.access_token || accessToken;
    
    const playlistItems = await fetchAllPlaylistTracks(token, playlistId);
    const trackIds = playlistItems
      .map(item => item.track?.id)
      .filter(Boolean);
    const audioFeatures = await fetchAudioFeatures(token, trackIds);

    const tracks = playlistItems
      .filter(item => item.track) // Filter out unavailable tracks
      .map((item, index) => ({
        id: item.track.id || item.track.uri || `${playlistId}-${index}`,
        uri: item.track.uri,
        name: item.track.name,
        artists: item.track.artists?.map(a => a.name).join(', '),
        album: item.track.album?.name,
        duration: item.track.duration_ms,
        previewUrl: item.track.preview_url,
        image: item.track.album?.images?.[0]?.url,
        explicit: item.track.explicit,
        popularity: item.track.popularity,
        audioFeatures: audioFeatures.get(item.track.id) || null
      }));

    res.json({ tracks, total: playlistItems.length });
  } catch (err) {
    const status = err.response?.status || 500;
    const spotifyError = err.response?.data?.error;
    const message = spotifyError?.message || err.response?.data?.error_description || err.message || 'Failed to fetch playlist tracks';

    console.error('❌ Failed to fetch playlist tracks:', status, message);
    res.status(status).json({ error: message });
  }
}

app.get('/api/spotify/playlist/:playlistId/tracks', async (req, res) => {
  const { playlistId } = req.params;
  return handlePlaylistTracksRequest(req, res, playlistId);
});

app.get('/api/playlist/:playlistId/tracks', async (req, res) => {
  const { playlistId } = req.params;
  return handlePlaylistTracksRequest(req, res, playlistId);
});

// Logout
app.post('/api/spotify/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// ==================== END SPOTIFY ROUTES ====================

app.post('/api/artworks/spotify-capture', (req, res) => {
  const track = normalizeTrackPayload(req.body?.track || {});
  const features = req.body?.features || {};
  const captureSeconds = Math.max(5, Math.min(20, Number(req.body?.captureSeconds) || 20));
  const triggerEvery = Math.max(1, Number(req.body?.triggerEvery) || 5);
  const playedCount = Math.max(0, Number(req.body?.playedCount) || 0);
  const createdAt = new Date().toISOString();
  const id = `${Date.now()}-${slugify(track.name)}-${crypto.randomBytes(3).toString('hex')}`;
  const folderName = slugify(`${createdAt.slice(0, 10)}-${track.name}-${track.artists}-${id}`);
  const folderPath = path.join(ARTWORKS_DIR, folderName);
  const publicBase = `/generated-artworks/${folderName}`;

  try {
    fs.mkdirSync(folderPath, { recursive: true });

    const midi = generateMidiCapture(track, features, captureSeconds);
    const ascii = generateAsciiFromMidi(midi);
    const svg = generateSvgFromMidi(midi, track, features);
    const midiFile = writeMidiBuffer(midi);
    const metadata = {
      id,
      folderName,
      createdAt,
      triggerEvery,
      playedCount,
      captureSeconds,
      track,
      features,
      files: {
        metadata: `${publicBase}/metadata.json`,
        midiFile: `${publicBase}/capture.mid`,
        midi: `${publicBase}/midi.json`,
        ascii: `${publicBase}/ascii.txt`,
        svg: `${publicBase}/art.svg`,
      },
      noteCount: midi.totalNotes,
      bpm: midi.bpm,
      duration: midi.duration,
      note: 'Automatic Spotify SDK captures are metadata/audio-feature MIDI representations. Use Live Capture with tab/system audio for raw recorded audio.',
    };

    fs.writeFileSync(path.join(folderPath, 'metadata.json'), JSON.stringify(metadata, null, 2));
    fs.writeFileSync(path.join(folderPath, 'capture.mid'), midiFile);
    fs.writeFileSync(path.join(folderPath, 'midi.json'), JSON.stringify(midi, null, 2));
    fs.writeFileSync(path.join(folderPath, 'ascii.txt'), ascii);
    fs.writeFileSync(path.join(folderPath, 'art.svg'), svg);

    const artworks = readArtworkIndex().filter(item => item.id !== id);
    artworks.unshift(metadata);
    writeArtworkIndex(artworks);

    res.status(201).json({ artwork: metadata });
  } catch (error) {
    console.error('❌ Failed to save artwork:', error);
    res.status(500).json({ error: 'Failed to save artwork' });
  }
});

app.get('/api/artworks', (req, res) => {
  res.json({ artworks: readArtworkIndex() });
});

app.get('/artworks', (req, res) => {
  res.sendFile(path.join(__dirname, 'artwork-gallery.html'));
});

app.get('/artworks/', (req, res) => {
  res.sendFile(path.join(__dirname, 'artwork-gallery.html'));
});

app.use('/generated-artworks', express.static(ARTWORKS_DIR));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Catch all - serve index.html for SPA routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'midi-to-image', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
