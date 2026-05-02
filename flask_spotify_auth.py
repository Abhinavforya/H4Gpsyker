"""
Flask Spotify OAuth Implementation
Handles Spotify authentication and token management with ngrok support
"""

import os
import json
import secrets
import requests
from urllib.parse import urlencode
from flask import Flask, session, request, redirect, jsonify, render_template_string
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv('FLASK_SECRET_KEY', secrets.token_hex(32))

# Spotify OAuth Configuration
SPOTIFY_CLIENT_ID = os.getenv('SPOTIFY_CLIENT_ID')
SPOTIFY_CLIENT_SECRET = os.getenv('SPOTIFY_CLIENT_SECRET')
NGROK_URL = os.getenv('NGROK_URL', 'http://localhost:5000')
REDIRECT_URI = os.getenv('REDIRECT_URI', f"{NGROK_URL}/callback")

# Spotify OAuth endpoints
SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_API_URL = "https://api.spotify.com/v1"

# Scope - what permissions we're requesting
SCOPES = [
    'user-read-private',
    'user-read-email',
    'user-library-read',
    'user-top-read',
    'playlist-read-private',
    'playlist-read-collaborative',
]


@app.route('/')
def index():
    """Home page with login button"""
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Spotify OAuth with Flask</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; }
            .container { background: #1DB954; color: white; padding: 30px; border-radius: 10px; }
            button { background: white; color: #1DB954; border: none; padding: 10px 20px; 
                     border-radius: 20px; cursor: pointer; font-weight: bold; }
            button:hover { background: #f0f0f0; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🎵 Spotify OAuth Demo</h1>
            <p>Login with your Spotify account to see your top tracks and playlists</p>
            <a href="/login"><button>Login with Spotify</button></a>
        </div>
    </body>
    </html>
    """
    return render_template_string(html)


@app.route('/login')
def login():
    """Step 1: Redirect user to Spotify for authentication"""
    
    # Generate a random state to prevent CSRF attacks
    state = secrets.token_urlsafe(32)
    session['oauth_state'] = state
    
    # Build authorization URL
    auth_params = {
        'client_id': SPOTIFY_CLIENT_ID,
        'response_type': 'code',
        'redirect_uri': REDIRECT_URI,
        'scope': ' '.join(SCOPES),
        'state': state,
        'show_dialog': True  # Force user to approve every time
    }
    
    auth_url = f"{SPOTIFY_AUTH_URL}?{urlencode(auth_params)}"
    print(f"🔐 Redirecting to Spotify: {auth_url}")
    
    return redirect(auth_url)


@app.route('/callback')
def callback():
    """Step 2: Handle callback from Spotify"""
    
    # Verify state to prevent CSRF
    state = request.args.get('state')
    if not state or state != session.get('oauth_state'):
        return jsonify({'error': 'State mismatch - CSRF attack detected'}), 400
    
    # Check for authorization errors
    error = request.args.get('error')
    if error:
        return jsonify({'error': f'Authorization failed: {error}'}), 400
    
    # Get authorization code
    code = request.args.get('code')
    if not code:
        return jsonify({'error': 'No authorization code received'}), 400
    
    print(f"✅ Authorization code received: {code[:20]}...")
    
    # Exchange code for access token
    token_data = {
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': REDIRECT_URI,
        'client_id': SPOTIFY_CLIENT_ID,
        'client_secret': SPOTIFY_CLIENT_SECRET
    }
    
    try:
        response = requests.post(SPOTIFY_TOKEN_URL, data=token_data, timeout=10)
        response.raise_for_status()
        tokens = response.json()
        
        # Store tokens in session
        session['access_token'] = tokens['access_token']
        session['refresh_token'] = tokens.get('refresh_token')
        session['expires_in'] = tokens['expires_in']
        
        print(f"🎵 Access token obtained! Expires in: {tokens['expires_in']} seconds")
        
        return redirect('/profile')
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Token exchange failed: {e}")
        return jsonify({'error': f'Token exchange failed: {str(e)}'}), 500


@app.route('/profile')
def profile():
    """Display user profile and Spotify data"""
    
    access_token = session.get('access_token')
    if not access_token:
        return redirect('/login')
    
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }
    
    try:
        # Get current user profile
        user_response = requests.get(
            f"{SPOTIFY_API_URL}/me",
            headers=headers,
            timeout=10
        )
        user_response.raise_for_status()
        user = user_response.json()
        
        # Get user's top tracks
        tracks_response = requests.get(
            f"{SPOTIFY_API_URL}/me/top/tracks?limit=5",
            headers=headers,
            timeout=10
        )
        tracks_response.raise_for_status()
        top_tracks = tracks_response.json()
        
        # Build HTML response
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Your Spotify Profile</title>
            <style>
                body {{ font-family: Arial, sans-serif; max-width: 800px; margin: 20px auto; }}
                .profile {{ background: #1DB954; color: white; padding: 20px; border-radius: 10px; }}
                .section {{ margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 5px; }}
                .track {{ background: white; padding: 10px; margin: 5px 0; border-radius: 5px; }}
                button {{ background: #1DB954; color: white; border: none; padding: 10px 20px; 
                         border-radius: 5px; cursor: pointer; }}
                button:hover {{ background: #1ed760; }}
                a {{ color: #1DB954; text-decoration: none; }}
                .user-image {{ width: 100px; height: 100px; border-radius: 50%; margin: 10px 0; }}
            </style>
        </head>
        <body>
            <div class="profile">
                <h1>🎵 Welcome, {user.get('display_name', 'User')}!</h1>
        """
        
        # Add profile image if available
        if user.get('images') and len(user['images']) > 0:
            html += f"<img src='{user['images'][0]['url']}' class='user-image' alt='Profile'><br>"
        
        html += f"""
                <p>📧 Email: {user.get('email', 'N/A')}</p>
                <p>🌍 Country: {user.get('country', 'N/A')}</p>
                <p>👥 Followers: {user.get('followers', {{}}).get('total', 0)}</p>
            </div>
            
            <div class="section">
                <h2>🎸 Your Top 5 Tracks</h2>
        """
        
        for track in top_tracks.get('items', []):
            artists = ', '.join([artist['name'] for artist in track['artists']])
            html += f"""
                <div class="track">
                    <strong>{track['name']}</strong><br>
                    by {artists}<br>
                    <small>Album: {track['album']['name']}</small>
                </div>
            """
        
        html += """
            </div>
            
            <div class="section">
                <h2>🔧 Session Data</h2>
                <button onclick="copyToken()">Copy Access Token</button>
                <button onclick="document.body.innerHTML=document.getElementById('token').innerText">Show Full Response</button>
                <div id="token" style="display:none;"><pre>""" + json.dumps(user, indent=2) + """</pre></div>
            </div>
            
            <div>
                <a href="/logout"><button style="background: #ff4444;">Logout</button></a>
            </div>
            
            <script>
                function copyToken() {
                    const token = '""" + access_token[:20] + """...';
                    navigator.clipboard.writeText(token);
                    alert('Token copied to clipboard (truncated for security)');
                }
            </script>
        </body>
        </html>
        """
        
        return html
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Failed to fetch user profile: {e}")
        return jsonify({'error': f'Failed to fetch profile: {str(e)}'}), 500


@app.route('/logout')
def logout():
    """Clear session and logout"""
    session.clear()
    return redirect('/')


@app.route('/api/user')
def api_user():
    """API endpoint to get current user data as JSON"""
    
    access_token = session.get('access_token')
    if not access_token:
        return jsonify({'error': 'Not authenticated'}), 401
    
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }
    
    try:
        response = requests.get(
            f"{SPOTIFY_API_URL}/me",
            headers=headers,
            timeout=10
        )
        response.raise_for_status()
        return jsonify(response.json())
        
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/top-tracks')
def api_top_tracks():
    """API endpoint to get top tracks as JSON"""
    
    access_token = session.get('access_token')
    if not access_token:
        return jsonify({'error': 'Not authenticated'}), 401
    
    limit = request.args.get('limit', 10, type=int)
    
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }
    
    try:
        response = requests.get(
            f"{SPOTIFY_API_URL}/me/top/tracks?limit={limit}",
            headers=headers,
            timeout=10
        )
        response.raise_for_status()
        return jsonify(response.json())
        
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/spotify/playlists')
def api_spotify_playlists():
    """Return a list of the user's playlists with a short tracks preview.

    Response shape: [ {id, name, desc, image, tracks: [{name, duration}]}, ... ]
    """
    access_token = session.get('access_token')
    if not access_token:
        return jsonify({'error': 'Not authenticated'}), 401

    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }

    try:
        # fetch user's playlists
        resp = requests.get(f"{SPOTIFY_API_URL}/me/playlists?limit=50", headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        items = data.get('items', [])[:10]  # limit work to first 10 playlists for responsiveness
        playlists = []

        for pl in items:
            pid = pl.get('id')
            name = pl.get('name')
            desc = pl.get('description') or ''
            images = pl.get('images') or []
            image = images[0]['url'] if images else ''

            # fetch a small preview of tracks for this playlist
            tracks = []
            try:
                t_resp = requests.get(f"{SPOTIFY_API_URL}/playlists/{pid}/tracks?limit=5", headers=headers, timeout=10)
                if t_resp.ok:
                    for item in t_resp.json().get('items', []):
                        track = item.get('track')
                        if not track:
                            continue
                        dur_ms = track.get('duration_ms', 0)
                        minutes = dur_ms // 60000
                        seconds = (dur_ms % 60000) // 1000
                        duration = f"{minutes}:{seconds:02d}"
                        tracks.append({'name': track.get('name'), 'duration': duration})
            except requests.exceptions.RequestException:
                # ignore track fetch errors per-playlist
                tracks = []

            playlists.append({'id': pid, 'name': name, 'desc': desc, 'image': image, 'tracks': tracks})

        return jsonify(playlists)

    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 500


@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'service': 'Spotify OAuth Flask',
        'ngrok_url': NGROK_URL,
        'redirect_uri': REDIRECT_URI
    })


@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({'error': 'Endpoint not found'}), 404


@app.errorhandler(500)
def server_error(error):
    """Handle 500 errors"""
    return jsonify({'error': 'Internal server error'}), 500


if __name__ == '__main__':
    # Validate configuration
    if not SPOTIFY_CLIENT_ID or not SPOTIFY_CLIENT_SECRET:
        print("❌ ERROR: SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set in .env file")
        exit(1)
    
    print(f"""
    🎵 Spotify OAuth Flask Server
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    🌐 NGROK URL: {NGROK_URL}
    🔄 Redirect URI: {REDIRECT_URI}
    
    📍 Access at: {NGROK_URL}
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    """)
    
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True
    )
