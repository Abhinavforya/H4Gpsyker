"""
Art Generator Module
Creates ASCII art and p5.js configurations from audio events
"""

from typing import List, Dict, Any
import json


class ASCIIArtGenerator:
    """Generates ASCII art from audio events"""
    
    CHARS = ['░', '▒', '▓', '█', '▄', '▃', '▂', '▁']
    EXTENDED_CHARS = ['·', '∙', '•', '◦', '○', '●', '◉', '◎']
    BLOCK_CHARS = ['█', '▓', '▒', '░', ' ']
    
    @staticmethod
    def from_events(events: List[Dict[str, Any]], width: int = 80, height: int = 20) -> str:
        """Generate ASCII art from normalized events"""
        try:
            # Create canvas
            canvas = [[' ' for _ in range(width)] for _ in range(height)]
            
            if not events:
                return '\n'.join([''.join(row) for row in canvas])
            
            # Get events by type
            beat_events = [e for e in events if e['type'] == 'beat']
            energy_events = [e for e in events if e['type'] == 'energy']
            brightness_events = [e for e in events if e['type'] == 'brightness']
            
            # Map beats to columns
            if beat_events:
                beat_times = [e['value'] for e in beat_events]
                max_time = max(beat_times) if beat_times else 1
                
                for i, beat in enumerate(beat_events):
                    col = int((beat['value'] / max_time) * (width - 1))
                    if 0 <= col < width:
                        canvas[0][col] = '▓'
            
            # Map energy to rows
            if energy_events:
                energy_values = [e['value'] for e in energy_events]
                for i, energy_event in enumerate(energy_events):
                    col = int(i * width / len(energy_events))
                    if 0 <= col < width:
                        row = int((1 - energy_event['value']) * (height - 1))
                        row = max(1, min(height - 1, row))
                        char_idx = int(energy_event['value'] * (len(ASCIIArtGenerator.CHARS) - 1))
                        canvas[row][col] = ASCIIArtGenerator.CHARS[char_idx]
            
            # Map brightness to density
            if brightness_events:
                for i, brightness_event in enumerate(brightness_events):
                    col = int(i * width / len(brightness_events))
                    if 0 <= col < width:
                        char_idx = int(brightness_event['value'] * (len(ASCIIArtGenerator.BLOCK_CHARS) - 1))
                        char = ASCIIArtGenerator.BLOCK_CHARS[char_idx]
                        
                        # Fill from bottom up based on brightness
                        fill_height = int(brightness_event['value'] * height)
                        for row in range(height - fill_height, height):
                            if 0 <= row < height and canvas[row][col] == ' ':
                                canvas[row][col] = char
            
            # Convert canvas to string
            art = '\n'.join([''.join(row) for row in canvas])
            return art
        
        except Exception as e:
            print(f"Error generating ASCII art: {e}")
            # Return simple grid on error
            return '\n'.join([''.join(['█' if (i + j) % 2 == 0 else ' ' for j in range(width)]) for i in range(height)])
    
    @staticmethod
    def export_as_text(ascii_art: str, filename: str = 'output.txt') -> str:
        """Export ASCII art as text file"""
        with open(filename, 'w') as f:
            f.write(ascii_art)
        return filename


class P5CanvasConfig:
    """Configuration for p5.js canvas visualization"""
    
    def __init__(self, 
                 preferred_style: str = 'geometric',
                 color_palette: List[str] = None,
                 motion_intensity: float = 0.8):
        self.preferred_style = preferred_style  # 'minimal', 'chaotic', 'geometric', 'particles', 'waves'
        self.color_palette = color_palette or ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A']
        self.motion_intensity = motion_intensity
        
    def to_dict(self) -> Dict[str, Any]:
        """Convert config to dictionary for JSON serialization"""
        return {
            'style': self.preferred_style,
            'colors': self.color_palette,
            'intensity': self.motion_intensity,
            'width': 800,
            'height': 600,
            'background': '#0a0e27',
            'fps': 60
        }


class PersonalizationProfile:
    """User taste profile for personalized art generation"""
    
    def __init__(self):
        self.preferred_styles = ['geometric']
        self.energy_preference = 0.5  # 0-1 scale
        self.color_sensitivity = 0.7
        self.genre_preferences = {}
        self.mood_tags = []
        
    def from_spotify_history(self, history: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Build profile from Spotify history"""
        # This would use the agentic layer to analyze history
        return {
            'preferred_style': 'geometric',
            'color_palette': ['#FF6B6B', '#4ECDC4', '#45B7D1'],
            'motion_intensity': 0.8,
            'genres': [],
            'mood': 'energetic'
        }
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'styles': self.preferred_styles,
            'energy': self.energy_preference,
            'color_sensitivity': self.color_sensitivity,
            'genres': self.genre_preferences,
            'moods': self.mood_tags
        }


class GalleryManager:
    """Manages saved artworks and gallery"""
    
    def __init__(self, gallery_path: str = './gallery'):
        self.gallery_path = gallery_path
    
    def save_artwork(self, artwork_data: Dict[str, Any], 
                    song_id: str = None,
                    mood_tag: str = None) -> str:
        """Save generated artwork metadata"""
        artwork_entry = {
            'song_id': song_id,
            'mood_tag': mood_tag,
            'data': artwork_data,
            'timestamp': __import__('datetime').datetime.now().isoformat()
        }
        
        # Would save to database or file system
        return json.dumps(artwork_entry)
    
    def get_artworks(self, filter_by_mood: str = None) -> List[Dict[str, Any]]:
        """Retrieve saved artworks"""
        # Would query database or file system
        return []
    
    def export_artwork(self, artwork_id: str, format: str = 'png') -> bytes:
        """Export artwork in specified format"""
        # Would render and export artwork
        pass
