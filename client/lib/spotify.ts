export async function fetchAudioFeatures(accessToken: string, trackId: string) {
  const resp = await fetch(`/api/audio-features/${trackId}`, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!resp.ok) throw new Error('Failed to fetch audio features');
  const payload = await resp.json();
  return payload.normalized || payload;
}

export async function fetchCurrentlyPlaying(accessToken: string) {
  const resp = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (resp.status === 204) return null;
  if (!resp.ok) throw new Error('Failed to fetch currently playing track');
  return resp.json();
}

export function normalizeFeatures(features: any) {
  if (!features) return null;
  return {
    tempo: features.tempo || 0,
    energy: features.energy || 0,
    valence: features.valence || 0,
    danceability: features.danceability || 0,
    loudness: features.loudness || 0
  };
}
