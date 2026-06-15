const path = require('path')
const { randomUUID } = require('crypto')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const awsConfig = require('./awsConfig')

const s3Client = new S3Client({
  region: awsConfig.region,
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
  const bucket = awsConfig.bucket
  const uploadPrefix = awsConfig.prefix
  const publicBaseUrl = awsConfig.publicBaseUrl

  if (!bucket) {
    throw new Error('Missing S3 bucket configuration')
  }

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
