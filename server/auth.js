const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const querystring = require('querystring');
require('dotenv').config();

const router = express.Router();

const SPOTIFY_ACCOUNTS = 'https://accounts.spotify.com';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || `${process.env.NGROK_URL || 'http://localhost:8888'}/auth/callback`;

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

router.get('/login', (req, res) => {
  const state = crypto.randomBytes(32).toString('hex');
  const pkce = createPkcePair();
  req.session.oauth_state = state;
  req.session.pkce_verifier = pkce.verifier;

  const scope = [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-read-recently-played'
  ].join(' ');

  const params = querystring.stringify({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope,
    redirect_uri: REDIRECT_URI,
    state,
    code_challenge_method: 'S256',
    code_challenge: pkce.challenge,
    show_dialog: 'true'
  });

  res.redirect(`${SPOTIFY_ACCOUNTS}/authorize?${params}`);
});

router.get('/callback', async (req, res) => {
  const code = req.query.code || null;
  const state = req.query.state || null;
  if (!code) return res.status(400).send({ error: 'Missing code' });
  if (!state || state !== req.session.oauth_state) {
    return res.status(400).json({ error: 'Invalid OAuth state' });
  }

  try {
    const tokenRes = await axios.post(
      `${SPOTIFY_ACCOUNTS}/api/token`,
      querystring.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        code_verifier: req.session.pkce_verifier
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;
    req.session.access_token = access_token;
    req.session.refresh_token = refresh_token;
    req.session.expires_in = expires_in;
    req.session.token_obtained_at = Math.floor(Date.now() / 1000);

    res.json({ access_token, expires_in });
  } catch (err) {
    console.error('Error exchanging code for token', err.response && err.response.data ? err.response.data : err.message);
    res.status(500).json({ error: 'Failed to exchange code for token' });
  }
});

router.post('/refresh', async (req, res) => {
  const refresh_token = req.body.refresh_token || req.session.refresh_token;
  if (!refresh_token) return res.status(400).json({ error: 'Missing refresh_token' });

  try {
    const tokenRes = await axios.post(
      `${SPOTIFY_ACCOUNTS}/api/token`,
      querystring.stringify({ grant_type: 'refresh_token', refresh_token, client_id: CLIENT_ID }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, expires_in } = tokenRes.data;
    req.session.access_token = access_token;
    req.session.expires_in = expires_in;
    req.session.token_obtained_at = Math.floor(Date.now() / 1000);
    res.json({ access_token, expires_in });
  } catch (err) {
    console.error('Error refreshing token', err.response && err.response.data ? err.response.data : err.message);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

router.get('/token', (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({
    access_token: req.session.access_token,
    expires_in: req.session.expires_in || 3600,
    token_type: 'Bearer',
  });
});

module.exports = router;
