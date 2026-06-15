/**
 * sketch.js
 * p5.js rendering engine for MIDI → Image.
 * All visual modes live here.
 */

let p5Instance = null;
let midiData = null;
let isAnimating = false;
let animFrame = 0;

// Color palette definitions
const PALETTES = {
  aurora: [
    [120, 80, 255], [0, 220, 200], [180, 80, 255],
    [0, 255, 160], [100, 160, 255], [255, 80, 180]
  ],
  sunset: [
    [255, 80, 40], [255, 160, 0], [255, 220, 60],
    [255, 100, 100], [200, 40, 100], [255, 180, 80]
  ],
  ocean: [
    [0, 120, 220], [0, 200, 255], [60, 80, 200],
    [0, 255, 220], [80, 160, 255], [20, 60, 160]
  ],
  neon: [
    [255, 0, 180], [0, 255, 100], [0, 200, 255],
    [255, 255, 0], [255, 80, 0], [160, 0, 255]
  ],
  mono: [
    [255, 255, 255], [220, 220, 220], [180, 180, 180],
    [140, 140, 140], [100, 100, 100], [200, 200, 200]
  ]
};

const BG_COLORS = {
  black:  [0, 0, 0],
  dark:   [5, 8, 20],
  white:  [245, 245, 250],
  deep:   [10, 4, 30]
};

const VISUAL_MODE_SEQUENCE = [
  'particles',
  'waves',
  'mandala',
  'constellation',
  'piano-roll',
  'spiral',
  'kaleidoscope',
  'tree',
];

const MODE_CYCLE_FRAMES = 120;

// Utility: note name
function noteName(midi) {
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  return names[midi % 12] + Math.floor(midi / 12 - 1);
}

// Map note 0–127 to 0–1
function normNote(note) { return note / 127; }
// Map velocity 0–127 to 0–1
function normVel(v) { return v / 127; }
// Map startTick to 0–1
function normTick(tick, maxTick) { return maxTick > 0 ? tick / maxTick : 0; }

function getCycledMode(baseMode, frame) {
  const startIndex = Math.max(0, VISUAL_MODE_SEQUENCE.indexOf(baseMode));
  const segmentIndex = Math.floor(frame / MODE_CYCLE_FRAMES);
  const modeIndex = (startIndex + segmentIndex) % VISUAL_MODE_SEQUENCE.length;

  return {
    mode: VISUAL_MODE_SEQUENCE[modeIndex],
    localFrame: frame % MODE_CYCLE_FRAMES,
    modeIndex,
    segmentIndex,
  };
}

function drawModeBadge(p, mode, currentIndex, totalModes, frame) {
  const label = mode
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  p.push();
  p.noStroke();
  p.fill(0, 0, 0, 120);
  p.rect(14, 14, 170, 42, 12);
  p.fill(255, 255, 255, 230);
  p.textAlign(p.LEFT, p.CENTER);
  p.textSize(13);
  p.textStyle(p.BOLD);
  p.text(`${label}`, 26, 30);
  p.textStyle(p.NORMAL);
  p.textSize(10);
  p.fill(255, 255, 255, 180);
  p.text(`${currentIndex + 1}/${totalModes} • frame ${frame}`, 26, 46);
  p.pop();
}


/* ─── RENDER MODES ───────────────────────────────────────── */

function renderParticles(p, notes, opts) {
  const { palette, bg, density, glow, canvasW, canvasH, frame } = opts;
  p.background(...bg, frame === 0 ? 255 : 20);

  p.blendMode(p.ADD);
  const count = Math.floor(notes.length * (density / 100));
  const step  = Math.max(1, Math.floor(notes.length / count));

  for (let i = 0; i < notes.length; i += step) {
    const n = notes[i];
    const x = normTick(n.startTick, opts.maxTick) * canvasW;
    const y = (1 - normNote(n.note)) * canvasH;
    const r = 3 + normVel(n.velocity) * 28 + (n.durationSec || 0) * 6;
    const col = palette[n.note % palette.length];
    const alpha = 60 + normVel(n.velocity) * 160;
    const glowR = r * (1 + glow / 60);

    if (glow > 10) {
      // Outer glow
      p.noStroke();
      p.fill(col[0], col[1], col[2], alpha * 0.25 * (glow / 100));
      p.ellipse(x, y, glowR * 3, glowR * 3);
      p.fill(col[0], col[1], col[2], alpha * 0.5 * (glow / 100));
      p.ellipse(x, y, glowR * 1.6, glowR * 1.6);
    }
    p.fill(col[0], col[1], col[2], alpha);
    p.noStroke();
    p.ellipse(x, y, r, r);

    // Animated drift
    if (frame > 0) {
      const driftX = x + Math.sin(frame * 0.04 + i * 0.5) * 4;
      const driftY = y + Math.cos(frame * 0.03 + i * 0.7) * 3;
      p.fill(col[0], col[1], col[2], alpha * 0.4);
      p.ellipse(driftX, driftY, r * 0.6, r * 0.6);
    }
  }
  p.blendMode(p.BLEND);
}

