const apiBaseUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5000'

export async function getProfileArt(userId) {
  if (!userId) return []

  const response = await fetch(`${apiBaseUrl}/api/profiles/${encodeURIComponent(userId)}/art`)
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Profile art load failed (${response.status}): ${errorText}`)
  }

  const payload = await response.json()
  return payload.items || []
}

export async function saveProfileArt({ userId, input, mode, label, generatedArt }) {
  if (!userId) {
    throw new Error('Login to a profile before saving art')
  }

  const response = await fetch(`${apiBaseUrl}/api/uploads/art`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId,
      input,
      mode,
      label,
      generatedArt: generatedArt || input,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Art save failed (${response.status}): ${errorText}`)
  }

  return response.json()
}
