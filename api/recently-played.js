export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    res.status(401).json({ error: 'Missing access token' });
    return;
  }

  try {
    const response = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=50', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(response.status).json({ error: errorText });
      return;
    }

    const data = await response.json();
    const artistsMap = new Map();
    const songsMap = new Map();

    (data.items || []).forEach((item) => {
      const track = item.track;
      if (track) {
        // Collect unique songs
        if (!songsMap.has(track.id)) {
          songsMap.set(track.id, {
            id: track.id,
            name: track.name,
            artists: (track.artists || []).map((artist) => ({
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
        }

        // Collect unique artists
        (track.artists || []).forEach((artist) => {
          if (!artistsMap.has(artist.id)) {
            artistsMap.set(artist.id, {
              id: artist.id,
              name: artist.name,
              url: artist.external_urls?.spotify || null,
            });
          }
        });
      }
    });

    res.status(200).json({
      songs: Array.from(songsMap.values()).slice(0, 50),
      artists: Array.from(artistsMap.values()).slice(0, 30),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch recently played tracks' });
  }
}
