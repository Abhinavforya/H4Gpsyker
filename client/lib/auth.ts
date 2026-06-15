type TokenPayload = {
  access_token: string;
  expires_in?: number;
  token_type?: string;
};

let tokenPayload: TokenPayload | null = null;
let expiresAt = 0;

export function loginToSpotify(authPath = '/auth/spotify') {
  window.location.href = authPath;
}

export async function logoutFromSpotify() {
  tokenPayload = null;
  expiresAt = 0;
  await fetch('/api/spotify/logout', {
    method: 'POST',
    credentials: 'include',
  });
}

export async function getSpotifyAccessToken(forceRefresh = false) {
  if (!forceRefresh && tokenPayload?.access_token && Date.now() < expiresAt - 60000) {
    return tokenPayload.access_token;
  }

  const response = await fetch('/api/spotify/token', {
    credentials: 'include',
  });

  if (!response.ok) {
    tokenPayload = null;
    expiresAt = 0;
    return null;
  }

  tokenPayload = await response.json();
  expiresAt = Date.now() + ((tokenPayload.expires_in || 3600) * 1000);
  return tokenPayload.access_token;
}

export function clearSpotifyToken() {
  tokenPayload = null;
  expiresAt = 0;
}
