export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    res.status(401).json({ error: 'Missing access token' });
    return;
  }

  const playlistId = req.query?.playlistId || req.query?.id || req.url?.split('/').filter(Boolean).slice(-2, -1)[0];

  if (!playlistId) {
    res.status(400).json({ error: 'Missing playlist id' });
    return;
  }

  try {
    const tracks = [];
    let nextUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

    while (nextUrl) {
      const response = await fetch(nextUrl, {
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
      tracks.push(...(data.items || []));
      nextUrl = data.next;
    }

    const audioFeatures = new Map();
    const trackIds = tracks.map((item) => item.track?.id).filter(Boolean);

    for (let index = 0; index < trackIds.length; index += 100) {
      const batch = trackIds.slice(index, index + 100);
      const featuresRes = await fetch(`https://api.spotify.com/v1/audio-features?ids=${batch.join(',')}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (featuresRes.ok) {
        const featuresData = await featuresRes.json();
        for (const feature of featuresData.audio_features || []) {
          if (feature?.id) {
            audioFeatures.set(feature.id, feature);
          }
        }
      }
    }

    const normalizedTracks = tracks
      .filter((item) => item.track)
      .map((item) => ({
        id: item.track.id,
        name: item.track.name,
        artists: item.track.artists?.map((artist) => artist.name).join(', '),
        duration: item.track.duration_ms,
        previewUrl: item.track.preview_url,
        image: item.track.album?.images?.[0]?.url || null,
        explicit: item.track.explicit,
        popularity: item.track.popularity,
        audioFeatures: audioFeatures.get(item.track.id) || null,
      }));

    res.status(200).json({ tracks: normalizedTracks });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch playlist tracks' });
  }
}
