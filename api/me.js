export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    res.status(401).json({ error: 'Missing access token' });
    return;
  }

  try {
    const response = await fetch('https://api.spotify.com/v1/me', {
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
      id: data.id,
      name: data.display_name,
      email: data.email,
      image: data.images?.[0]?.url || null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
}
