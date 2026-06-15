const path = require('path')
const { randomUUID } = require('crypto')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required AWS environment variable: ${name}`)
  }
  return value
}

const s3Client = new S3Client({
  region: requireEnv('AWS_REGION'),
})

function sanitizeFilename(filename) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function buildKey(prefix, filename) {
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  return path.posix.join(prefix, `${yyyy}`, `${mm}`, `${dd}`, `${randomUUID()}-${sanitizeFilename(filename)}`)
}

async function uploadAudioBundle({ file, generatedArt, label }) {
  const bucket = requireEnv('AWS_S3_BUCKET')
  const uploadPrefix = process.env.AWS_S3_PREFIX || 'ascii-framer/uploads'
  const publicBaseUrl = process.env.AWS_S3_PUBLIC_BASE_URL || ''

  const audioKey = buildKey(path.posix.join(uploadPrefix, 'audio'), file.originalname)
  const artKey = buildKey(path.posix.join(uploadPrefix, 'art'), `${label || file.originalname}.txt`)
  const metadataKey = buildKey(path.posix.join(uploadPrefix, 'metadata'), `${label || file.originalname}.json`)

  await s3Client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: audioKey,
    Body: file.buffer,
    ContentType: file.mimetype || 'application/octet-stream',
    Metadata: {
      label: String(label || file.originalname).slice(0, 200),
      source: 'audio-upload',
    },
  }))

  await s3Client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: artKey,
    Body: generatedArt,
    ContentType: 'text/plain; charset=utf-8',
  }))

  const payload = {
    label: label || file.originalname,
    fileName: file.originalname,
    fileType: file.mimetype,
    fileSize: file.size,
    audioKey,
    artKey,
    createdAt: new Date().toISOString(),
  }

  await s3Client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: metadataKey,
    Body: JSON.stringify(payload, null, 2),
    ContentType: 'application/json; charset=utf-8',
  }))

  return {
    bucket,
    audioKey,
    artKey,
    metadataKey,
    audioUrl: publicBaseUrl ? `${publicBaseUrl.replace(/\/$/, '')}/${audioKey}` : '',
    artUrl: publicBaseUrl ? `${publicBaseUrl.replace(/\/$/, '')}/${artKey}` : '',
    metadataUrl: publicBaseUrl ? `${publicBaseUrl.replace(/\/$/, '')}/${metadataKey}` : '',
  }
}

module.exports = {
  uploadAudioBundle,
}