function renderWaves(p, notes, opts) {
  const { palette, bg, density, glow, canvasW, canvasH, frame } = opts;
  p.background(...bg, frame === 0 ? 255 : 15);

  const pitches = [...new Set(notes.map(n => n.note))].sort((a, b) => a - b);
  const count   = Math.floor(pitches.length * (density / 100));
  const selected = pitches.slice(0, count);

  p.blendMode(p.ADD);
  p.noFill();

  selected.forEach((pitch, pi) => {
    const pnotes = notes.filter(n => n.note === pitch);
    const col = palette[pitch % palette.length];
    const y0  = (1 - normNote(pitch)) * canvasH;
    const alpha = 80 + (pi / selected.length) * 140;
    const weight = 1 + normNote(pitch) * 3;

    p.strokeWeight(weight);
    p.stroke(col[0], col[1], col[2], alpha);

    p.beginShape();
    p.vertex(0, y0);
    for (let x = 0; x <= canvasW; x += 4) {
      const t = x / canvasW;
      // find velocity of notes near this x
      let v = 0.2;
      pnotes.forEach(n => {
        const nx = normTick(n.startTick, opts.maxTick);
        const dist = Math.abs(t - nx);
        if (dist < 0.05) v = Math.max(v, normVel(n.velocity) * (1 - dist / 0.05));
      });
      const waveY = y0 + Math.sin(x * 0.04 + frame * 0.05 + pi * 0.8) * v * 40 * (glow / 50 + 0.5);
      p.vertex(x, waveY);
    }
    p.vertex(canvasW, y0);
    p.endShape();
  });
  p.blendMode(p.BLEND);
}

function renderMandala(p, notes, opts) {
  const { palette, bg, density, glow, canvasW, canvasH, frame } = opts;
  p.background(...bg, frame === 0 ? 255 : 8);

  const cx = canvasW / 2, cy = canvasH / 2;
  const maxR = Math.min(cx, cy) * 0.92;
  const count = Math.floor(notes.length * (density / 100));
  const step  = Math.max(1, Math.floor(notes.length / count));
  const arms  = 12;

  p.blendMode(p.ADD);
  p.noStroke();

  for (let i = 0; i < notes.length; i += step) {
    const n = notes[i];
    const r = normNote(n.note) * maxR;
    const baseAngle = normTick(n.startTick, opts.maxTick) * Math.PI * 2 + frame * 0.01;
    const size = 2 + normVel(n.velocity) * 12;
    const col = palette[n.note % palette.length];
    const alpha = 50 + normVel(n.velocity) * 180;

    for (let arm = 0; arm < arms; arm++) {
      const angle = baseAngle + (arm / arms) * Math.PI * 2;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;

      if (glow > 10) {
        p.fill(col[0], col[1], col[2], alpha * 0.3 * (glow / 100));
        p.ellipse(x, y, size * 3, size * 3);
      }
      p.fill(col[0], col[1], col[2], alpha);
      p.ellipse(x, y, size, size);

      // Mirror
      const mx = cx + Math.cos(angle + Math.PI) * r;
      const my = cy + Math.sin(angle + Math.PI) * r;
      p.fill(col[0], col[1], col[2], alpha * 0.6);
      p.ellipse(mx, my, size * 0.7, size * 0.7);
    }
  }
  p.blendMode(p.BLEND);
}

function renderConstellation(p, notes, opts) {
  const { palette, bg, density, glow, canvasW, canvasH, frame } = opts;
  p.background(...bg, frame === 0 ? 255 : 5);

  const count = Math.floor(notes.length * (density / 100));
  const step  = Math.max(1, Math.floor(notes.length / count));
  const pts   = [];

  p.blendMode(p.ADD);

  // Collect points
  for (let i = 0; i < notes.length; i += step) {
    const n = notes[i];
    pts.push({
      x: normTick(n.startTick, opts.maxTick) * canvasW,
      y: (1 - normNote(n.note)) * canvasH,
      col: palette[n.note % palette.length],
      v: normVel(n.velocity),
      n,
    });
  }

  // Draw lines between nearby points
  const maxDist = 80 + glow * 0.8;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[i].x - pts[j].x;
      const dy = pts[i].y - pts[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < maxDist) {
        const alpha = (1 - dist / maxDist) * 60;
        const col = pts[i].col;
        p.stroke(col[0], col[1], col[2], alpha);
        p.strokeWeight(0.5);
        p.line(pts[i].x, pts[i].y, pts[j].x, pts[j].y);
      }
    }
  }

  // Draw stars
  p.noStroke();
  pts.forEach(pt => {
    const r = 2 + pt.v * 8;
    if (glow > 10) {
      p.fill(pt.col[0], pt.col[1], pt.col[2], 30 * (glow / 100));
      p.ellipse(pt.x, pt.y, r * 4, r * 4);
    }
    p.fill(pt.col[0], pt.col[1], pt.col[2], 200);
    p.ellipse(pt.x, pt.y, r, r);
  });

  p.blendMode(p.BLEND);
}

