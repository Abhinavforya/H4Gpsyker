/**
 * ascii-art.js
 * MIDI → ASCII Art renderer.
 *
 * Algorithm:
 *  1. Build a grid of characters (cols × rows).
 *  2. For each cell, a seeded pseudo-random + note-driven mapping decides:
 *     - which ASCII "density" level character to place
 *     - whether the cell gets a "highlight" (from a high-velocity note nearby)
 *  3. The entire MIDI note corpus influences the character grid via:
 *     - Note pitch  → vertical band selection
 *     - Note time   → horizontal band selection
 *     - Note velocity → character density weighting
 *     - Unique note count per cell region → character variety
 */

const AsciiArt = (() => {

  // ── Character sets from sparse → dense ───────────────────
  const CHAR_SETS = {
    classic:   ' .\'`^",:;Il!i~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$',
    blocks:    ' ░░▒▒▓▓████▓▒░ ·:!|(){}[]<>╔╗╚╝╠╣╦╩╬═║┼├┤┬┴─│▲▼◄►♦♣♠♥★☆◉○●◐◑',
    symbols:   ' ·∙•○◌◍◎●◉★☆✦✧✩✪✫✬✭✮✯✰⚫⚬⬡⬢♦♣♠♥♫♬♩♪',
    numbers:   ' 0123456789abcdefghijklmnopqrstuvwxyz!@#$%^&*()-+=[]{}|;:,.<>?',
    musical:   ' ♩♪♫♬♭♮♯𝄞𝄢𝄟𝄠𝄡𝄻𝄼𝄽𝄾𝄿𝅀𝅁𝅂·:;!*#@',
    wave:      ' ~~~≈≈∿∿〰〰⋮⋮::;;||‖‖||;;::⋮⋮〰〰∿∿≈≈~~~',
    grayscale: ' ░▒▓█▓▒░░▒▓█▓▒░░▒▓█▓▒░░▒▓█▓▒░',
    dots:      ' ·˙• º ° ∘ ◉ ●',
    braille:   ' ⠀⠂⠄⠆⠈⠊⠌⠎⠐⠒⠔⠖⠘⠚⠜⠞⠠⠢⠤⠦⠨⠪⠬⠮⠰⠲⠴⠶⠸⠺⠼⠾⠿',
    circuit:   ' ─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬⎔⎕⎖⎗⎘⎙⎚⎛⎜⎝⎞⎟⎠',
  };

  const COLOR_THEMES = {
    matrix:    { fg: '#00ff41', bg: '#000000', hi: '#ffffff', dim: '#003010' },
    amber:     { fg: '#ffb000', bg: '#0a0600', hi: '#fffde0', dim: '#3a2000' },
    cyan:      { fg: '#00d4ff', bg: '#000a10', hi: '#ffffff', dim: '#004455' },
    purple:    { fg: '#bf5fff', bg: '#0a0010', hi: '#ffffff', dim: '#3a0060' },
    white:     { fg: '#e0e0e0', bg: '#050505', hi: '#ffffff', dim: '#404040' },
    rainbow:   { fg: null,      bg: '#000000', hi: '#ffffff', dim: '#111111' }, // special
    cyberpunk: { fg: '#ff00ff', bg: '#0a0014', hi: '#00ffff', dim: '#330055' },
    forest:    { fg: '#66ff00', bg: '#0a1a00', hi: '#ffff00', dim: '#1a3300' },
    twilight:  { fg: '#b19cd9', bg: '#1a0033', hi: '#ff6699', dim: '#330055' },
    sunrise:   { fg: '#ffaa44', bg: '#220000', hi: '#ffff88', dim: '#663300' },
    ocean:     { fg: '#44aaff', bg: '#001122', hi: '#88ccff', dim: '#003366' },
    fire:      { fg: '#ff6644', bg: '#220000', hi: '#ffff00', dim: '#662200' },
  };

  // Note names for display
  const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

  // ── Seeded PRNG (mulberry32) ────────────────────────────
  function makePRNG(seed) {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s ^ (s >>> 15), s | 1) ^ (Math.imul(s ^ (s >>> 7), s | 61))) >>> 0;
      return s / 4294967296;
    };
  }

  // ── Rainbow colour from MIDI pitch ─────────────────────
  function noteToHslString(note, alpha = 1) {
    const hue = ((note % 12) / 12) * 360;
    return `hsla(${hue.toFixed(0)},90%,65%,${alpha})`;
  }

  /**
   * Build the ASCII art grid.
   * @param {object} midiData - Parsed MIDI data (same shape from MidiParser or AudioToMidi)
   * @param {object} opts
   *   cols         {number}  grid width in chars (default 120)
   *   rows         {number}  grid height in chars (default 40)
   *   charSet      {string}  key into CHAR_SETS (default 'classic')
   *   colorTheme   {string}  key into COLOR_THEMES (default 'matrix')
   *   seed         {number}  random seed (default Date.now())
   *   density      {number}  0..100 density bias
   *   animated     {boolean} true = return frames array for animation
   *   frameCount   {number}  number of animation frames
   *
   * @returns {object} { grid, html, frames, meta }
   */
  function generate(midiData, opts = {}) {
    const cols       = opts.cols       || 100;
    const rows       = opts.rows       || 38;
    const charSetKey = opts.charSet    || 'classic';
    const themeKey   = opts.colorTheme || 'matrix';
    const seed       = opts.seed       || 42;
    const density    = (opts.density   || 50) / 100;

    const chars = CHAR_SETS[charSetKey] || CHAR_SETS.classic;
    const theme = COLOR_THEMES[themeKey] || COLOR_THEMES.matrix;
    const rand  = makePRNG(seed);

    const notes     = midiData.notes || [];
    const maxTick   = midiData.maxTick || 1;
    const minNote   = midiData.uniquePitches?.[0] ?? 36;
    const maxNote   = midiData.uniquePitches?.[midiData.uniquePitches.length - 1] ?? 96;
    const noteRange = Math.max(1, maxNote - minNote);

    // ── Pre-compute note influence map ────────────────────
    // For each (col, row) bucket, accumulate notes that "land" there.
    const cellNotes = new Array(rows).fill(null).map(() => new Array(cols).fill(null).map(() => []));

    notes.forEach(n => {
      const tickNorm = Math.min(1, n.startTick / maxTick);
      const noteNorm = Math.min(1, Math.max(0, (n.note - minNote) / noteRange));

      // Primary cell
      const cx = Math.floor(tickNorm * (cols - 1));
      const cy = Math.floor((1 - noteNorm) * (rows - 1));

      // Spread influence radius based on velocity
      const radius = Math.ceil(1 + (n.velocity / 127) * 4 * density);

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= radius) {
              cellNotes[ny][nx].push({ ...n, dist, radius });
            }
          }
        }
      }
    });

    // ── Build character grid ──────────────────────────────
    const grid = [];

    for (let row = 0; row < rows; row++) {
      const rowChars = [];
      for (let col = 0; col < cols; col++) {
        const cell  = cellNotes[row][col];
        const noise = rand(); // deterministic

        if (cell.length === 0) {
          // Empty region: sparse chars weighted by noise + density
          const p = noise * (1 - density * 0.4);
          const ci = Math.floor(p * p * chars.length * 0.3);
          rowChars.push({ ch: chars[Math.min(ci, chars.length - 1)], noteInf: null });
        } else {
          // Note-influenced cell
          // Dominant note = highest velocity in radius
          const dominant = cell.reduce((a, b) => (a.velocity > b.velocity ? a : b));
          const velNorm  = dominant.velocity / 127;
          const distFrac = 1 - (dominant.dist / (dominant.radius + 0.001));

          // Character density: mix note data + seeded noise
          const bias = velNorm * distFrac * density + noise * (1 - density) * 0.3;
          const ci   = Math.min(chars.length - 1, Math.floor(bias * chars.length * 1.1));

          rowChars.push({
            ch:      chars[Math.max(0, ci)],
            note:    dominant.note,
            vel:     dominant.velocity,
            dist:    dominant.dist,
            hi:      distFrac > 0.85 && velNorm > 0.7,   // highlight center
            noteCell: cell,
          });
        }
      }
      grid.push(rowChars);
    }

    // ── Render to HTML ────────────────────────────────────
    const html = renderHtml(grid, theme, themeKey);

    // ── Meta stats ────────────────────────────────────────
    const totalChars = grid.flat().filter(c => c.ch.trim()).length;
    const coverage   = ((totalChars / (rows * cols)) * 100).toFixed(1);
    const meta = {
      cols, rows,
      totalChars,
      coverage,
      charSet: charSetKey,
      colorTheme: themeKey,
      seed,
      noteCount: notes.length,
      uniquePitches: midiData.uniquePitches?.length || 0,
    };

    // ── Animation frames ──────────────────────────────────
    let frames = null;
    if (opts.animated) {
      frames = buildAnimationFrames(grid, opts.frameCount || 20, theme, themeKey, rand);
    }

    return { grid, html, frames, meta };
  }

  function renderHtml(grid, theme, themeKey) {
    const lines = grid.map(row => {
      const spans = row.map(cell => {
        const ch = escChar(cell.ch);

        if (!cell.note && !cell.noteCell) {
          return `<span style="color:${theme.dim}">${ch}</span>`;
        }

        let color;
        if (themeKey === 'rainbow') {
          const alpha = cell.hi ? 1 : 0.7;
          color = noteToHslString(cell.note, alpha);
        } else {
          color = cell.hi ? theme.hi : theme.fg;
        }

        const style = cell.hi
          ? `color:${color};text-shadow:0 0 6px ${color}`
          : `color:${color}`;

        return `<span style="${style}">${ch}</span>`;
      }).join('');
      return `<div class="ascii-row">${spans}</div>`;
    }).join('');

    return `<div class="ascii-art" style="background:${theme.bg || '#000'}">${lines}</div>`;
  }

  /**
   * Build animation frames by "scanning" through the grid over time.
   * Each frame highlights a vertical slice of the composition.
   */
  function buildAnimationFrames(grid, frameCount, theme, themeKey, rand) {
    const rows = grid.length;
    const cols = grid[0].length;
    const frames = [];

    for (let f = 0; f < frameCount; f++) {
      const progress = f / (frameCount - 1);
      const scanCol  = Math.floor(progress * (cols - 1));
      const window   = Math.floor(cols * 0.08); // highlight window width

      const lines = grid.map(row => {
        const spans = row.map((cell, cidx) => {
          const ch    = escChar(cell.ch);
          const dist  = Math.abs(cidx - scanCol);
          const inWin = dist <= window;

          if (!cell.note && !cell.noteCell) {
            // Background: dim unless in scan window
            const color = inWin ? '#444' : theme.dim;
            return `<span style="color:${color}">${ch}</span>`;
          }

          let color;
          if (themeKey === 'rainbow') {
            color = noteToHslString(cell.note, inWin ? 1 : 0.25);
          } else {
            if (inWin) {
              color = cell.hi ? theme.hi : theme.fg;
            } else {
              color = theme.dim;
            }
          }

          const glow = (inWin && dist < window * 0.4) ? `;text-shadow:0 0 8px ${color}` : '';
          return `<span style="color:${color}${glow}">${ch}</span>`;
        }).join('');
        return `<div class="ascii-row">${spans}</div>`;
      }).join('');

      frames.push(`<div class="ascii-art" style="background:${theme.bg || '#000'}">${lines}</div>`);
    }
    return frames;
  }

  function escChar(ch) {
    if (ch === '&') return '&amp;';
    if (ch === '<') return '&lt;';
    if (ch === '>') return '&gt;';
    if (ch === '"') return '&quot;';
    return ch || ' ';
  }

  // ── Export to plain text ─────────────────────────────
  function toPlainText(grid) {
    return grid.map(row => row.map(c => c.ch).join('')).join('\n');
  }

  return { generate, toPlainText, CHAR_SETS, COLOR_THEMES };
})();
