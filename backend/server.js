const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
require('dotenv').config();
const { assertS3Config, listUserArt, sanitizeUserId, uploadAudioBundle, uploadGeneratedArt } = require('./s3Storage');
const awsConfig = require('./awsConfig');

const app = express();
const PORT = process.env.PORT || 5000;
const upload = multer({ storage: multer.memoryStorage() });

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'Backend is running', timestamp: new Date().toISOString() });
});

app.post('/api/uploads/audio', upload.single('audioFile'), async (req, res) => {
  try {
    const { generatedArt, label, userId } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'audioFile is required' });
    }

    if (!generatedArt) {
      return res.status(400).json({ error: 'generatedArt is required' });
    }

    const storageResult = await uploadAudioBundle({
      file,
      generatedArt,
      label: label || file.originalname,
      userId,
    });

    res.json({
      success: true,
      source: 'aws-s3',
      label: label || file.originalname,
      fileName: file.originalname,
      fileType: file.mimetype,
      fileSize: file.size,
      generatedArt,
      ...storageResult,
    });
  } catch (error) {
    console.error('audio upload error', error);
    res.status(500).json({
      error: 'Failed to upload audio bundle to S3',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

app.post('/api/uploads/art', async (req, res) => {
  try {
    const { generatedArt, input, label, mode, userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (!generatedArt && !input) {
      return res.status(400).json({ error: 'generatedArt or input is required' });
    }

    const art = generatedArt || input;
    const storageResult = await uploadGeneratedArt({
      generatedArt: art,
      input,
      label: label || `Manual ${mode || 'text'} snapshot`,
      mode: mode || 'text',
      userId,
    });

    res.json({
      success: true,
      source: 'manual',
      label: label || `Manual ${mode || 'text'} snapshot`,
      generatedArt: art,
      input,
      mode: mode || 'text',
      ...storageResult,
    });
  } catch (error) {
    console.error('art upload error', error);
    res.status(500).json({
      error: 'Failed to upload generated art to S3',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

app.get('/api/profiles/:userId/art', async (req, res) => {
  try {
    const userId = sanitizeUserId(req.params.userId);
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const items = await listUserArt({ userId, limit });

    res.json({
      success: true,
      userId,
      items,
    });
  } catch (error) {
    console.error('profile art list error', error);
    res.status(500).json({
      error: 'Failed to load profile art from S3',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

app.post('/api/process', (req, res) => {
  try {
    const { input, mode } = req.body;
    
    if (!input) {
      return res.status(400).json({ error: 'Input is required' });
    }

    // Process the input based on mode
    const result = {
      input,
      mode,
      processed: true,
      timestamp: new Date().toISOString(),
      data: input // In real app, you'd process this
    };

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/save-snapshot', (req, res) => {
  try {
    const { snapshot } = req.body;
    
    if (!snapshot) {
      return res.status(400).json({ error: 'Snapshot data is required' });
    }

    // In production, save to database
    res.json({
      success: true,
      id: Date.now(),
      message: 'Snapshot saved successfully',
      data: snapshot
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/snapshots', (req, res) => {
  try {
    // In production, fetch from database
    res.json({
      snapshots: [],
      total: 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  try {
    assertS3Config();
    console.log(`S3 uploads enabled: s3://${awsConfig.bucket}/${awsConfig.prefix}`);
    console.log('AWS credentials: using the default AWS SDK provider chain');
  } catch (error) {
    console.warn(`S3 uploads disabled: ${error.message}`);
  }
});
