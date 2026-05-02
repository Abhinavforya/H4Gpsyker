export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    res.status(401).json({ error: 'Missing access token' });
    return;
  }

  try {
    const response = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
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
    res.status(200).json({
      playlists: (data.items || []).map((playlist) => ({
        id: playlist.id,
        name: playlist.name,
        desc: playlist.description || '',
        image: playlist.images?.[0]?.url || null,
        url: playlist.external_urls?.spotify || null,
        trackCount: playlist.tracks?.total || 0,
        owner: playlist.owner?.display_name || 'Unknown',
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch playlists' });
  }
}
