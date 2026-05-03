/**
 * cozy-visual-engine.js
 * Real-time visual art generator based on track metadata
 * Uses p5.js to create dynamic, responsive visualizations
 */

class CozyVisualEngine {
  constructor(containerId = 'canvas-container') {
    this.container = document.getElementById(containerId);
    this.sketch = null;
    this.p5Instance = null;
    
    // Current audio features
    this.audioFeatures = {
      energy: 0.5,
      valence: 0.5,
      danceability: 0.5,
      tempo: 120,
      acousticness: 0,
      instrumentalness: 0,
      liveness: 0.5,
      speechiness: 0,
    };

    this.trackContext = null;
    this.playback = {
      positionMs: 0,
      durationMs: 0,
      isPlaying: false,
      updatedAt: this.getClockTime(),
    };
    this.liveNotes = [];
    this.liveSeed = 42;

    this.mode = 'particles';
    this.modes = [
      'particles',
      'waves',
      'mandala',
      'constellation',
      'spectrum',
      'spiral',
      'reactive',
      'mood-biome',
      'live-paint',
      'live-ascii',
    ];

    this.animationFrame = 0;
    this.isRunning = true;

    this.initSketch();
  }

  /**
   * Initialize p5.js sketch
   */
  initSketch() {
    this.sketch = (p) => {
      p.setup = () => {
        const rect = this.container.getBoundingClientRect();
        const w = rect.width || window.innerWidth;
        const h = rect.height || window.innerHeight;

        const canvas = p.createCanvas(w, h);
        canvas.parent(this.container);

        p.pixelDensity(1);
        p.smooth();
      };

      p.draw = () => {
        if (!this.isRunning) return;

        const w = p.width;
        const h = p.height;

        // Render current mode
        switch (this.mode) {
          case 'particles':
            this.renderParticles(p, w, h);
            break;
          case 'waves':
            this.renderWaves(p, w, h);
            break;
          case 'mandala':
            this.renderMandala(p, w, h);
            break;
          case 'constellation':
            this.renderConstellation(p, w, h);
            break;
          case 'spectrum':
            this.renderSpectrum(p, w, h);
            break;
          case 'spiral':
            this.renderSpiral(p, w, h);
            break;
          case 'reactive':
            this.renderReactive(p, w, h);
            break;
          case 'mood-biome':
            this.renderMoodBiome(p, w, h);
            break;
          case 'live-paint':
            this.renderLivePaint(p, w, h);
            break;
          case 'live-ascii':
            this.renderLiveAscii(p, w, h);
            break;
          default:
            this.renderParticles(p, w, h);
        }

        this.animationFrame++;
      };

      p.windowResized = () => {
        if (this.container.offsetWidth > 0) {
          p.resizeCanvas(this.container.offsetWidth, this.container.offsetHeight);
        }
      };
    };

    this.p5Instance = new p5(this.sketch);
  }

  /**
   * Set audio features for visualization
   */
  setAudioFeatures(features) {
    if (features) {
      this.audioFeatures = {
        energy: features.energy || 0.5,
        valence: features.valence || 0.5,
        danceability: features.danceability || 0.5,
        tempo: features.tempo || 120,
        acousticness: features.acousticness || 0,
        instrumentalness: features.instrumentalness || 0,
        liveness: features.liveness || 0.5,
        speechiness: features.speechiness || 0,
      };
      this.rebuildLiveNotes();
      console.log('[Visual] Audio features updated:', this.audioFeatures);
    }
  }

  /**
   * Set track metadata used to create a deterministic live note stream.
   */
  setTrackContext(track) {
    this.trackContext = track || null;
    this.liveSeed = this.hashString([
      track?.id,
      track?.uri,
      track?.name,
      Array.isArray(track?.artists) ? track.artists.map((artist) => artist.name || artist).join(',') : track?.artists,
    ].filter(Boolean).join('|')) || 42;
    this.rebuildLiveNotes();
  }

