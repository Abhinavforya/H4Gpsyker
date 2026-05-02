"""
Test suite for SonicCanvas backend components
"""

import sys
import os
import unittest
import numpy as np
from scipy.io import wavfile
import tempfile
import json

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from audio_analyzer import AudioAnalyzer
from art_generator import ASCIIArtGenerator, P5CanvasConfig, PersonalizationProfile
from event_processor import EventProcessor
from spotify_api import ListeningHistoryAnalyzer


class TestAudioAnalyzer(unittest.TestCase):
    """Test audio analysis functionality"""
    
    def setUp(self):
        self.analyzer = AudioAnalyzer()
        self.temp_dir = tempfile.mkdtemp()
        
        # Create a simple test WAV file
        sample_rate = 22050
        duration = 2  # seconds
        t = np.linspace(0, duration, sample_rate * duration)
        
        # Create a simple sine wave with beats
        frequency = 440  # A4 note
        amplitude = 0.3
        waveform = amplitude * np.sin(2 * np.pi * frequency * t)
        
        # Add beats (energy spikes)
        beat_indices = [int(sample_rate * i) for i in np.arange(0, duration, 0.5)]
        for idx in beat_indices:
            if idx < len(waveform):
                waveform[idx:idx+100] *= 2
        
        # Save as WAV
        self.test_wav_path = os.path.join(self.temp_dir, 'test.wav')
        wavfile.write(self.test_wav_path, sample_rate, (waveform * 32767).astype(np.int16))
    
    def test_load_audio(self):
        """Test audio loading"""
        waveform, sr = self.analyzer.load_audio(self.test_wav_path)
        self.assertEqual(sr, 22050)
        self.assertGreater(len(waveform), 0)
    
    def test_detect_beats(self):
        """Test beat detection"""
        waveform, sr = self.analyzer.load_audio(self.test_wav_path)
        beats = self.analyzer.detect_beats(waveform, sr)
        self.assertIsInstance(beats, list)
        self.assertGreater(len(beats), 0)
    
    def test_estimate_tempo(self):
        """Test tempo estimation"""
        waveform, sr = self.analyzer.load_audio(self.test_wav_path)
        tempo = self.analyzer.estimate_tempo(waveform, sr)
        self.assertGreater(tempo, 60)
        self.assertLess(tempo, 180)
    
    def test_extract_spectral_features(self):
        """Test spectral feature extraction"""
        waveform, sr = self.analyzer.load_audio(self.test_wav_path)
        features = self.analyzer.extract_spectral_features(waveform, sr)
        
        self.assertIn('energy', features)
        self.assertIn('brightness', features)
        self.assertIn('spectral_centroid', features)
    
    def test_generate_event_stream(self):
        """Test event stream generation"""
        waveform, sr = self.analyzer.load_audio(self.test_wav_path)
        analysis_data = self.analyzer.generate_event_stream(waveform, sr)
        
        self.assertIn('metadata', analysis_data)
        self.assertIn('events', analysis_data)
        self.assertGreater(len(analysis_data['events']), 0)
        
        # Verify metadata
        metadata = analysis_data['metadata']
        self.assertIn('sample_rate', metadata)
        self.assertIn('duration', metadata)
        self.assertIn('tempo', metadata)
    
    def tearDown(self):
        """Clean up test files"""
        import shutil
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)


class TestArtGenerator(unittest.TestCase):
    """Test art generation functionality"""
    
    def setUp(self):
        self.processor = EventProcessor()
    
    def test_ascii_art_generation(self):
        """Test ASCII art generation"""
        events = [
            {'time': 0.0, 'type': 'beat', 'value': 1.0},
            {'time': 0.5, 'type': 'beat', 'value': 1.0},
            {'time': 0.1, 'type': 'energy', 'value': 0.5},
            {'time': 0.2, 'type': 'brightness', 'value': 0.7},
        ]
        
        ascii_art = ASCIIArtGenerator.from_events(events)
        self.assertIsInstance(ascii_art, str)
        self.assertGreater(len(ascii_art), 0)
        self.assertIn('\n', ascii_art)  # Should have multiple lines
    
    def test_p5_config(self):
        """Test p5.js configuration"""
        config = P5CanvasConfig(
            preferred_style='geometric',
            color_palette=['#FF0000', '#00FF00'],
            motion_intensity=0.8
        )
        
        config_dict = config.to_dict()
        self.assertEqual(config_dict['style'], 'geometric')
        self.assertEqual(len(config_dict['colors']), 2)
        self.assertEqual(config_dict['intensity'], 0.8)
    
    def test_personalization_profile(self):
        """Test personalization profile"""
        profile = PersonalizationProfile()
        profile_dict = profile.to_dict()
        
        self.assertIn('styles', profile_dict)
        self.assertIn('energy', profile_dict)
        self.assertIn('genres', profile_dict)


