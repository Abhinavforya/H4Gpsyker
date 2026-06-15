const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'Backend is running', timestamp: new Date().toISOString() });
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
});
