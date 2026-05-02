import React from 'react';

type Props = {
  track?: any;
  features?: any;
};

export default function TrackInfo({ track, features }: Props) {
  if (!track) return <div className="track-info">No track</div>;
  const artists = (track.artists || []).map((a:any)=>a.name).join(', ');
  return (
    <div className="track-info">
      <img src={track.album?.images?.[0]?.url} alt="art" style={{width:120,height:120,objectFit:'cover',borderRadius:8}}/>
      <div>
        <h3>{track.name}</h3>
        <div className="muted">{artists}</div>
        <div className="features">
          <div>Energy: {(features?.energy||0).toFixed(2)}</div>
          <div>Valence: {(features?.valence||0).toFixed(2)}</div>
          <div>Danceability: {(features?.danceability||0).toFixed(2)}</div>
          <div>Tempo: {Math.round(features?.tempo||0)} BPM</div>
        </div>
      </div>
    </div>
  );
}
