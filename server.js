/**
 * server.js
 * Express backend for MIDI to Image conversion
 * Serves static files and health check endpoint
 */

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const session = require('express-session');
const axios = require('axios');
const crypto = require('crypto');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;
app.set('trust proxy', true);

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

if (!process.env.SESSION_SECRET) {
  console.warn('⚠️ SESSION_SECRET is not set. Using a stable development secret.');
}

function getPublicOrigin(req) {
  const configuredOrigin = process.env.SPOTIFY_SITE_URL || process.env.NGROK_URL;
  if (configuredOrigin) {
    return configuredOrigin.replace(/\/$/, '');
  }

  const forwardedProto = (req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const proto = forwardedProto || req.protocol || 'http';
  return `${proto}://${req.get('host')}`;
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
    const redirectUrl = new URL('/cozy-player', getPublicOrigin(req));

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