class TestEventProcessor(unittest.TestCase):
    """Test event processing functionality"""
    
    def setUp(self):
        self.processor = EventProcessor()
    
    def test_normalize_events(self):
        """Test event normalization"""
        events = [
            {'time': 0.0, 'type': 'energy', 'value': 100},
            {'time': 0.1, 'type': 'energy', 'value': 200},
            {'time': 0.2, 'type': 'energy', 'value': 300},
        ]
        
        normalized = self.processor.normalize_events(events)
        
        # Values should be between 0-1
        for event in normalized:
            if event['type'] == 'energy':
                self.assertGreaterEqual(event['value'], 0)
                self.assertLessEqual(event['value'], 1)
    
    def test_smooth_events(self):
        """Test event smoothing"""
        events = [
            {'time': 0.0, 'type': 'energy', 'value': 0.1},
            {'time': 0.1, 'type': 'energy', 'value': 0.9},
            {'time': 0.2, 'type': 'energy', 'value': 0.2},
            {'time': 0.3, 'type': 'energy', 'value': 0.8},
        ]
        
        smoothed = self.processor.smooth_events(events)
        self.assertGreaterEqual(len(smoothed), 0)
    
    def test_resample_events(self):
        """Test event resampling"""
        events = [
            {'time': 0.0, 'type': 'energy', 'value': 0.5},
            {'time': 0.01, 'type': 'energy', 'value': 0.6},
            {'time': 0.02, 'type': 'energy', 'value': 0.7},
        ]
        
        resampled = self.processor.resample_events(events, target_rate=10)
        self.assertGreater(len(resampled), 0)


class TestIntegration(unittest.TestCase):
    """Integration tests"""
    
    def test_full_pipeline(self):
        """Test full analysis pipeline"""
        analyzer = AudioAnalyzer()
        processor = EventProcessor()
        
        # Create test audio
        sample_rate = 22050
        duration = 2
        t = np.linspace(0, duration, sample_rate * duration)
        frequency = 440
        waveform = 0.3 * np.sin(2 * np.pi * frequency * t)
        
        # Save temporarily
        temp_dir = tempfile.mkdtemp()
        test_path = os.path.join(temp_dir, 'test.wav')
        wavfile.write(test_path, sample_rate, (waveform * 32767).astype(np.int16))
        
        try:
            # Load and analyze
            waveform_loaded, sr = analyzer.load_audio(test_path)
            analysis_data = analyzer.generate_event_stream(waveform_loaded, sr)
            normalized_events = processor.normalize_events(analysis_data['events'])
            
            # Generate visualization
            ascii_art = ASCIIArtGenerator.from_events(normalized_events)
            
            # Verify results
            self.assertGreater(len(normalized_events), 0)
            self.assertGreater(len(ascii_art), 0)
            
        finally:
            import shutil
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)


def run_tests():
    """Run all tests"""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    suite.addTests(loader.loadTestsFromTestCase(TestAudioAnalyzer))
    suite.addTests(loader.loadTestsFromTestCase(TestArtGenerator))
    suite.addTests(loader.loadTestsFromTestCase(TestEventProcessor))
    suite.addTests(loader.loadTestsFromTestCase(TestIntegration))
    
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    return result.wasSuccessful()


if __name__ == '__main__':
    success = run_tests()
    sys.exit(0 if success else 1)
