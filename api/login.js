import crypto from 'crypto';

export default function handler(req, res) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const forwardedHost = req.headers['x-forwarded-host'] || req.headers.host || process.env.VERCEL_URL || '';
  const forwardedProto = req.headers['x-forwarded-proto'] || (process.env.VERCEL ? 'https' : 'http');
  const siteUrl = process.env.SPOTIFY_SITE_URL || (forwardedHost ? `${forwardedProto}://${forwardedHost}` : '');
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || (siteUrl ? `${siteUrl}/api/callback` : '');
  const scope = 'user-read-private user-read-email playlist-read-private user-read-recently-played';
  const requestedNext = typeof req.query?.next === 'string' && req.query.next.startsWith('/') ? req.query.next : (process.env.SPOTIFY_POST_LOGIN_PATH || '/spotify.html');

  if (!clientId || !redirectUri) {
    res.status(500).json({ error: 'Missing Spotify client configuration' });
    return;
  }

  const state = Buffer.from(JSON.stringify({
    nonce: crypto.randomBytes(16).toString('hex'),
    next: requestedNext,
  })).toString('base64url');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope,
    redirect_uri: redirectUri,
    state,
  });

  const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;

  if (typeof res.redirect === 'function') {
    res.redirect(authUrl);
  } else {
    res.writeHead(302, { Location: authUrl });
    res.end();
  }
}
