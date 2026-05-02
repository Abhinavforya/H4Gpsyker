type VisualParams = {
  speed: number;
  intensity: number;
  palette: string[];
};

export function mapFeaturesToVisualParams(features: { tempo:number, energy:number, valence:number, danceability:number }): VisualParams {
  // Tempo -> speed (scaled)
  const speed = Math.min(3, Math.max(0.2, features.tempo / 120));
  // Energy -> intensity
  const intensity = Math.min(1, Math.max(0, features.energy));
  // Valence -> warm/cool palette
  const palette = features.valence > 0.6
    ? ['#ffd6a5','#ffadad','#ff7b7b']
    : ['#a0c4ff','#9bf6ff','#bdb2ff'];

  return { speed, intensity, palette };
}

export function renderAscii(ctx: CanvasRenderingContext2D, params: VisualParams, tick: number, width: number, height: number) {
  const cols = 80;
  const rows = Math.floor((cols * height) / width / 2) || 20;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0,0,width,height);
  ctx.font = `${Math.max(8, Math.floor(width / cols))}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const chars = ['.',':','-','=','+','*','#','%','@'];
  for (let y=0;y<rows;y++){
    for (let x=0;x<cols;x++){
      const nx = x/cols - 0.5;
      const ny = y/rows - 0.5;
      const v = Math.sin((nx*10 + ny*5 + tick*params.speed) * (1+params.intensity));
      const idx = Math.floor(((v+1)/2)*(chars.length-1));
      const ch = chars[idx];
      const color = params.palette[(x+y)%params.palette.length];
      ctx.fillStyle = color;
      const px = (x/cols)*width + (width/cols)/2;
      const py = (y/rows)*height + (height/rows)/2;
      ctx.fillText(ch, px, py);
    }
  }
}
