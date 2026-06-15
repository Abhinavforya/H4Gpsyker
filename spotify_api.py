"""
Spotify API Integration Module
Handles Spotify API interactions
"""

import requests
from typing import Dict, List, Any, Optional
import os


class SpotifyAPI:
    """Wrapper for Spotify API interactions"""
    
    def __init__(self):
        self.base_url = 'https://api.spotify.com/v1'
        self.auth_url = 'https://accounts.spotify.com/api/token'
    
    def get_user_profile(self, access_token: str) -> Dict[str, Any]:
        """Get current user's profile"""
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        response = requests.get(f'{self.base_url}/me', headers=headers)
        return response.json() if response.status_code == 200 else {}
    
    def get_user_top_tracks(self, access_token: str, 
                           time_range: str = 'medium_term',
                           limit: int = 50) -> List[Dict[str, Any]]:
        """Get user's top tracks"""
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        params = {
            'time_range': time_range,
            'limit': limit
        }
        
        response = requests.get(
            f'{self.base_url}/me/top/tracks',
            headers=headers,
            params=params
        )
        
        if response.status_code == 200:
            return response.json().get('items', [])
        return []
    
    def get_user_top_artists(self, access_token: str,
                            time_range: str = 'medium_term',
                            limit: int = 50) -> List[Dict[str, Any]]:
        """Get user's top artists"""
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        params = {
            'time_range': time_range,
            'limit': limit
        }
        
        response = requests.get(
            f'{self.base_url}/me/top/artists',
            headers=headers,
            params=params
        )
        
        if response.status_code == 200:
            return response.json().get('items', [])
        return []
    
    def get_audio_features(self, access_token: str, track_id: str) -> Dict[str, Any]:
        """Get audio features for a track"""
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        response = requests.get(
            f'{self.base_url}/audio-features/{track_id}',
            headers=headers
        )
        
        return response.json() if response.status_code == 200 else {}
    
    def get_multiple_audio_features(self, access_token: str, 
                                   track_ids: List[str]) -> List[Dict[str, Any]]:
        """Get audio features for multiple tracks"""
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        results = []
        # API limits to 100 IDs per request
        for i in range(0, len(track_ids), 100):
            batch = track_ids[i:i+100]
            params = {'ids': ','.join(batch)}
            
            response = requests.get(
                f'{self.base_url}/audio-features',
                headers=headers,
                params=params
            )
            
            if response.status_code == 200:
                results.extend(response.json().get('audio_features', []))
        
        return results
    
    def get_recently_played(self, access_token: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Get user's recently played tracks"""
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        params = {'limit': limit}
        
        response = requests.get(
            f'{self.base_url}/me/player/recently-played',
            headers=headers,
            params=params
        )
        
        if response.status_code == 200:
            return response.json().get('items', [])
        return []
    
    def get_currently_playing(self, access_token: str) -> Optional[Dict[str, Any]]:
        """Get currently playing track"""
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        response = requests.get(
            f'{self.base_url}/me/player/currently-playing',
            headers=headers
        )
        
        if response.status_code == 200:
            return response.json()
        elif response.status_code == 204:
            return None
        return None
    
    def extract_track_info(self, track: Dict[str, Any]) -> Dict[str, Any]:
        """Extract relevant info from track object"""
        return {
            'id': track.get('id'),
            'name': track.get('name'),
            'artist': ', '.join([a.get('name') for a in track.get('artists', [])]),
            'album': track.get('album', {}).get('name'),
            'duration_ms': track.get('duration_ms'),
            'preview_url': track.get('preview_url'),
            'external_url': track.get('external_urls', {}).get('spotify'),
            'image': track.get('album', {}).get('images', [{}])[0].get('url') if track.get('album', {}).get('images') else None
        }
    
    def extract_artist_info(self, artist: Dict[str, Any]) -> Dict[str, Any]:
        """Extract relevant info from artist object"""
        return {
            'id': artist.get('id'),
            'name': artist.get('name'),
            'genres': artist.get('genres', []),
            'popularity': artist.get('popularity'),
            'followers': artist.get('followers', {}).get('total'),
            'image': artist.get('images', [{}])[0].get('url') if artist.get('images') else None
        }


class ListeningHistoryAnalyzer:
    """Analyzes user listening history for personalization"""
    
    def __init__(self, spotify_api: SpotifyAPI):
        self.spotify_api = spotify_api
    
    def build_user_profile(self, access_token: str) -> Dict[str, Any]:
        """Build comprehensive user profile from Spotify history"""
        
        # Get top tracks and artists
        top_tracks = self.spotify_api.get_user_top_tracks(access_token, limit=50)
        top_artists = self.spotify_api.get_user_top_artists(access_token, limit=50)
        recently_played = self.spotify_api.get_recently_played(access_token, limit=50)
        
        # Analyze audio features
        track_ids = [t.get('id') for t in top_tracks if t.get('id')]
        audio_features = self.spotify_api.get_multiple_audio_features(access_token, track_ids)
        
        # Build profile
        profile = {
            'top_tracks': [self.spotify_api.extract_track_info(t) for t in top_tracks],
            'top_artists': [self.spotify_api.extract_artist_info(a) for a in top_artists],
            'recently_played': [self.spotify_api.extract_track_info(item.get('track')) for item in recently_played if item.get('track')],
            'audio_features': audio_features,
            'genres': self._extract_genres(top_artists),
            'energy_level': self._calculate_energy_level(audio_features),
            'danceability': self._calculate_danceability(audio_features),
            'valence': self._calculate_valence(audio_features)
        }
        
        return profile
    
    def _extract_genres(self, artists: List[Dict[str, Any]]) -> List[str]:
        """Extract unique genres from artists"""
        genres = set()
        for artist in artists:
            genres.update(artist.get('genres', []))
        return list(genres)[:20]  # Top 20
    
    def _calculate_energy_level(self, features: List[Dict[str, Any]]) -> float:
        """Calculate average energy level"""
        if not features:
            return 0.5
        energies = [f.get('energy', 0) for f in features if f]
        return sum(energies) / len(energies) if energies else 0.5
    
    def _calculate_danceability(self, features: List[Dict[str, Any]]) -> float:
        """Calculate average danceability"""
        if not features:
            return 0.5
        danceabilities = [f.get('danceability', 0) for f in features if f]
        return sum(danceabilities) / len(danceabilities) if danceabilities else 0.5
    
    def _calculate_valence(self, features: List[Dict[str, Any]]) -> float:
        """Calculate average valence (positivity)"""
        if not features:
            return 0.5
        valences = [f.get('valence', 0) for f in features if f]
        return sum(valences) / len(valences) if valences else 0.5