  /**
   * Keep visuals aligned with Spotify playback progress.
   */
  setPlaybackState({ positionMs = 0, durationMs = 0, isPlaying = false } = {}) {
    this.playback = {
      positionMs: Math.max(0, Number(positionMs) || 0),
      durationMs: Math.max(0, Number(durationMs) || 0),
      isPlaying: !!isPlaying,
      updatedAt: this.getClockTime(),
    };
  }

  /**
   * Change visualization mode
   */
  setMode(mode) {
    if (this.modes.includes(mode)) {
      this.mode = mode;
      console.log('[Visual] Mode changed to:', mode);
    }
  }

  /**
   * Get color palette based on audio mood
   */
  getColorPalette() {
    const valence = this.audioFeatures.valence;
    const energy = this.audioFeatures.energy;

    // Warm palette (high valence/happy)
    if (valence > 0.6) {
      return {
        bg: [5, 5, 16],
        primary: [30, 215, 96],
        secondary: [52, 211, 153],
        accent: [167, 139, 250],
        tertiary: [244, 114, 182],
      };
    }
    // Cool palette (low valence/sad)
    else if (valence < 0.4) {
      return {
        bg: [5, 5, 16],
        primary: [14, 165, 233],
        secondary: [167, 139, 250],
        accent: [52, 211, 153],
        tertiary: [148, 163, 184],
      };
    }
    // Neutral palette
    else {
      return {
        bg: [5, 5, 16],
        primary: [167, 139, 250],
        secondary: [52, 211, 153],
        accent: [244, 114, 182],
        tertiary: [14, 165, 233],
      };
    }
  }

