import { useEffect, useRef, useState } from 'react';

type Track = {
  id?: string;
  name?: string;
  artists?: { name: string }[];
  album?: { name?: string; images?: { url: string }[] };
  duration_ms?: number;
};

export function useSpotifyPlayer(accessToken?: string) {
  const playerRef = useRef<any>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    let mounted = true;

    const loadSdk = () => {
      if (document.querySelector('script[src="https://sdk.scdn.co/spotify-player.js"]')) return;
      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      document.body.appendChild(script);
    };

    const createPlayer = () => {
      if (!mounted) return;
      const player = new (window as any).Spotify.Player({
        name: 'Cozy Player',
        getOAuthToken: (cb: (token: string) => void) => cb(accessToken),
        volume: 0.5,
      });

      player.addListener('ready', async ({ device_id }: { device_id: string }) => {
        setDeviceId(device_id);
        setIsReady(true);
        setError(null);
        await fetch('https://api.spotify.com/v1/me/player', {
          method: 'PUT',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_ids: [device_id], play: false })
        }).catch(() => setError('Open Spotify and play something, then select Cozy Player.'));
      });

      player.addListener('not_ready', ({ device_id }: { device_id: string }) => {
        if (deviceId === device_id) setIsReady(false);
      });

      player.addListener('player_state_changed', (state: any) => {
        if (!state) {
          setCurrentTrack(null);
          setIsPlaying(false);
          return;
        }
        const { position: pos, duration: dur, paused, track_window } = state;
        const current_track = track_window?.current_track;
        setPosition(pos || 0);
        setDuration(dur || 0);
        setIsPlaying(!paused);
        if (current_track && current_track.id) {
          setCurrentTrack({
            id: current_track.id,
            name: current_track.name,
            artists: current_track.artists,
            album: current_track.album,
            duration_ms: current_track.duration_ms
          });
        }
      });

      player.addListener('initialization_error', ({ message }: any) => setError(message));
      player.addListener('authentication_error', ({ message }: any) => setError(message));
      player.addListener('account_error', ({ message }: any) => setError(message || 'Spotify Premium is required for playback.'));
      player.addListener('playback_error', ({ message }: any) => setError(message));

      player.connect();
      playerRef.current = player;
    };

    if ((window as any).Spotify && (window as any).Spotify.Player) {
      createPlayer();
    } else {
      (window as any).onSpotifyWebPlaybackSDKReady = createPlayer;
      loadSdk();
    }

    return () => {
      mounted = false;
      try { playerRef.current?.disconnect(); } catch (e) {}
    };
  }, [accessToken]);

  const play = async (uri?: string) => {
    if (!accessToken || !deviceId) return;
    // Transfer playback using Web API
    await fetch('https://api.spotify.com/v1/me/player', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_ids: [deviceId], play: true })
    });
    if (uri) {
      // start specific track
      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: [uri] })
      });
    }
  };

  const pause = async () => {
    try { await playerRef.current?.pause(); } catch (e) { console.error(e); }
  };
  const togglePlay = async () => { try { await playerRef.current?.togglePlay(); } catch (e) { console.error(e); } };

  const next = async () => { try { await playerRef.current?.nextTrack(); } catch (e) { console.error(e); } };
  const previous = async () => { try { await playerRef.current?.previousTrack(); } catch (e) { console.error(e); } };
  const seek = async (position_ms: number) => { try { await playerRef.current?.seek(position_ms); } catch (e) { console.error(e); } };
  const setVolume = async (v: number) => { try { await playerRef.current?.setVolume(v); } catch (e) { console.error(e); } };

  return {
    isReady,
    deviceId,
    isPlaying,
    currentTrack,
    position,
    duration,
    error,
    play,
    pause,
    togglePlay,
    next,
    previous,
    seek,
    setVolume,
  } as const;
}

export default useSpotifyPlayer;
