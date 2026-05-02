"""
Audio Analyzer Module
Extracts audio features from MP3 files using NumPy and SciPy
"""

import numpy as np
from scipy import signal
from scipy.io import wavfile
import os
from typing import Dict, List, Tuple, Any
import json

class AudioAnalyzer:
    """Analyzes audio files and extracts features for visualization"""
    
    def __init__(self, sample_rate: int = 22050):
        self.sample_rate = sample_rate
        self.min_db = -80
        self.ref_power = 1.0
        
    def load_audio(self, file_path: str) -> Tuple[np.ndarray, int]:
        """Load audio file and return waveform and sample rate"""
        try:
            # For WAV files
            if file_path.endswith('.wav'):
                sr, data = wavfile.read(file_path)
                # Convert stereo to mono if needed
                if len(data.shape) > 1:
                    data = np.mean(data, axis=1)
                # Normalize
                if data.dtype in [np.int16, np.int32]:
                    data = data.astype(np.float32) / 32768.0
                return data, sr
        except Exception as e:
            print(f"Error loading audio: {e}")
            raise
            
    def detect_beats(self, waveform: np.ndarray, sr: int) -> List[float]:
        """Detect beat positions in audio using energy onset detection"""
        try:
            # Compute STFT for energy
            frequencies, times, spectrogram = signal.spectrogram(
                waveform, sr, nperseg=2048, noverlap=1024
            )
            
            # Sum across frequencies to get energy over time
            energy = np.sum(np.abs(spectrogram), axis=0)
            
            # Normalize energy
            energy_norm = (energy - np.min(energy)) / (np.max(energy) - np.min(energy) + 1e-8)
            
            # Find peaks (beats) using simple threshold
            threshold = np.mean(energy_norm) + 0.5 * np.std(energy_norm)
            peaks, _ = signal.find_peaks(energy_norm, height=threshold, distance=int(0.1 * sr / 512))
            
            beat_times = times[peaks]
            return beat_times.tolist()
            
        except Exception as e:
            print(f"Error detecting beats: {e}")
            return []
    
    def estimate_tempo(self, waveform: np.ndarray, sr: int) -> float:
        """Estimate tempo (BPM) from audio"""
        try:
            # Compute onset strength
            hop_length = 512
            frame_length = 2048
            
            # Compute spectral flux as onset strength
            frequencies, times, spectrogram = signal.spectrogram(
                waveform, sr, nperseg=frame_length, noverlap=frame_length-hop_length
            )
            
            onset_strength = np.sqrt(np.sum(np.diff(np.abs(spectrogram), axis=1)**2, axis=0))
            
            # Estimate tempo from onset strength autocorrelation
            # Use autocorrelation to find periodicity
            lag_range = np.arange(int(0.5 * sr / hop_length), int(4 * sr / hop_length))
            
            if len(onset_strength) > max(lag_range):
                autocorr = np.correlate(onset_strength, onset_strength, mode='full')
                autocorr = autocorr[len(autocorr)//2:]
                
                if len(lag_range) > 0:
                    autocorr_lag = autocorr[lag_range]
                    best_lag = lag_range[np.argmax(autocorr_lag)]
                    tempo = 60.0 * sr / (hop_length * best_lag)
                    # Constrain to reasonable range (60-180 BPM)
                    tempo = np.clip(tempo, 60, 180)
                    return float(tempo)
            
            return 100.0  # Default if estimation fails
            
        except Exception as e:
            print(f"Error estimating tempo: {e}")
            return 100.0
    
    def extract_spectral_features(self, waveform: np.ndarray, sr: int) -> Dict[str, List[float]]:
        """Extract spectral features from audio"""
        try:
            # Compute STFT
            frequencies, times, spectrogram = signal.spectrogram(
                waveform, sr, nperseg=2048, noverlap=1024
            )
            
            spectrogram_db = 10 * np.log10(np.abs(spectrogram) + 1e-10)
            
            features = {}
            
            # Spectral centroid
            features['spectral_centroid'] = []
            for t in range(spectrogram_db.shape[1]):
                centroid = np.sum(frequencies * np.abs(spectrogram[:, t])) / (np.sum(np.abs(spectrogram[:, t])) + 1e-8)
                features['spectral_centroid'].append(float(centroid))
            
            # Spectral brightness (high frequency energy)
            high_freq_idx = np.where(frequencies > 4000)[0]
            if len(high_freq_idx) > 0:
                features['brightness'] = []
                for t in range(spectrogram_db.shape[1]):
                    brightness = np.sum(np.abs(spectrogram[high_freq_idx, t])) / (np.sum(np.abs(spectrogram[:, t])) + 1e-8)
                    features['brightness'].append(float(brightness))
            else:
                features['brightness'] = [0.5] * spectrogram_db.shape[1]
            
            # Energy per frame
            features['energy'] = []
            for t in range(spectrogram_db.shape[1]):
                energy = np.sum(np.abs(spectrogram[:, t])**2)
                features['energy'].append(float(energy))
            
            # Normalize energy
            if len(features['energy']) > 0:
                max_energy = max(features['energy'])
                if max_energy > 0:
                    features['energy'] = [e / max_energy for e in features['energy']]
            
            # Normalize brightness
            if len(features['brightness']) > 0:
                max_brightness = max(features['brightness']) or 1
                features['brightness'] = [b / max_brightness for b in features['brightness']]
            
            # Normalize spectral centroid
            if len(features['spectral_centroid']) > 0:
                max_sc = max(features['spectral_centroid']) or 1
                features['spectral_centroid'] = [sc / max_sc for sc in features['spectral_centroid']]
            
            return features
            
        except Exception as e:
            print(f"Error extracting spectral features: {e}")
            return {'energy': [], 'brightness': [], 'spectral_centroid': []}
    
    def generate_event_stream(self, waveform: np.ndarray, sr: int) -> List[Dict[str, Any]]:
        """Generate structured event stream from audio features"""
        try:
            events = []
            
            # Detect beats
            beat_times = self.detect_beats(waveform, sr)
            for beat_time in beat_times:
                events.append({
                    'time': float(beat_time),
                    'type': 'beat',
                    'value': 1.0
                })
            
            # Estimate tempo
            tempo = self.estimate_tempo(waveform, sr)
            
            # Extract spectral features
            spectral_features = self.extract_spectral_features(waveform, sr)
            
            # Get feature times
            hop_length = 512
            frame_length = 2048
            n_frames = len(spectral_features.get('energy', []))
            feature_times = np.arange(n_frames) * hop_length / sr
            
            # Add energy events
            for i, time in enumerate(feature_times):
                if i < len(spectral_features['energy']):
                    events.append({
                        'time': float(time),
                        'type': 'energy',
                        'value': float(spectral_features['energy'][i])
                    })
            
            # Add brightness events
            for i, time in enumerate(feature_times):
                if i < len(spectral_features['brightness']):
                    events.append({
                        'time': float(time),
                        'type': 'brightness',
                        'value': float(spectral_features['brightness'][i])
                    })
            
            # Add spectral centroid events (as "pitch" proxy)
            for i, time in enumerate(feature_times):
                if i < len(spectral_features['spectral_centroid']):
                    events.append({
                        'time': float(time),
                        'type': 'pitch',
                        'value': float(spectral_features['spectral_centroid'][i])
                    })
            
            # Sort by time
            events.sort(key=lambda e: e['time'])
            
            # Add metadata
            analysis_data = {
                'metadata': {
                    'sample_rate': sr,
                    'duration': float(len(waveform) / sr),
                    'tempo': tempo,
                    'num_events': len(events),
                    'num_beats': len(beat_times)
                },
                'events': events
            }
            
            return analysis_data
            
        except Exception as e:
            print(f"Error generating event stream: {e}")
            return {'metadata': {}, 'events': []}