  getClockTime() {
    return (typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now();
  }

  clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  mixColor(a, b, amount) {
    const t = this.clamp(amount);
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t),
    ];
  }

  getPlaybackMetrics() {
    const durationMs = this.playback.durationMs || this.trackContext?.duration_ms || this.trackContext?.duration || 180000;
    const durationSec = Math.max(1, durationMs / 1000);
    const basePositionSec = Math.max(0, (this.playback.positionMs || 0) / 1000);
    const driftSec = this.playback.isPlaying
      ? Math.max(0, (this.getClockTime() - (this.playback.updatedAt || this.getClockTime())) / 1000)
      : 0;
    const positionSec = Math.min(durationSec, basePositionSec + driftSec);
    const tempo = Math.max(60, Math.min(190, this.audioFeatures.tempo || 120));
    const beatWave = Math.sin(positionSec * (tempo / 60) * Math.PI * 2) * 0.5 + 0.5;

    return {
      durationSec,
      positionSec,
      progress: this.clamp(positionSec / durationSec),
      tempo,
      beatPulse: Math.pow(beatWave, 5),
    };
  }

  drawVerticalGradient(p, w, h, topColor, bottomColor, steps = 72) {
    p.noStroke();
    for (let i = 0; i < steps; i++) {
      const t = i / Math.max(1, steps - 1);
      const color = this.mixColor(topColor, bottomColor, t);
      p.fill(...color);
      p.rect(0, (h * i) / steps, w, Math.ceil(h / steps) + 1);
    }
  }

  /**
   * RENDER MODE: Particles
   * Floating particles based on track energy
   */
  renderParticles(p, w, h) {
    const { energy, danceability } = this.audioFeatures;
    const palette = this.getColorPalette();
    const frame = this.animationFrame;

    // Fade background
    p.background(...palette.bg);
    p.fill(palette.bg[0], palette.bg[1], palette.bg[2], 30);
    p.rect(0, 0, w, h);

    p.noStroke();
    p.blendMode(p.ADD);

    const particleCount = Math.floor(50 * energy);
    const speed = 0.5 + energy * 2;

    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2 + frame * 0.01;
      const distance = 100 + Math.sin(frame * 0.005 + i) * 100;

      const x = w / 2 + Math.cos(angle) * distance;
      const y = h / 2 + Math.sin(angle) * distance;

      const size = 4 + Math.sin(frame * 0.02 + i) * 3;
      const colorChoice = i % 2;
      const color = colorChoice === 0 ? palette.primary : palette.accent;

      p.fill(...color, 100 + energy * 100);
      p.ellipse(x, y, size, size);

      // Glow
      p.fill(...color, (energy * 60) * 0.5);
      p.ellipse(x, y, size * 2.5, size * 2.5);
    }

    p.blendMode(p.BLEND);
  }

  /**
   * RENDER MODE: Waves
   * Flowing waves influenced by danceability
   */
  renderWaves(p, w, h) {
    const { danceability, energy } = this.audioFeatures;
    const palette = this.getColorPalette();
    const frame = this.animationFrame;

    p.background(...palette.bg);

    p.stroke(...palette.primary);
    p.strokeWeight(2);
    p.noFill();

    const waveCount = Math.floor(5 + energy * 3);
    const frequency = 0.01 + danceability * 0.05;
    const amplitude = 50 + energy * 80;

    for (let wave = 0; wave < waveCount; wave++) {
      p.beginShape();

      const yOffset = (h / (waveCount + 1)) * (wave + 1);
      const phaseShift = (frame * 0.02) + (wave * 0.5);

      for (let x = 0; x <= w; x += 10) {
        const y = yOffset + Math.sin(x * frequency + phaseShift) * amplitude;
        p.vertex(x, y);
      }

      p.endShape();

      // Gradient effect - alternate colors
      if (wave % 2 === 0) {
        p.stroke(...palette.secondary);
      } else {
        p.stroke(...palette.accent);
      }
    }
  }

  /**
   * RENDER MODE: Mandala
   * Geometric mandala pattern - complexity based on energy
   */
  renderMandala(p, w, h) {
    const { energy, valence } = this.audioFeatures;
    const palette = this.getColorPalette();
    const frame = this.animationFrame;

    p.background(...palette.bg);
    p.translate(w / 2, h / 2);

    const rotation = (frame * 0.005) * energy;
    const petals = Math.floor(6 + energy * 8);
    const layers = Math.floor(3 + valence * 4);

    for (let layer = 0; layer < layers; layer++) {
      p.push();
      p.rotate((frame * 0.002) * (layer + 1) * (layer % 2 === 0 ? 1 : -1));

      const radius = 50 + layer * 40;
      const alpha = 200 - layer * 40;

      p.stroke(...palette.primary);
      p.strokeWeight(2);
      p.noFill();

      p.beginShape();
      for (let i = 0; i <= petals; i++) {
        const angle = (i / petals) * Math.PI * 2 + rotation;
        const r = radius + Math.sin(frame * 0.01 + i) * 20 * energy;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        p.vertex(x, y);
      }
      p.endShape(p.CLOSE);

      p.pop();
    }

    // Center circle
    p.fill(...palette.accent);
    p.noStroke();
    p.ellipse(0, 0, 20 + energy * 40, 20 + energy * 40);
  }

  /**
   * RENDER MODE: Constellation
   * Star constellation - point density based on instrumentalness
   */
  renderConstellation(p, w, h) {
    const { instrumentalness, energy } = this.audioFeatures;
    const palette = this.getColorPalette();
    const frame = this.animationFrame;

    p.background(...palette.bg);

    p.randomSeed(42); // Consistent pattern

    const starCount = Math.floor(50 + instrumentalness * 100);
    const stars = [];

    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: p.random(w),
        y: p.random(h),
        size: p.random(1, 4),
      });
    }

    // Draw connections
    p.stroke(...palette.secondary, 50);
    p.strokeWeight(1);

    const connectionDist = 150 * (1 - instrumentalness);
    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) {
        const dx = stars[i].x - stars[j].x;
        const dy = stars[i].y - stars[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < connectionDist) {
          p.line(stars[i].x, stars[i].y, stars[j].x, stars[j].y);
        }
      }
    }

    // Draw stars
    p.noStroke();
    p.fill(...palette.accent);

    for (const star of stars) {
      const twinkle = Math.sin(frame * 0.02 + star.x * 0.01) * 0.5 + 0.5;
      p.ellipse(star.x, star.y, star.size * (1 + twinkle * 0.5), star.size * (1 + twinkle * 0.5));
    }
  }

  /**
   * RENDER MODE: Spectrum
   * Audio spectrum visualization style
   */
  renderSpectrum(p, w, h) {
    const { energy, danceability, tempo } = this.audioFeatures;
    const palette = this.getColorPalette();
    const frame = this.animationFrame;

    p.background(...palette.bg);

    const barCount = 32;
    const barWidth = w / barCount;

    p.noStroke();

    for (let i = 0; i < barCount; i++) {
      const normalizedI = i / barCount;
      const height = (Math.sin(frame * 0.02 + normalizedI * Math.PI * 2) * 0.5 + 0.5) * energy;
      const barHeight = height * (h * 0.6);

      const hueShift = (normalizedI + frame * 0.001) % 1;
      const colorIndex = Math.floor(hueShift * 3);
      const colors = [palette.primary, palette.accent, palette.secondary];
      const color = colors[colorIndex];

      p.fill(...color, 150 + energy * 100);
      p.rect(i * barWidth, h - barHeight, barWidth - 2, barHeight);
    }
  }

  /**
   * RENDER MODE: Spiral
   * Spiral pattern - tightness based on energy
   */
  renderSpiral(p, w, h) {
    const { energy, valence } = this.audioFeatures;
    const palette = this.getColorPalette();
    const frame = this.animationFrame;

    p.background(...palette.bg);
    p.translate(w / 2, h / 2);

    p.stroke(...palette.primary);
    p.strokeWeight(2);
    p.noFill();

    const spiralTightness = 0.1 + energy * 0.4;
    const maxRadius = Math.sqrt(w * w + h * h) / 2;

    p.beginShape();
    for (let i = 0; i < 300; i++) {
      const angle = i * spiralTightness + (frame * 0.02);
      const radius = (i / 300) * maxRadius * valence;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      p.vertex(x, y);
    }
    p.endShape();

    // Add rotating accent
    p.stroke(...palette.accent);
    p.strokeWeight(1);
    for (let layer = 0; layer < 3; layer++) {
      p.push();
      p.rotate((frame * 0.003) * (layer + 1));
      p.beginShape();
      for (let i = 0; i < 200; i++) {
        const angle = i * spiralTightness + (frame * 0.01);
        const radius = (i / 200) * maxRadius * 0.7;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        p.vertex(x, y);
      }
      p.endShape();
      p.pop();
    }
  }

  /**
   * RENDER MODE: Reactive
   * Highly reactive to energy changes
   */
  renderReactive(p, w, h) {
    const { energy, danceability, liveness } = this.audioFeatures;
    const palette = this.getColorPalette();
    const frame = this.animationFrame;

    p.background(...palette.bg);

    const pulseSize = 100 + energy * 300;
    const pulseAlpha = energy * 200;

    // Main pulse
    p.noStroke();
    p.fill(...palette.primary, pulseAlpha * 0.3);
    p.ellipse(w / 2, h / 2, pulseSize, pulseSize);

    p.fill(...palette.accent, pulseAlpha * 0.5);
    p.ellipse(w / 2, h / 2, pulseSize * 0.7, pulseSize * 0.7);

    // Rotating elements
    p.push();
    p.translate(w / 2, h / 2);
    p.rotate((frame * 0.05) * energy);

    p.stroke(...palette.secondary);
    p.strokeWeight(3);
    p.noFill();

    const circleCount = Math.floor(3 + danceability * 5);
    for (let i = 0; i < circleCount; i++) {
      const radius = 50 + (i * 40) + Math.sin(frame * 0.02 + i) * 30 * energy;
      p.ellipse(0, 0, radius, radius);
    }

    p.pop();

    // Reactive lines
    p.stroke(...palette.primary);
    p.strokeWeight(2);
    const lineCount = Math.floor(6 + energy * 8);

    for (let i = 0; i < lineCount; i++) {
      const angle = (i / lineCount) * Math.PI * 2;
      const length = (liveness * 300) + Math.sin(frame * 0.01 + i) * 100;

      const x1 = w / 2 + Math.cos(angle) * 100;
      const y1 = h / 2 + Math.sin(angle) * 100;
      const x2 = w / 2 + Math.cos(angle) * (100 + length);
      const y2 = h / 2 + Math.sin(angle) * (100 + length);

      p.line(x1, y1, x2, y2);
    }
  }

  /**
   * RENDER MODE: Mood Biome
   * A living landscape grown from Spotify metadata and playback progress.
   */
  renderMoodBiome(p, w, h) {
    const {
      energy,
      valence,
      danceability,
      acousticness,
      instrumentalness,
      liveness,
      speechiness,
    } = this.audioFeatures;
    const palette = this.getColorPalette();
    const frame = this.animationFrame;
    const metrics = this.getPlaybackMetrics();
    const breath = Math.sin(frame * 0.006 + metrics.progress * Math.PI * 2) * 0.5 + 0.5;
    const pulse = 0.72 + metrics.beatPulse * (0.22 + energy * 0.18);

    const skyTop = this.mixColor([4, 7, 20], valence > 0.55 ? [35, 21, 58] : [6, 25, 52], valence);
    const skyBottom = this.mixColor([9, 19, 43], [44, 88, 72], valence * 0.68 + acousticness * 0.18);
    const horizonGlow = this.mixColor(palette.primary, [247, 172, 94], valence * 0.64);
    const soilBase = this.mixColor([6, 12, 25], palette.secondary, acousticness * 0.22 + valence * 0.08);

    this.drawVerticalGradient(p, w, h, skyTop, skyBottom);

    p.noStroke();
    p.fill(...horizonGlow, 22 + energy * 36);
    p.rect(0, h * 0.42, w, h * 0.24);

    p.blendMode(p.ADD);
    const lightX = w * (0.2 + ((this.liveSeed % 983) / 983) * 0.6);
    const lightY = h * (0.16 + ((this.liveSeed % 389) / 389) * 0.12);
    for (let ring = 8; ring > 0; ring--) {
      const radius = (18 + ring * 24 + energy * 32) * pulse;
      p.fill(...horizonGlow, 7 + ring * 2 + metrics.beatPulse * 10);
      p.ellipse(lightX, lightY, radius, radius);
    }

    const starRand = this.createRandom(this.liveSeed ^ 0x51A7);
    const starCount = Math.floor(24 + instrumentalness * 72 + (1 - valence) * 26);
    for (let i = 0; i < starCount; i++) {
      const x = starRand() * w;
      const y = starRand() * h * 0.42;
      const size = 0.8 + starRand() * (2.4 + instrumentalness * 2);
      const shimmer = Math.sin(frame * (0.012 + starRand() * 0.018) + i * 1.7) * 0.5 + 0.5;
      p.fill(...palette.tertiary, 35 + shimmer * 95);
      p.ellipse(x, y, size * (0.8 + shimmer), size * (0.8 + shimmer));
    }
    p.blendMode(p.BLEND);

    const terrainLayers = 4 + Math.floor(acousticness * 3 + instrumentalness * 2);
    for (let layer = 0; layer < terrainLayers; layer++) {
      const layerNorm = layer / Math.max(1, terrainLayers - 1);
      const baseY = h * (0.5 + layerNorm * 0.34);
      const amp = h * (0.026 + layerNorm * 0.05 + energy * 0.02);
      const freq = 0.0026 + layerNorm * 0.0054 + danceability * 0.0018;
      const speed = (0.0012 + danceability * 0.0018) * (layer % 2 === 0 ? 1 : -1);
      const color = this.mixColor(soilBase, palette.primary, 0.06 + layerNorm * 0.18 + valence * 0.06);

      p.noStroke();
      p.fill(...color, 126 + layerNorm * 78);
      p.beginShape();
      p.vertex(-24, h + 24);
      for (let x = -24; x <= w + 24; x += 18) {
        const noiseLift = (p.noise(x * freq, layer * 9.3 + metrics.progress * 5 + frame * speed) - 0.5) * amp * 1.7;
        const waveLift = Math.sin(x * freq * 9 + frame * speed * 28 + layer * 1.7) * amp * 0.46;
        p.vertex(x, baseY + noiseLift + waveLift);
      }
      p.vertex(w + 24, h + 24);
      p.endShape(p.CLOSE);
    }

    p.blendMode(p.ADD);
    const streamCount = 2 + Math.floor(danceability * 5 + liveness * 2);
    for (let stream = 0; stream < streamCount; stream++) {
      const lane = stream / Math.max(1, streamCount - 1);
      const yBase = h * (0.52 + lane * 0.3);
      const color = [palette.primary, palette.secondary, palette.accent, palette.tertiary][stream % 4];
      p.noFill();
      p.stroke(...color, 24 + energy * 42);
      p.strokeWeight(0.9 + energy * 2.4 + lane * 0.8);
      p.beginShape();
      for (let x = -20; x <= w + 20; x += 16) {
        const tempoFlow = metrics.positionSec * (0.3 + metrics.tempo / 220);
        const y = yBase
          + Math.sin(x * 0.014 + tempoFlow + stream * 1.9) * (10 + danceability * 22)
          + Math.sin(x * 0.004 - frame * 0.008 + stream) * (6 + acousticness * 16);
        p.vertex(x, y);
      }
      p.endShape();
    }

    const bloomRand = this.createRandom(this.liveSeed ^ 0xB100);
    const bloomCount = Math.floor(36 + energy * 72 + acousticness * 28 + instrumentalness * 34);
    for (let i = 0; i < bloomCount; i++) {
      const bornAt = bloomRand();
      const reveal = this.clamp((metrics.progress - bornAt) * 9 + 0.2);
      if (reveal <= 0) continue;

      const baseX = bloomRand() * w;
      const ground = bloomRand();
      const baseY = h * (0.55 + ground * 0.36);
      const stemHeight = (18 + bloomRand() * (52 + acousticness * 70 + energy * 24)) * reveal;
      const sway = Math.sin(frame * (0.006 + danceability * 0.014) + i * 1.31) * (4 + danceability * 15);
      const headX = baseX + sway;
      const headY = baseY - stemHeight;
      const velocity = 0.55 + bloomRand() * 0.45;
      const petalCount = 3 + Math.floor(valence * 5 + energy * 3);
      const size = (4 + velocity * 10 + energy * 5 + metrics.beatPulse * 5) * reveal;
      const stemColor = this.mixColor(palette.secondary, [210, 255, 221], acousticness * 0.2);
      const bloomColor = [palette.primary, palette.secondary, palette.accent, palette.tertiary][Math.floor(bloomRand() * 4)];

      p.blendMode(p.BLEND);
      p.stroke(...stemColor, 48 + reveal * 118);
      p.strokeWeight(0.8 + acousticness * 1.8);
      p.line(baseX, baseY, headX, headY);

      p.noStroke();
      p.blendMode(p.ADD);
      for (let petal = 0; petal < petalCount; petal++) {
        const angle = (petal / petalCount) * Math.PI * 2 + breath * 0.5 + i;
        p.push();
        p.translate(headX + Math.cos(angle) * size * 0.42, headY + Math.sin(angle) * size * 0.32);
        p.rotate(angle);
        p.fill(...bloomColor, 36 + reveal * 118);
        p.ellipse(0, 0, size * (1.2 + energy * 0.35), size * 0.52);
        p.pop();
      }
      p.fill(...horizonGlow, 45 + reveal * 130);
      p.ellipse(headX, headY, size * 0.58, size * 0.58);
    }

    if (speechiness > 0.12) {
      const glyphRand = this.createRandom(this.liveSeed ^ 0xA5C11);
      const glyphs = '.:+*#';
      const glyphCount = Math.floor(12 + speechiness * 74);
      p.blendMode(p.ADD);
      p.textFont('Space Mono');
      p.textAlign(p.CENTER, p.CENTER);
      p.textSize(9 + speechiness * 9);
      for (let i = 0; i < glyphCount; i++) {
        const x = (glyphRand() * w + metrics.positionSec * (12 + danceability * 28) + i * 17) % w;
        const y = h * (0.2 + glyphRand() * 0.58);
        const char = glyphs[Math.floor(glyphRand() * glyphs.length)];
        const alpha = 20 + speechiness * 90 + metrics.beatPulse * 35;
        p.fill(...palette.accent, alpha);
        p.text(char, x, y + Math.sin(frame * 0.014 + i) * 10);
      }
    }

    const playX = metrics.progress * w;
    p.blendMode(p.BLEND);
    p.stroke(255, 255, 255, 30 + metrics.beatPulse * 65);
    p.strokeWeight(1);
    p.line(playX, h * 0.13, playX, h * 0.94);
    p.noStroke();
  }

  hashString(value) {
    let hash = 2166136261;
    const input = String(value || 'cozy-live');
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  createRandom(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6D2B79F5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  rebuildLiveNotes() {
    const durationMs = this.trackContext?.duration_ms || this.trackContext?.duration || this.playback.durationMs || 180000;
    const durationSec = Math.max(30, durationMs / 1000);
    const { energy, valence, danceability, tempo, acousticness, speechiness } = this.audioFeatures;
    const rand = this.createRandom(this.liveSeed);
    const beatSec = 60 / Math.max(60, Math.min(190, tempo || 120));
    const stepSec = beatSec * (danceability > 0.68 ? 0.5 : 1);
    const basePitch = Math.round(44 + valence * 18 + (this.liveSeed % 12));
    const pitchRange = Math.round(14 + energy * 26);
    const density = 0.52 + energy * 0.72 + danceability * 0.35;
    const notes = [];

    for (let t = 0; t < durationSec; t += stepSec) {
      const phrase = Math.floor(t / (beatSec * 8));
      const shouldPlace = rand() < Math.min(0.95, density);
      if (!shouldPlace) continue;

      const motif = Math.sin((phrase + rand()) * Math.PI * 0.5);
      const pitchOffset = Math.round((rand() - 0.5) * pitchRange + motif * 6);
      const note = Math.max(36, Math.min(96, basePitch + pitchOffset));
      const duration = stepSec * (0.45 + rand() * (1.3 - acousticness * 0.4));
      const velocity = Math.round(45 + rand() * 45 + energy * 36 + speechiness * 18);

      notes.push({
        note,
        startSec: t,
        endSec: Math.min(durationSec, t + duration),
        velocity: Math.max(20, Math.min(127, velocity)),
        lane: Math.floor(rand() * 6),
      });

      if (energy > 0.72 && rand() < 0.35) {
        notes.push({
          note: Math.max(36, Math.min(96, note + (rand() > 0.5 ? 7 : 12))),
          startSec: t + stepSec * 0.18,
          endSec: Math.min(durationSec, t + duration * 0.72),
          velocity: Math.max(20, Math.min(127, velocity - 12)),
          lane: Math.floor(rand() * 6),
        });
      }
    }

    this.liveNotes = notes;
  }

  getLiveWindow(windowSec = 18) {
    if (!this.liveNotes.length) this.rebuildLiveNotes();
    const durationSec = Math.max(1, (this.playback.durationMs || this.trackContext?.duration_ms || 180000) / 1000);
    const positionSec = Math.min(durationSec, (this.playback.positionMs || 0) / 1000);
    const start = Math.max(0, positionSec - windowSec * 0.22);
    const end = Math.min(durationSec, start + windowSec);
    const minNote = this.liveNotes.reduce((min, note) => Math.min(min, note.note), 96);
    const maxNote = this.liveNotes.reduce((max, note) => Math.max(max, note.note), 36);

    return {
      start,
      end,
      positionSec,
      durationSec,
      minNote,
      maxNote,
      notes: this.liveNotes.filter((note) => note.endSec >= start && note.startSec <= end),
    };
  }

  renderLivePaint(p, w, h) {
    const palette = this.getColorPalette();
    const { energy, danceability } = this.audioFeatures;
    const frame = this.animationFrame;
    const view = this.getLiveWindow(20);
    const noteRange = Math.max(1, view.maxNote - view.minNote);

    p.background(...palette.bg, 230);
    p.blendMode(p.ADD);
    p.noStroke();

    view.notes.forEach((note) => {
      const timeNorm = (note.startSec - view.start) / Math.max(0.001, view.end - view.start);
      const pitchNorm = (note.note - view.minNote) / noteRange;
      const x = timeNorm * w;
      const y = h - (pitchNorm * h * 0.78 + h * 0.1);
      const velocity = note.velocity / 127;
      const active = view.positionSec >= note.startSec && view.positionSec <= note.endSec;
      const age = Math.abs(view.positionSec - note.startSec);
      const color = [palette.primary, palette.secondary, palette.accent, palette.tertiary][note.note % 4];
      const radius = 5 + velocity * 26 + (active ? 18 : 0);
      const drift = Math.sin(frame * 0.035 + note.lane) * (12 + danceability * 28);
      const alpha = active ? 230 : Math.max(35, 170 - age * 18);

      p.fill(...color, alpha * 0.18);
      p.ellipse(x, y + drift, radius * (3 + energy), radius * (3 + energy));
      p.fill(...color, alpha);
      p.ellipse(x, y + drift, radius, radius);

      if (note.endSec > note.startSec) {
        const endNorm = (note.endSec - view.start) / Math.max(0.001, view.end - view.start);
        p.stroke(...color, alpha * 0.55);
        p.strokeWeight(1 + velocity * 4);
        p.line(x, y + drift, endNorm * w, y + drift);
        p.noStroke();
      }
    });

    const playX = ((view.positionSec - view.start) / Math.max(0.001, view.end - view.start)) * w;
    p.blendMode(p.BLEND);
    p.stroke(255, 255, 255, 170);
    p.strokeWeight(2);
    p.line(playX, h * 0.08, playX, h * 0.92);
    p.noStroke();
    p.fill(255, 255, 255, 210);
    p.ellipse(playX, h * 0.08, 8, 8);
  }

  renderLiveAscii(p, w, h) {
    const palette = this.getColorPalette();
    const view = this.getLiveWindow(16);
    const noteRange = Math.max(1, view.maxNote - view.minNote);
    const chars = ' .:-=+*#%@';
    const cols = Math.max(34, Math.floor(w / 14));
    const rows = Math.max(18, Math.floor(h / 18));
    const cellW = w / cols;
    const cellH = h / rows;
    const grid = new Array(rows).fill(null).map(() => new Array(cols).fill(0));

    view.notes.forEach((note) => {
      const cx = Math.floor(((note.startSec - view.start) / Math.max(0.001, view.end - view.start)) * (cols - 1));
      const cy = Math.floor((1 - ((note.note - view.minNote) / noteRange)) * (rows - 1));
      const radius = 1 + Math.floor((note.velocity / 127) * 3);
      for (let y = cy - radius; y <= cy + radius; y++) {
        for (let x = cx - radius; x <= cx + radius; x++) {
          if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
          const dist = Math.hypot(x - cx, y - cy);
          if (dist <= radius) {
            grid[y][x] = Math.max(grid[y][x], (1 - dist / (radius + 0.001)) * (note.velocity / 127));
          }
        }
      }
    });

    p.background(...palette.bg);
    p.textFont('Space Mono');
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(Math.max(10, Math.min(18, cellH * 0.82)));

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const intensity = grid[row][col];
        const scan = Math.abs(col / cols - ((view.positionSec - view.start) / Math.max(0.001, view.end - view.start)));
        const boosted = Math.max(intensity, scan < 0.025 ? 0.85 : 0);
        const index = Math.min(chars.length - 1, Math.floor(boosted * (chars.length - 1)));
        const color = boosted > 0.75 ? palette.accent : boosted > 0.35 ? palette.primary : palette.tertiary;
        p.fill(...color, boosted > 0 ? 70 + boosted * 180 : 32);
        p.text(chars[index], col * cellW + cellW / 2, row * cellH + cellH / 2);
      }
    }
  }

  /**
   * Stop/start rendering
   */
  stop() {
    this.isRunning = false;
  }

  resume() {
    this.isRunning = true;
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.p5Instance) {
      this.p5Instance.remove();
    }
  }
}

// Initialize visual engine when page loads
document.addEventListener('DOMContentLoaded', () => {
  window.visualEngine = new CozyVisualEngine('canvas-container');
  console.log('[Visual] Engine initialized');
});
