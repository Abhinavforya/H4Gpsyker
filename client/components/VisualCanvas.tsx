import React, { useEffect, useRef } from 'react';
import { mapFeaturesToVisualParams, renderAscii } from '../visuals';

type Props = {
  features?: { tempo:number, energy:number, valence:number, danceability:number } | null;
  progressMs?: number;
  isPlaying?: boolean;
};

export default function VisualCanvas({ features, progressMs = 0, isPlaying = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tickRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function frame() {
      if (isPlaying) tickRef.current += 0.016;
      const params = mapFeaturesToVisualParams(features || { tempo:60, energy:0.2, valence:0.5, danceability:0.2 });
      renderAscii(ctx, params, tickRef.current + (progressMs / 1000), canvas.clientWidth, canvas.clientHeight);
      raf = requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(frame);

    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(raf); };
  }, [features, progressMs, isPlaying]);

  return <canvas ref={canvasRef} style={{width:'100%',height:'100%'}} />;
}
