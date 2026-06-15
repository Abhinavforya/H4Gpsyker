import { processFile } from './processor'
import { saveSnapshot } from './db'

export async function saveAudioUpload(file, profile) {
  if (!file) {
    throw new Error('An audio file is required')
  }

  if (!profile?.id) {
    throw new Error('Login to a profile before uploading audio')
  }

  const generatedArt = await processFile(file)
  const formData = new FormData()
  formData.append('audioFile', file)
  formData.append('generatedArt', generatedArt)
  formData.append('label', file.name)
  formData.append('userId', profile.id)

  const apiBaseUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5000'
  const response = await fetch(`${apiBaseUrl}/api/uploads/audio`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Upload failed (${response.status}): ${errorText}`)
  }

  const savedRecord = await response.json()
  const record = {
    ...savedRecord,
    kind: 'audio-upload',
    source: 'audio-upload',
    userId: profile.id,
    input: generatedArt,
    generatedArt,
  }

  const savedId = await saveSnapshot(record)

  return {
    ...record,
    id: savedId,
    createdAt: Date.now(),
  }
}
