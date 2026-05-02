"""
Event Processing Module
Normalizes and streams audio events
"""

from typing import List, Dict, Any
import numpy as np


class EventProcessor:
    """Processes and normalizes audio events for visualization"""
    
    def __init__(self):
        self.buffer_size = 1000
        self.event_buffer = []
    
    def normalize_events(self, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Normalize event values to 0-1 range"""
        if not events:
            return []
        
        normalized = []
        
        # Group events by type
        events_by_type = {}
        for event in events:
            event_type = event.get('type', 'unknown')
            if event_type not in events_by_type:
                events_by_type[event_type] = []
            events_by_type[event_type].append(event)
        
        # Normalize each type independently
        for event_type, type_events in events_by_type.items():
            values = [e['value'] for e in type_events]
            
            if event_type == 'beat':
                # Beats are already normalized
                for event in type_events:
                    normalized.append(event)
            else:
                # For continuous values, normalize to 0-1
                min_val = min(values) if values else 0
                max_val = max(values) if values else 1
                
                range_val = max_val - min_val if max_val != min_val else 1
                
                for event in type_events:
                    norm_event = event.copy()
                    norm_event['value'] = (event['value'] - min_val) / range_val
                    normalized.append(norm_event)
        
        # Sort by time
        normalized.sort(key=lambda e: e['time'])
        
        return normalized
    
    def buffer_events(self, event: Dict[str, Any]) -> None:
        """Add event to buffer for streaming"""
        self.event_buffer.append(event)
        
        if len(self.event_buffer) >= self.buffer_size:
            self.flush_buffer()
    
    def flush_buffer(self) -> List[Dict[str, Any]]:
        """Get and clear buffered events"""
        buffer = self.event_buffer.copy()
        self.event_buffer = []
        return buffer
    
    def resample_events(self, events: List[Dict[str, Any]], 
                       target_rate: float = 30.0) -> List[Dict[str, Any]]:
        """Resample events to target frame rate"""
        if not events:
            return []
        
        start_time = min(e['time'] for e in events)
        end_time = max(e['time'] for e in events)
        duration = end_time - start_time or 1
        
        # Calculate frame interval
        frame_interval = 1.0 / target_rate
        num_frames = max(1, int(duration * target_rate) + 1)
        
        resampled = []
        
        for frame_idx in range(num_frames):
            frame_time = start_time + frame_idx * frame_interval
            frame_end_time = frame_time + frame_interval
            
            # Get events in this frame
            frame_events = [
                e for e in events 
                if frame_time <= e['time'] < frame_end_time
            ]
            
            if frame_events:
                # Aggregate events
                for event_type in set(e['type'] for e in frame_events):
                    type_events = [e for e in frame_events if e['type'] == event_type]
                    avg_value = np.mean([e['value'] for e in type_events])
                    
                    resampled.append({
                        'time': frame_time,
                        'type': event_type,
                        'value': float(avg_value)
                    })
        
        return resampled
    
    def smooth_events(self, events: List[Dict[str, Any]], 
                     window_size: int = 3) -> List[Dict[str, Any]]:
        """Apply smoothing filter to events"""
        if not events or window_size < 1:
            return events
        
        # Group by type
        events_by_type = {}
        for event in events:
            event_type = event.get('type', 'unknown')
            if event_type not in events_by_type:
                events_by_type[event_type] = []
            events_by_type[event_type].append(event)
        
        smoothed = []
        
        for event_type, type_events in events_by_type.items():
            values = np.array([e['value'] for e in type_events])
            
            # Apply moving average
            if len(values) >= window_size:
                kernel = np.ones(window_size) / window_size
                smoothed_values = np.convolve(values, kernel, mode='same')
            else:
                smoothed_values = values
            
            for i, event in enumerate(type_events):
                smooth_event = event.copy()
                smooth_event['value'] = float(smoothed_values[i])
                smoothed.append(smooth_event)
        
        # Sort by time
        smoothed.sort(key=lambda e: e['time'])
        
        return smoothed
    
    def create_continuous_stream(self, events: List[Dict[str, Any]], 
                                 duration: float) -> List[Dict[str, Any]]:
        """Create continuous stream from discrete events"""
        if not events:
            return []
        
        stream = []
        current_values = {}
        
        # Initialize with first event values
        for event in events:
            event_type = event['type']
            if event_type not in current_values:
                current_values[event_type] = 0.0
        
        # Create interpolated stream
        frame_rate = 30.0
        frame_interval = 1.0 / frame_rate
        num_frames = int(duration * frame_rate)
        
        event_idx = 0
        
        for frame_idx in range(num_frames):
            frame_time = frame_idx * frame_interval
            
            # Update values based on events
            while event_idx < len(events) and events[event_idx]['time'] <= frame_time:
                event = events[event_idx]
                current_values[event['type']] = event['value']
                event_idx += 1
            
            # Add frame events
            for event_type, value in current_values.items():
                stream.append({
                    'time': frame_time,
                    'type': event_type,
                    'value': value
                })
        
        return stream