function renderPianoRoll(p, notes, opts) {
  const { palette, bg, density, glow, canvasW, canvasH, frame } = opts;
  if (frame === 0) p.background(...bg);

  const count = Math.floor(notes.length * (density / 100));
  const step  = Math.max(1, Math.floor(notes.length / count));
  const noteH = Math.max(2, canvasH / 88);

  p.blendMode(p.ADD);
  p.noStroke();

  for (let i = 0; i < notes.length; i += step) {
    const n = notes[i];
    const x0   = normTick(n.startTick, opts.maxTick) * canvasW;
    const x1   = normTick(n.endTick,   opts.maxTick) * canvasW;
    const y    = (1 - normNote(n.note)) * canvasH;
    const w    = Math.max(2, x1 - x0);
    const col  = palette[n.note % palette.length];
    const alpha= 80 + normVel(n.velocity) * 160;

    if (glow > 20) {
      p.fill(col[0], col[1], col[2], alpha * 0.3 * (glow / 100));
      p.rect(x0 - 2, y - noteH - 2, w + 4, noteH * 2 + 4, 4);
    }
    p.fill(col[0], col[1], col[2], alpha);
    p.rect(x0, y - noteH / 2, w, noteH, 2);
  }

  // Scan line in animation
  if (frame > 0) {
    const scanX = (frame * opts.speed * 2) % (canvasW + 40) - 20;
    p.blendMode(p.BLEND);
    p.noStroke();
    p.fill(255, 255, 255, 8);
    p.rect(scanX, 0, 3, canvasH);
  }
  p.blendMode(p.BLEND);
}

function renderSpiral(p, notes, opts) {
  const { palette, bg, density, glow, canvasW, canvasH, frame } = opts;
  p.background(...bg, frame === 0 ? 255 : 12);

  const centerX = canvasW / 2;
  const centerY = canvasH / 2;
  const maxDist = Math.min(centerX, centerY) * 0.8;

  p.blendMode(p.ADD);
  const count = Math.floor(notes.length * (density / 100));
  const step  = Math.max(1, Math.floor(notes.length / count));

  for (let i = 0; i < notes.length; i += step) {
    const n = notes[i];
    const angle = (normTick(n.startTick, opts.maxTick) * Math.PI * 4 + frame * 0.05) % (Math.PI * 2);
    const radius = (normNote(n.note) * maxDist + frame * 2) % maxDist;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    
    const r = 2 + normVel(n.velocity) * 12;
    const col = palette[n.note % palette.length];
    const alpha = 80 + normVel(n.velocity) * 120;

    if (glow > 10) {
      p.fill(col[0], col[1], col[2], alpha * 0.3 * (glow / 100));
      p.noStroke();
      p.ellipse(x, y, r * 3, r * 3);
    }
    p.fill(col[0], col[1], col[2], alpha);
    p.noStroke();
    p.ellipse(x, y, r, r);
  }
  p.blendMode(p.BLEND);
}

function renderKaleidoscope(p, notes, opts) {
  const { palette, bg, density, glow, canvasW, canvasH, frame } = opts;
  p.background(...bg, frame === 0 ? 255 : 8);

  const centerX = canvasW / 2;
  const centerY = canvasH / 2;
  const segments = 6;

  p.blendMode(p.ADD);
  const count = Math.floor(notes.length * (density / 100));
  const step  = Math.max(1, Math.floor(notes.length / count));

  for (let i = 0; i < notes.length; i += step) {
    const n = notes[i];
    const baseAngle = normTick(n.startTick, opts.maxTick) * Math.PI * 2;
    const radius = Math.max(20, Math.min(Math.min(centerX, centerY) - 20, normNote(n.note) * 300 + frame * 1.5));
    const col = palette[n.note % palette.length];
    const r = 1.5 + normVel(n.velocity) * 8;
    const alpha = 100 + normVel(n.velocity) * 100;

    for (let seg = 0; seg < segments; seg++) {
      const angle = baseAngle + (seg / segments) * Math.PI * 2 + frame * 0.02;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;

      p.fill(col[0], col[1], col[2], alpha);
      p.noStroke();
      p.ellipse(x, y, r, r);

      if (glow > 20) {
        p.fill(col[0], col[1], col[2], alpha * 0.2 * (glow / 100));
        p.ellipse(x, y, r * 2.5, r * 2.5);
      }
    }
  }
  p.blendMode(p.BLEND);
}

