const path = require('path')
const { randomUUID } = require('crypto')
const { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3')
const awsConfig = require('./awsConfig')

const s3Client = new S3Client({
  region: awsConfig.region,
})

function assertS3Config() {
  if (!awsConfig.bucket) {
    throw new Error('Missing S3_UPLOAD_BUCKET environment variable')
  }
}

function sanitizeFilename(filename) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function sanitizeUserId(userId) {
  return String(userId || 'guest')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'guest'
}

function userPrefix(prefix, userId) {
  return path.posix.join(prefix, 'users', sanitizeUserId(userId))
}

function buildKey(prefix, folder, filename) {
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  return path.posix.join(prefix, folder, `${yyyy}`, `${mm}`, `${dd}`, `${randomUUID()}-${sanitizeFilename(filename)}`)
}

async function streamToString(stream) {
  const chunks = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf-8')
}

function buildPublicUrl(publicBaseUrl, key) {
  return publicBaseUrl ? `${publicBaseUrl.replace(/\/$/, '')}/${key}` : ''
}

async function uploadAudioBundle({ file, generatedArt, label, userId }) {
  const bucket = awsConfig.bucket
  const uploadPrefix = userPrefix(awsConfig.prefix, userId)
  const publicBaseUrl = awsConfig.publicBaseUrl

  assertS3Config()

  const audioKey = buildKey(uploadPrefix, 'audio', file.originalname)
  const artKey = buildKey(uploadPrefix, 'art', `${label || file.originalname}.txt`)
  const metadataKey = buildKey(uploadPrefix, 'metadata', `${label || file.originalname}.json`)

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
    userId: sanitizeUserId(userId),
    label: label || file.originalname,
    fileName: file.originalname,
    fileType: file.mimetype,
    fileSize: file.size,
    source: 'audio-upload',
    generatedArt,
    audioKey,
    artKey,
    metadataKey,
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
    userId: sanitizeUserId(userId),
    audioKey,
    artKey,
    metadataKey,
    audioUrl: buildPublicUrl(publicBaseUrl, audioKey),
    artUrl: buildPublicUrl(publicBaseUrl, artKey),
    metadataUrl: buildPublicUrl(publicBaseUrl, metadataKey),
  }
}

async function uploadGeneratedArt({ generatedArt, label, mode, input, userId }) {
  const bucket = awsConfig.bucket
  const uploadPrefix = userPrefix(awsConfig.prefix, userId)
  const publicBaseUrl = awsConfig.publicBaseUrl

  assertS3Config()

  const safeLabel = label || 'Generated art'
  const artKey = buildKey(uploadPrefix, 'art', `${safeLabel}.txt`)
  const metadataKey = buildKey(uploadPrefix, 'metadata', `${safeLabel}.json`)

  await s3Client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: artKey,
    Body: generatedArt,
    ContentType: 'text/plain; charset=utf-8',
    Metadata: {
      label: String(safeLabel).slice(0, 200),
      source: 'manual',
    },
  }))

  const payload = {
    userId: sanitizeUserId(userId),
    label: safeLabel,
    mode,
    input,
    source: 'manual',
    generatedArt,
    artKey,
    metadataKey,
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
    userId: sanitizeUserId(userId),
    artKey,
    metadataKey,
    artUrl: buildPublicUrl(publicBaseUrl, artKey),
    metadataUrl: buildPublicUrl(publicBaseUrl, metadataKey),
  }
}

async function listUserArt({ userId, limit = 50 }) {
  const bucket = awsConfig.bucket
  const publicBaseUrl = awsConfig.publicBaseUrl
  const metadataPrefix = path.posix.join(userPrefix(awsConfig.prefix, userId), 'metadata')

  assertS3Config()

  const objects = []
  let continuationToken

  do {
    const listed = await s3Client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: metadataPrefix,
      MaxKeys: 1000,
      ContinuationToken: continuationToken,
    }))

    objects.push(...(listed.Contents || []))
    continuationToken = listed.NextContinuationToken
  } while (continuationToken && objects.length < 1000)

  const items = await Promise.all(objects.map(async object => {
    const result = await s3Client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: object.Key,
    }))
    const metadata = JSON.parse(await streamToString(result.Body))
    return {
      ...metadata,
      bucket,
      userId: sanitizeUserId(userId),
      metadataKey: object.Key,
      audioUrl: metadata.audioKey ? buildPublicUrl(publicBaseUrl, metadata.audioKey) : '',
      artUrl: metadata.artKey ? buildPublicUrl(publicBaseUrl, metadata.artKey) : '',
      metadataUrl: buildPublicUrl(publicBaseUrl, object.Key),
    }
  }))

  return items
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, limit)
}

module.exports = {
  assertS3Config,
  listUserArt,
  sanitizeUserId,
  uploadGeneratedArt,
  uploadAudioBundle,
}
