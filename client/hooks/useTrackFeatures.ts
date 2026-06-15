import { useEffect, useRef, useState } from 'react';
import { fetchAudioFeatures, fetchCurrentlyPlaying, normalizeFeatures } from '../lib/spotify';

type TrackFeatures = {
  tempo: number;
  energy: number;
  valence: number;
  danceability: number;
  loudness?: number;
};

const featureCache = new Map<string, TrackFeatures>();

export function useTrackFeatures(accessToken?: string | null, trackId?: string | null) {
  const [features, setFeatures] = useState<TrackFeatures | null>(null);
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(trackId || null);
  const [error, setError] = useState<Error | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    if (!accessToken) {
      setFeatures(null);
      setError(null);
      return;
    }

    const cacheKey = trackId || currentTrackId;
    if (!cacheKey && trackId !== undefined) {
      setFeatures(null);
      setError(null);
      return;
    }

    const cached = cacheKey ? featureCache.get(cacheKey) : null;
    if (cached) {
      setCurrentTrackId(cacheKey);
      setFeatures(cached);
      setError(null);
      return;
    }

    let cancelled = false;
    debounceRef.current = window.setTimeout(async () => {
      try {
        const resolvedTrackId = trackId || (await fetchCurrentlyPlaying(accessToken))?.item?.id;
        if (!resolvedTrackId) {
          setFeatures(null);
          setCurrentTrackId(null);
          return;
        }

        const raw = await fetchAudioFeatures(accessToken, resolvedTrackId);
        if (cancelled) return;

        const normalized = normalizeFeatures(raw);
        if (!normalized) {
          setFeatures(null);
          setCurrentTrackId(resolvedTrackId);
          return;
        }

        featureCache.set(resolvedTrackId, normalized);
        setFeatures(normalized);
        setCurrentTrackId(resolvedTrackId);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to fetch track features'));
          setFeatures(null);
        }
      }
    }, 200);

    return () => {
      cancelled = true;
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [accessToken, trackId, currentTrackId]);

  return { features, trackId: currentTrackId, error };
}

export default useTrackFeatures;
