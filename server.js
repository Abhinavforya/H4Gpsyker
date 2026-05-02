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

// Spotify OAuth Configuration
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:8000/auth/spotify/callback';

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

// Middleware
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
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
    const response = await axios.get(`${SPOTIFY_API_URL}/audio-features`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      params: { ids: batch.join(',') }
    });

    for (const feature of response.data.audio_features || []) {
      if (feature && feature.id) {
        featuresById.set(feature.id, feature);
      }
    }
  }

  return featuresById;
}

// Serve static files from the app folder
app.use('/midi-to-image', express.static(path.join(__dirname, 'midi-to-image')));

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

// ==================== SPOTIFY OAUTH ROUTES ====================

// Step 1: Redirect user to Spotify login
app.get('/auth/spotify', (req, res) => {
  const state = crypto.randomBytes(32).toString('hex');
  req.session.oauth_state = state;
  
  const scopes = [
    'user-read-private',
    'user-read-email',
    'user-library-read',
    'user-top-read',
    'playlist-read-private',
    'playlist-read-collaborative',
  ].join(' ');

  const authUrl = new URL(SPOTIFY_AUTH_URL);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('client_id', SPOTIFY_CLIENT_ID);
  authUrl.searchParams.append('scope', scopes);
  authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.append('state', state);

  console.log('🎵 Redirecting to Spotify login...');
  res.redirect(authUrl.toString());
});

// Step 2: Handle Spotify callback
app.get('/auth/spotify/callback', async (req, res) => {
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
      client_secret: SPOTIFY_CLIENT_SECRET,
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

    res.redirect('/midi-to-image/index.html?spotify_connected=true');
  } catch (err) {
    console.error('❌ Token exchange failed:', err.message);
    console.error('   Full error:', err.response?.data || err);
    console.error('   REDIRECT_URI:', REDIRECT_URI);
    console.error('   CLIENT_ID:', SPOTIFY_CLIENT_ID?.substring(0, 8) + '...');
    res.redirect(`/midi-to-image/index.html?error=token_exchange_failed`);
  }
});

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
        client_secret: SPOTIFY_CLIENT_SECRET,
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
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    await ensureValidToken(req);
    
    const playlistItems = await fetchAllPlaylistTracks(req.session.access_token, playlistId);
    const trackIds = playlistItems
      .map(item => item.track?.id)
      .filter(Boolean);
    const audioFeatures = await fetchAudioFeatures(req.session.access_token, trackIds);

    const tracks = playlistItems
      .filter(item => item.track) // Filter out null tracks
      .map(item => ({
        id: item.track.id,
        name: item.track.name,
        artists: item.track.artists?.map(a => a.name).join(', '),
        duration: item.track.duration_ms,
        previewUrl: item.track.preview_url,
        image: item.track.album?.images?.[0]?.url,
        explicit: item.track.explicit,
        popularity: item.track.popularity,
        audioFeatures: audioFeatures.get(item.track.id) || null
      }));

    res.json({ tracks, total: playlistItems.length });
  } catch (err) {
    console.error('❌ Failed to fetch playlist tracks:', err.message);
    res.status(500).json({ error: 'Failed to fetch playlist tracks' });
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
