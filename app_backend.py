"""
SonicCanvas Backend - Main Flask Application
Handles audio analysis, Spotify integration, and visualization generation
"""

import os
import json
import secrets
import requests
from urllib.parse import urlencode
from flask import Flask, session, request, redirect, jsonify, render_template_string, send_file
from flask_cors import CORS
from dotenv import load_dotenv
from werkzeug.utils import secure_filename
from pathlib import Path
import tempfile
import traceback
from audio_analyzer import AudioAnalyzer
from art_generator import ASCIIArtGenerator, P5CanvasConfig
from spotify_api import SpotifyAPI
from event_processor import EventProcessor

# Load environment variables
load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv('FLASK_SECRET_KEY', secrets.token_hex(32))

# Enable CORS
NGROK_URL = os.getenv('NGROK_URL', 'http://localhost:8000')
CORS(app, origins=[
    'http://localhost:3000',
    'http://localhost:8000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8000',
    NGROK_URL
], credentials=True)

# Configuration
UPLOAD_FOLDER = tempfile.gettempdir()
ALLOWED_EXTENSIONS = {'mp3', 'wav', 'ogg', 'flac'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50 MB

# Initialize components
analyzer = AudioAnalyzer()
event_processor = EventProcessor()
spotify_api = SpotifyAPI()

# Spotify OAuth Configuration
SPOTIFY_CLIENT_ID = os.getenv('SPOTIFY_CLIENT_ID')
SPOTIFY_CLIENT_SECRET = os.getenv('SPOTIFY_CLIENT_SECRET')
REDIRECT_URI = os.getenv('REDIRECT_URI', f"{NGROK_URL}/auth/spotify/callback")

SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_API_URL = "https://api.spotify.com/v1"

SCOPES = [
    'user-read-private',
    'user-read-email',
    'user-library-read',
    'user-top-read',
    'user-currently-playing',
    'user-read-playback-state',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-read-recently-played',
]


def ensure_valid_token(session):
    """Refresh token if expired"""
    import time
    if not session.get('spotify_refresh_token'):
        raise Exception('No refresh token available')
    
    now = int(time.time())
    token_obtained_at = session.get('spotify_token_obtained_at', now)
    expires_in = session.get('spotify_token_expires', 3600)
    token_age = now - token_obtained_at
    
    # Refresh if token is within 5 minutes of expiration
    if token_age > expires_in - 300:
        print('🔄 Token expiring soon, refreshing...')
        try:
            token_data = {
                'grant_type': 'refresh_token',
                'refresh_token': session.get('spotify_refresh_token'),
                'client_id': SPOTIFY_CLIENT_ID,
                'client_secret': SPOTIFY_CLIENT_SECRET,
            }
            
            response = requests.post(SPOTIFY_TOKEN_URL, data=token_data)
            if response.status_code != 200:
                raise Exception('Failed to refresh token')
            
            token_info = response.json()
            session['spotify_access_token'] = token_info['access_token']
            session['spotify_token_expires'] = token_info.get('expires_in', 3600)
            session['spotify_token_obtained_at'] = now
            print('✅ Token refreshed!')
        except Exception as e:
            print(f'❌ Token refresh failed: {e}')
            raise


def allowed_file(filename: str) -> bool:
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'timestamp': __import__('datetime').datetime.now().isoformat()})


