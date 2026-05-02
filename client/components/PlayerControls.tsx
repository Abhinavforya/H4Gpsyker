import React from 'react';

type Props = {
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek?: (positionMs: number) => void;
  onVolume?: (volume: number) => void;
  position?: number;
  duration?: number;
  volume?: number;
};

export default function PlayerControls({
  isPlaying,
  onPlay,
  onPause,
  onNext,
  onPrevious,
  onSeek,
  onVolume,
  position = 0,
  duration = 0,
  volume = 0.5,
}: Props) {
  const progress = duration > 0 ? Math.round((position / duration) * 1000) / 10 : 0;

  return (
    <div className="player-controls">
      <button onClick={onPrevious}>Prev</button>
      {isPlaying ? <button onClick={onPause}>Pause</button> : <button onClick={onPlay}>Play</button>}
      <button onClick={onNext}>Next</button>
      <input
        aria-label="Seek"
        type="range"
        min={0}
        max={100}
        value={progress}
        onChange={(event) => onSeek?.((Number(event.target.value) / 100) * duration)}
      />
      <input
        aria-label="Volume"
        type="range"
        min={0}
        max={100}
        defaultValue={Math.round(volume * 100)}
        onChange={(event) => onVolume?.(Number(event.target.value) / 100)}
      />
    </div>
  );
}