function renderTree(p, notes, opts) {
  const { palette, bg, density, glow, canvasW, canvasH, frame } = opts;
  p.background(...bg, frame === 0 ? 255 : 10);

  const rootX = canvasW / 2;
  const rootY = canvasH - 40;

  p.blendMode(p.ADD);
  const count = Math.floor(notes.length * (density / 100));
  const step  = Math.max(1, Math.floor(notes.length / count));

  for (let i = 0; i < notes.length; i += step) {
    const n = notes[i];
    const xPos = (normTick(n.startTick, opts.maxTick) - 0.5) * canvasW * 1.5;
    const yPos = rootY - normNote(n.note) * (canvasH - 60);
    const col = palette[n.note % palette.length];
    const r = 1.5 + normVel(n.velocity) * 10;
    const alpha = 100 + normVel(n.velocity) * 100;

    // Draw line from root
    p.stroke(col[0], col[1], col[2], alpha * 0.4);
    p.strokeWeight(0.5);
    p.line(rootX, rootY, rootX + xPos, yPos);

    // Draw node
    p.fill(col[0], col[1], col[2], alpha);
    p.noStroke();
    p.ellipse(rootX + xPos, yPos, r, r);

    if (glow > 10) {
      p.fill(col[0], col[1], col[2], alpha * 0.25 * (glow / 100));
      p.ellipse(rootX + xPos, yPos, r * 2.5, r * 2.5);
    }
  }
  p.blendMode(p.BLEND);
}

function createSketch(data, opts) {
  if (p5Instance) {
    p5Instance.remove();
    p5Instance = null;
  }

  const container = document.getElementById('p5-container');
  const canvasW = Math.min(880, container.clientWidth || 880);
  const canvasH = Math.round(canvasW * (600 / 880));

  document.getElementById('canvasSizeLabel').textContent = `${canvasW} × ${canvasH}`;

  const palette = PALETTES[opts.colorScheme] || PALETTES.aurora;
  const bg      = BG_COLORS[opts.bgColor] || BG_COLORS.black;

  p5Instance = new p5(function(p) {
    p.setup = function() {
      const cnv = p.createCanvas(canvasW, canvasH);
      cnv.parent('p5-container');
      p.pixelDensity(Math.min(window.devicePixelRatio, 2));
      p.background(...bg);
      p.smooth();
      animFrame = 0;
      renderFrame(p, 0);
    };

    p.draw = function() {
      if (!isAnimating) { p.noLoop(); return; }
      renderFrame(p, animFrame);
      animFrame++;
    };
  });

  function renderFrame(p, frame) {
    const cycle = isAnimating
      ? getCycledMode(opts.visualMode, frame)
      : { mode: opts.visualMode, localFrame: frame, modeIndex: Math.max(0, VISUAL_MODE_SEQUENCE.indexOf(opts.visualMode)), segmentIndex: 0 };

    const renderOpts = {
      palette, bg,
      density:  opts.density,
      glow:     opts.glow,
      speed:    opts.speed,
      canvasW, canvasH,
      maxTick:  data.maxTick,
      frame: cycle.localFrame,
    };
    switch (cycle.mode) {
      case 'particles':    renderParticles(p, data.notes, renderOpts);    break;
      case 'waves':        renderWaves(p, data.notes, renderOpts);        break;
      case 'mandala':      renderMandala(p, data.notes, renderOpts);      break;
      case 'constellation':renderConstellation(p, data.notes, renderOpts);break;
      case 'piano-roll':   renderPianoRoll(p, data.notes, renderOpts);   break;
      case 'spiral':       renderSpiral(p, data.notes, renderOpts);       break;
      case 'kaleidoscope': renderKaleidoscope(p, data.notes, renderOpts); break;
      case 'tree':         renderTree(p, data.notes, renderOpts);         break;
      default:             renderParticles(p, data.notes, renderOpts);
    }

    if (isAnimating) {
      drawModeBadge(p, cycle.mode, cycle.modeIndex, VISUAL_MODE_SEQUENCE.length, cycle.localFrame);
    }
  }

  return p5Instance;
}

function downloadCanvas() {
  if (!p5Instance) return;
  p5Instance.save('midi-art.png');
}

function toggleAnimation(btn) {
  if (!p5Instance) return;
  isAnimating = !isAnimating;
  if (isAnimating) {
    btn.textContent = '⏹ Stop';
    animFrame = 0;
    p5Instance.loop();
  } else {
    btn.textContent = '▶ Animate';
    p5Instance.noLoop();
  }
}
