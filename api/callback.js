export default async function handler(req, res) {
  const code = (req.query && req.query.code) || (req.url && new URL(req.url, 'http://localhost').searchParams.get('code'));
  const state = (req.query && req.query.state) || (req.url && new URL(req.url, 'http://localhost').searchParams.get('state'));

  if (!code) {
    res.status(400).json({ error: 'Missing code in callback request' });
    return;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const forwardedHost = req.headers['x-forwarded-host'] || req.headers.host || process.env.VERCEL_URL || '';
  const forwardedProto = req.headers['x-forwarded-proto'] || (process.env.VERCEL ? 'https' : 'http');
  const siteUrl = process.env.SPOTIFY_SITE_URL || (forwardedHost ? `${forwardedProto}://${forwardedHost}` : '');
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || (siteUrl ? `${siteUrl}/api/callback` : '');
  const defaultPostLoginPath = process.env.SPOTIFY_POST_LOGIN_PATH || '/spotify.html';
  let postLoginPath = defaultPostLoginPath;

  try {
    if (state) {
      const decodedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
      if (typeof decodedState.next === 'string' && decodedState.next.startsWith('/')) {
        postLoginPath = decodedState.next;
      }
    }
  } catch {
    postLoginPath = defaultPostLoginPath;
  }

  if (!clientId || !clientSecret || !redirectUri) {
    res.status(500).json({ error: 'Missing Spotify client configuration' });
    return;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const params = new URLSearchParams();
  params.append('grant_type', 'authorization_code');
  params.append('code', code);
  params.append('redirect_uri', redirectUri);

  try {
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await tokenRes.json();

    if (!tokenRes.ok) {
      res.status(tokenRes.status || 500).json({ error: data });
      return;
    }

    const accessToken = data.access_token;
    if (!accessToken) {
      res.status(500).json({ error: 'No access token returned' });
      return;
    }

    const appOrigin = siteUrl || `${forwardedProto}://${forwardedHost || 'localhost'}`;
    const redirectTo = `${appOrigin}${postLoginPath}?token=${encodeURIComponent(accessToken)}`;
    if (typeof res.redirect === 'function') {
      res.redirect(redirectTo);
    } else {
      res.writeHead(302, { Location: redirectTo });
      res.end();
    }
  } catch (err) {
    res.status(500).json({ error: 'Token exchange failed' });
  }
}
