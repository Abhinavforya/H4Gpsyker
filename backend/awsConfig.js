module.exports = {
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
  bucket: process.env.S3_UPLOAD_BUCKET || 'nino87',
  prefix: process.env.S3_UPLOAD_PREFIX || 'ascii-framer/uploads',
  publicBaseUrl: process.env.S3_PUBLIC_BASE_URL || '',
}
