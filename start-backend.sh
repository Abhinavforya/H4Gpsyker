#!/bin/bash

# SonicCanvas Startup Script
# Starts the Flask backend for audio analysis and visualization

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="/home/linuxbrew/.linuxbrew/bin/python3.12"

echo "🎵 SonicCanvas Backend Startup"
echo "=============================="
echo "Project: $PROJECT_DIR"
echo ""

# Check Python
echo "✓ Python: $($PYTHON_BIN --version)"

# Check required files
echo "✓ Backend: app_backend.py"
echo "✓ Audio Analyzer: audio_analyzer.py"
echo "✓ Art Generator: art_generator.py"
echo "✓ Event Processor: event_processor.py"
echo "✓ Spotify API: spotify_api.py"
echo ""

# Environment setup
export PYTHONUNBUFFERED=1
export FLASK_APP="$PROJECT_DIR/app_backend.py"
export FLASK_ENV="development"
export FLASK_DEBUG=1
export FLASK_PORT=5000

echo "🚀 Starting Flask backend on http://localhost:5000"
echo ""

# Start the backend
cd "$PROJECT_DIR"
$PYTHON_BIN -m flask run --host=0.0.0.0 --port=5000