@app.route('/api/upload', methods=['POST'])
def upload_audio():
    """Upload and analyze audio file"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'File type not allowed'}), 400
        
        # Save file temporarily
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        try:
            # Load and analyze audio
            waveform, sr = analyzer.load_audio(filepath)
            
            # Generate event stream
            analysis_data = analyzer.generate_event_stream(waveform, sr)
            
            # Process events
            processed_events = event_processor.normalize_events(analysis_data['events'])
            
            # Get style preference (default for MVP)
            style_config = P5CanvasConfig(
                preferred_style='geometric',
                color_palette=['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A'],
                motion_intensity=0.8
            )
            
            # Generate ASCII art
            ascii_art = ASCIIArtGenerator.from_events(processed_events)
            
            # Generate p5.js configuration
            p5_config = style_config.to_dict()
            
            response_data = {
                'success': True,
                'metadata': analysis_data['metadata'],
                'events': processed_events,
                'ascii_art': ascii_art,
                'p5_config': p5_config,
                'total_events': len(processed_events)
            }
            
            return jsonify(response_data)
            
        finally:
            # Clean up uploaded file
            if os.path.exists(filepath):
                os.remove(filepath)
    
    except Exception as e:
        print(f"Error in upload_audio: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e), 'type': 'analysis_error'}), 500


@app.route('/api/spotify/login', methods=['GET'])
def spotify_login():
    """Initiate Spotify OAuth flow"""
    try:
        state = secrets.token_urlsafe(32)
        session['spotify_auth_state'] = state
        
        params = {
            'client_id': SPOTIFY_CLIENT_ID,
            'response_type': 'code',
            'redirect_uri': REDIRECT_URI,
            'state': state,
            'scope': ' '.join(SCOPES),
            'show_dialog': True
        }
        
        auth_url = f"{SPOTIFY_AUTH_URL}?{urlencode(params)}"
        return jsonify({'auth_url': auth_url})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/auth/spotify/callback', methods=['GET'])
def spotify_callback():
    """Handle Spotify OAuth callback"""
    try:
        code = request.args.get('code')
        state = request.args.get('state')
        
        if not code or state != session.get('spotify_auth_state'):
            return jsonify({'error': 'Invalid state or no authorization code'}), 400
        
        # Exchange code for access token
        token_data = {
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': REDIRECT_URI,
            'client_id': SPOTIFY_CLIENT_ID,
            'client_secret': SPOTIFY_CLIENT_SECRET,
        }
        
        response = requests.post(SPOTIFY_TOKEN_URL, data=token_data)
        if response.status_code != 200:
            return jsonify({'error': 'Failed to get access token'}), 400
        
        token_info = response.json()
        import time
        session['spotify_access_token'] = token_info['access_token']
        session['spotify_refresh_token'] = token_info.get('refresh_token')
        session['spotify_token_expires'] = token_info.get('expires_in', 3600)
        session['spotify_token_obtained_at'] = int(time.time())
        
        # Redirect to frontend
        return redirect(f"http://localhost:8000/api/spotify/success?access_token={token_info['access_token']}")
    
    except Exception as e:
        print(f"Spotify callback error: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/spotify/recently-played', methods=['GET'])
def get_recently_played():
    """Get user's recently played tracks from Spotify"""
    try:
        access_token = session.get('spotify_access_token')
        if not access_token:
            return jsonify({'error': 'Not authenticated with Spotify'}), 401
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        response = requests.get(
            f'{SPOTIFY_API_URL}/me/player/recently-played',
            headers=headers,
            params={'limit': 10}
        )
        
        if response.status_code != 200:
            return jsonify({'error': 'Failed to fetch recently played tracks'}), 500
        
        tracks = response.json().get('items', [])
        
        track_list = []
        for item in tracks:
            track = item['track']
            track_list.append({
                'id': track['id'],
                'name': track['name'],
                'artist': ', '.join([a['name'] for a in track['artists']]),
                'album': track['album']['name'],
                'duration_ms': track['duration_ms'],
                'preview_url': track.get('preview_url'),
                'external_url': track['external_urls'].get('spotify'),
                'image': track['album']['images'][0]['url'] if track['album']['images'] else None
            })
        
        return jsonify({'tracks': track_list})
    
    except Exception as e:
        print(f"Error getting recently played: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/spotify/currently-playing', methods=['GET'])
def get_currently_playing():
    """Get currently playing track from Spotify"""
    try:
        access_token = session.get('spotify_access_token')
        if not access_token:
            return jsonify({'error': 'Not authenticated with Spotify'}), 401
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        response = requests.get(
            f'{SPOTIFY_API_URL}/me/player/currently-playing',
            headers=headers
        )
        
        if response.status_code == 204:
            return jsonify({'currently_playing': None})
        
        if response.status_code != 200:
            return jsonify({'error': 'Failed to fetch currently playing'}), 500
        
        data = response.json()
        
        if not data.get('item'):
            return jsonify({'currently_playing': None})
        
        track = data['item']
        currently_playing = {
            'id': track['id'],
            'name': track['name'],
            'artist': ', '.join([a['name'] for a in track['artists']]),
            'album': track['album']['name'],
            'duration_ms': track['duration_ms'],
            'progress_ms': data.get('progress_ms', 0),
            'is_playing': data.get('is_playing', False),
            'image': track['album']['images'][0]['url'] if track['album']['images'] else None
        }
        
        return jsonify({'currently_playing': currently_playing})
    
    except Exception as e:
        print(f"Error getting currently playing: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/preview', methods=['POST'])
def preview_preview():
    """Generate preview visualization for a Spotify preview URL"""
    try:
        data = request.get_json()
        preview_url = data.get('preview_url')
        
        if not preview_url:
            return jsonify({'error': 'No preview URL provided'}), 400
        
        # Download preview audio
        response = requests.get(preview_url)
        if response.status_code != 200:
            return jsonify({'error': 'Failed to download preview'}), 500
        
        # Save temporarily
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], 'preview.mp3')
        with open(filepath, 'wb') as f:
            f.write(response.content)
        
        try:
            # Analyze audio
            waveform, sr = analyzer.load_audio(filepath)
            analysis_data = analyzer.generate_event_stream(waveform, sr)
            processed_events = event_processor.normalize_events(analysis_data['events'])
            ascii_art = ASCIIArtGenerator.from_events(processed_events)
            
            response_data = {
                'success': True,
                'metadata': analysis_data['metadata'],
                'events': processed_events,
                'ascii_art': ascii_art,
                'total_events': len(processed_events)
            }
            
            return jsonify(response_data)
        
        finally:
            if os.path.exists(filepath):
                os.remove(filepath)
    
    except Exception as e:
        print(f"Error in preview: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/', methods=['GET'])
def index():
    """Root endpoint"""
    return redirect('/health')


if __name__ == '__main__':
    app.run(
        host='0.0.0.0',
        port=int(os.getenv('FLASK_PORT', 5000)),
        debug=os.getenv('FLASK_DEBUG', False),
        use_reloader=False
    )
