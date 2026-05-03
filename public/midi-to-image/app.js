/**
 * app.js
 * Main application controller.
 * Supports:
 *   - .mid / .midi  → parsed by MidiParser
 *   - .mp3 / .wav / .ogg → converted by AudioToMidi
 * Then renders:
 *   - ASCII art via AsciiArt
 *   - p5.js generative canvas via createSketch
 */

let parsedMidi = null;
let asciiAnimTimer = null;
let asciiAnimFrames = null;
let asciiAnimIdx = 0;
let asciiAnimRunning = false;
let lastLiveRenderAt = 0;

// Agent modules
let memory = null;

window.midiData = null;

const TRACK_COLORS = [
  '#a78bfa', '#34d399', '#f472b6', '#60a5fa',
  '#fbbf24', '#f87171', '#34d399', '#818cf8'
];

// Initialize agent modules on page load
document.addEventListener('DOMContentLoaded', () => {
  memory = new Memory();
  window.memory = memory;
});

/* ── Drag & Drop ── */
const dropZone = document.getElementById('dropZone');

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});

document.getElementById('midiFile').addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) processFile(file);
});

/* ── File Processing ── */
function processFile(file) {
  // Validate file
  if (!file) {
    showToast('⚠️ No file selected', 'error');
    return;
  }

  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
  if (file.size > MAX_FILE_SIZE) {
    showToast(`⚠️ File too large (max ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB)`, 'error');
    return;
  }

  const name = file.name.toLowerCase();
  if (name.match(/\.(mid|midi)$/)) {
    processMidiFile(file);
  } else if (name.match(/\.(mp3|wav|ogg|flac|aac|webm)$/)) {
    processAudioFile(file);
  } else {
    showToast('⚠️ Unsupported file type — use MP3, WAV, OGG, FLAC, AAC, or MIDI', 'error');
  }
}

/* ── MIDI file ── */
function processMidiFile(file) {
  document.getElementById('fileInfo').textContent = `📂 ${file.name}  (${formatBytes(file.size)})`;
  const reader = new FileReader();
  reader.onerror = () => {
    showToast('❌ Error reading file', 'error');
  };
  reader.onload = e => {
    try {
      const result = e.target.result;
      if (!result || result.byteLength === 0) {
        throw new Error('File is empty');
      }
      setMidiData(MidiParser.parse(result));
      
      if (!parsedMidi || !parsedMidi.notes || parsedMidi.notes.length === 0) {
        throw new Error('No MIDI notes found in file');
      }
      
      onMidiLoaded(parsedMidi, file.name);
    } catch (err) {
      showToast('❌ Failed to parse MIDI: ' + err.message, 'error');
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
}

/* ── Audio file → AudioToMidi ── */
function processAudioFile(file) {
  // Show progress bar
  const bar   = document.getElementById('progressBar');
  const fill  = document.getElementById('progressFill');
  const label = document.getElementById('progressLabel');

  // Check if Web Audio API is available
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    showToast('❌ Web Audio API not supported in your browser', 'error');
    return;
  }

  document.getElementById('fileInfo').textContent = `📂 ${file.name}  (${formatBytes(file.size)}) — analysing…`;
  bar.style.display = 'block';
  fill.style.width  = '0%';
  label.textContent = 'Decoding audio…';

  const reader = new FileReader();
  reader.onerror = () => {
    bar.style.display = 'none';
    showToast('❌ Error reading audio file', 'error');
  };
  reader.onload = async e => {
    try {
      label.textContent = 'Detecting pitches…';
      const data = await AudioToMidi.convert(e.target.result, progress => {
        fill.style.width  = Math.round(progress * 100) + '%';
        label.textContent = `Analysing audio… ${Math.round(progress * 100)}%`;
      });

      if (!data || !data.notes || data.notes.length === 0) {
        throw new Error('No notes detected in audio');
      }

      fill.style.width  = '100%';
      label.textContent = 'Done ✓';
      setTimeout(() => { bar.style.display = 'none'; }, 1200);

      setMidiData(data);
      onMidiLoaded(data, file.name);
    } catch (err) {
      bar.style.display = 'none';
      showToast('❌ Audio conversion failed: ' + err.message, 'error');
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
}

/* ── Clip renders to a short window ── */
const MAX_RENDER_SECONDS = 20;

function ticksToSeconds(ticks, data) {
  const bpm = data.bpm || data.header?.bpm || 120;
  const tpb = data.header?.division || 480;
  const ticksPerBeat = tpb & 0x8000 ? 480 : tpb;
  return (ticks / ticksPerBeat) * (60 / bpm);
}

function secondsToTicks(seconds, data) {
  const bpm = data.bpm || data.header?.bpm || 120;
  const tpb = data.header?.division || 480;
  const ticksPerBeat = tpb & 0x8000 ? 480 : tpb;
  return seconds * ticksPerBeat / (60 / bpm);
}

function getNoteStartSeconds(note, data) {
  if (Number.isFinite(note.startSec)) return note.startSec;
  if (Number.isFinite(note.time)) return note.time;
  if (Number.isFinite(note.startTick)) return ticksToSeconds(note.startTick, data);
  return 0;
}

function getNoteEndSeconds(note, data) {
  if (Number.isFinite(note.endSec)) return note.endSec;
  if (Number.isFinite(note.time) && Number.isFinite(note.duration)) return note.time + note.duration;
  if (Number.isFinite(note.endTick)) return ticksToSeconds(note.endTick, data);
  if (Number.isFinite(note.startTick) && Number.isFinite(note.durationTicks)) {
    return ticksToSeconds(note.startTick + note.durationTicks, data);
  }
  return getNoteStartSeconds(note, data) + (note.durationSec || 0);
}

function clipToWindow(data, maxSeconds) {
  if (!data || !data.notes || data.notes.length === 0) return data;

  const maxTick = secondsToTicks(maxSeconds, data);

  // Filter notes to within the time window
  const notesInWindow = data.notes.filter(n => getNoteStartSeconds(n, data) < maxSeconds);
  const clippedNotes = notesInWindow.map(n => {
    const startSec = getNoteStartSeconds(n, data);
    const endSec = Math.min(getNoteEndSeconds(n, data), maxSeconds);
    const startTick = Number.isFinite(n.startTick) ? n.startTick : secondsToTicks(startSec, data);
    const endTick = Math.min(
      Number.isFinite(n.endTick) ? n.endTick : secondsToTicks(endSec, data),
      maxTick
    );

    return {
      ...n,
      startSec,
      endSec,
      startTick,
      endTick,
      durationSec: Math.max(0, endSec - startSec),
      durationTicks: Math.max(0, endTick - startTick),
    };
  });
  const wasClipped = clippedNotes.length < data.notes.length;
  const hadTrimmedEnds = clippedNotes.some((note, index) => {
    const original = notesInWindow[index];
    return original && getNoteEndSeconds(original, data) > maxSeconds && note.endSec <= maxSeconds;
  });

  const renderedDuration = Math.min(
    maxSeconds,
    data.duration || (data.maxTick ? ticksToSeconds(data.maxTick, data) : maxSeconds)
  );

  if (!wasClipped && !hadTrimmedEnds && (data.duration || 0) <= maxSeconds) return data;

  // Recalculate maxTick and duration
  const newMaxTick = clippedNotes.length > 0
    ? Math.max(...clippedNotes.map(n => n.endTick || n.startTick))
    : 0;
  const newDuration = clippedNotes.length > 0
    ? Math.min(renderedDuration, Math.max(...clippedNotes.map(n => n.endSec || 0)))
    : 0;
  const uniquePitches = [...new Set(clippedNotes.map(n => n.note))].sort((a, b) => a - b);

  // Rebuild tracks
  const tracks = (data.tracks || []).map(t => {
    const trackNotes = clippedNotes.filter(n => n.trackIdx === t.index);
    return {
      ...t,
      noteCount: trackNotes.length,
      notes: trackNotes,
      avgVelocity: trackNotes.length
        ? trackNotes.reduce((a, b) => a + b.velocity, 0) / trackNotes.length : 0,
    };
  });

  return {
    ...data,
    notes: clippedNotes,
    tracks,
    totalNotes: clippedNotes.length,
    maxTick: newMaxTick,
    duration: newDuration,
    uniquePitches,
    _clipped: true,
    _originalNoteCount: data.notes.length,
  };
}

/* ── After MIDI data is ready ── */
function onMidiLoaded(data, filename) {
  // Clip to first 20 seconds
  const clipped = clipToWindow(data, MAX_RENDER_SECONDS);
  if (clipped._clipped) {
    showToast(`⚡ Rendering first ${MAX_RENDER_SECONDS}s — ${clipped.totalNotes}/${clipped._originalNoteCount} notes`, 'info');
  }

  setMidiData(clipped);
  window.midiData = clipped;
  showVisualizationPanels();

  renderStats(clipped);
  renderTracks(clipped);
  generateImage();
  renderAscii();

  // Log interaction in memory
  if (memory) {
    memory.logInteraction('midiLoaded', {
      filename,
      noteCount: clipped.totalNotes,
      duration: clipped.duration,
    });
  }

  const src = clipped.sourceType === 'audio'
    ? 'audio analysis'
    : clipped.sourceType === 'spotify'
      ? 'Spotify audio details'
      : 'MIDI file';
  showToast(`✓ Loaded ${clipped.totalNotes} notes from ${filename} (${src})`, 'success');
}

/* ── Stats ── */
function renderStats(data) {
  const el = document.getElementById('midiStats');
  const dur = data.duration ? ` · ${data.duration.toFixed(1)}s` : '';
  
  const bpm = data.bpm || (data.header?.bpm) || 120;
  const pitchCount = data.uniquePitches?.length || 0;
  const trackCount = data.tracks?.length || 1;
  
  el.innerHTML = [
    stat('Source', getSourceLabel(data)),
    stat('Tracks', trackCount),
    stat('Notes', data.totalNotes || 0),
    stat('BPM', bpm),
    stat('Pitches', pitchCount),
    stat('Duration', dur || (data.header?.division + ' tpb')),
  ].join('');
}
function stat(label, val) {
  return `<div class="stat-badge">${label}: <span>${val}</span></div>`;
}

function getSourceLabel(data) {
  if (data.sourceType === 'audio') return 'Audio→MIDI';
  if (data.sourceType === 'spotify') return 'Spotify→MIDI';
  if (data.sourceType === 'live') return 'Live Audio→MIDI';
  return `MIDI ${data.header?.format ?? ''}`;
}

/* ── Tracks ── */
function renderTracks(data) {
  const el = document.getElementById('tracksList');
  const maxNotes = Math.max(...data.tracks.map(t => t.noteCount), 1);
  el.innerHTML = data.tracks.map((t, i) => {
    const color = TRACK_COLORS[i % TRACK_COLORS.length];
    const pct   = Math.round((t.noteCount / maxNotes) * 100);
    return `
      <div class="track-item">
        <div class="track-swatch" style="background:${color}"></div>
        <div class="track-name">${escHtml(t.name)}</div>
        <div class="track-meta">${t.noteCount} notes · vel̄ ${Math.round(t.avgVelocity)}</div>
        <div class="track-bar">
          <div class="track-fill" style="width:${pct}%;background:${color}40;border:1px solid ${color}"></div>
        </div>
      </div>`;
  }).join('');
}

/* ── ASCII Art ── */
function getAsciiOpts() {
  return {
    charSet:    document.getElementById('asciiCharSet').value,
    colorTheme: document.getElementById('asciiColorTheme').value,
    density:    parseInt(document.getElementById('density').value),
    seed:       Math.floor(Math.random() * 0xffffff),
    cols:       Math.min(120, Math.floor((document.getElementById('ascii-container').clientWidth || 900) / 8.5)),
    rows:       40,
  };
}

function renderAscii(animated) {
  if (!parsedMidi) return;

  // Stop any running animation
  stopAsciiAnim();

  try {
    const opts = { ...getAsciiOpts(), animated: !!animated, frameCount: 30 };
    const result = AsciiArt.generate(parsedMidi, opts);

    if (!result || !result.html) {
      throw new Error('Failed to generate ASCII art');
    }

    const container = document.getElementById('ascii-container');
    container.innerHTML = result.html;
    container.style.fontFamily = "'Space Mono', 'Courier New', monospace";
    container.style.fontSize   = '0.65rem';
    container.style.lineHeight = '1.15';
    container.style.overflowX  = 'auto';

    // Stats
    const el = document.getElementById('asciiStats');
    el.innerHTML = [
      stat('Cols', result.meta?.cols || 100),
      stat('Rows', result.meta?.rows || 40),
      stat('Coverage', (result.meta?.coverage || 0) + '%'),
      stat('Chars', result.meta?.totalChars || 0),
      stat('CharSet', result.meta?.charSet || 'classic'),
      stat('Theme', result.meta?.colorTheme || 'matrix'),
    ].join('');

    if (animated && result.frames && result.frames.length > 0) {
      asciiAnimFrames = result.frames;
      asciiAnimIdx    = 0;
      asciiAnimRunning = true;
      const btn = document.getElementById('asciiAnimBtn');
      btn.textContent = '⏹ Stop';
      asciiAnimTimer = setInterval(() => {
        container.innerHTML = asciiAnimFrames[asciiAnimIdx % asciiAnimFrames.length];
        asciiAnimIdx++;
      }, 80);
    }
  } catch (err) {
    showToast('❌ Error rendering ASCII art: ' + err.message, 'error');
    console.error(err);
  }
}

function stopAsciiAnim() {
  if (asciiAnimTimer) { clearInterval(asciiAnimTimer); asciiAnimTimer = null; }
  asciiAnimRunning = false;
  document.getElementById('asciiAnimBtn').textContent = '▶ Animate';
}

document.getElementById('asciiRegenBtn').addEventListener('click', () => renderAscii(false));
document.getElementById('asciiAnimBtn').addEventListener('click', () => {
  if (asciiAnimRunning) { stopAsciiAnim(); renderAscii(false); }
  else                  { renderAscii(true); }
});
document.getElementById('asciiCopyBtn').addEventListener('click', () => {
  if (!parsedMidi) return;
  const result = AsciiArt.generate(parsedMidi, getAsciiOpts());
  navigator.clipboard.writeText(AsciiArt.toPlainText(result.grid))
    .then(() => showToast('✓ Copied plain-text ASCII art', 'success'))
    .catch(() => showToast('⚠️ Copy failed', 'error'));
});

// Re-render ASCII when charSet/theme changes
['asciiCharSet', 'asciiColorTheme'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => renderAscii(false));
});

/* ── p5 Generate ── */
function generateImage(options = {}) {
  if (!parsedMidi) return;
  const opts = getOpts();

  isAnimating = false;
  document.getElementById('animateBtn').textContent = '▶ Animate';
  createSketch(parsedMidi, opts);
  
  // Log visual generation
  if (options.logUsage !== false && memory) {
    memory.logModeUsage(opts.visualMode);
  }
}

function getOpts() {
  return {
    visualMode:  document.getElementById('visualMode').value,
    colorScheme: document.getElementById('colorScheme').value,
    bgColor:     document.getElementById('bgColor').value,
    density:     parseInt(document.getElementById('density').value),
    speed:       parseInt(document.getElementById('speed').value),
    glow:        parseInt(document.getElementById('glow').value),
  };
}

/* ── Button wiring ── */
document.getElementById('generateBtn').addEventListener('click', generateImage);
document.getElementById('regenBtn').addEventListener('click', () => {
  if (!parsedMidi) return;
  setMidiData({
    ...parsedMidi,
    notes: parsedMidi.notes
      .map(n => ({ ...n, _r: Math.random() }))
      .sort((a, b) => a._r - b._r)
  });
  generateImage();
});
document.getElementById('downloadBtn').addEventListener('click', downloadCanvas);
document.getElementById('animateBtn').addEventListener('click', function() {
  toggleAnimation(this);
});

/* ── Range labels ── */
['density', 'speed', 'glow'].forEach(id => {
  const el  = document.getElementById(id);
  const lbl = document.getElementById(id + 'Val');
  el.addEventListener('input', () => { lbl.textContent = el.value; });
});

/* ── Toast ── */
function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, {
    position:     'fixed',
    bottom:       '2rem',
    right:        '2rem',
    zIndex:       9999,
    padding:      '0.8rem 1.4rem',
    borderRadius: '12px',
    fontWeight:   '600',
    fontSize:     '0.9rem',
    color:        '#fff',
    background:   type === 'error' ? '#ef4444'
                : type === 'success' ? '#10b981' : '#6366f1',
    boxShadow:    '0 4px 24px rgba(0,0,0,0.4)',
    transition:   'opacity 0.4s',
    opacity:      '1',
  });
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 3000);
}

/* ── Utils ── */
function formatBytes(bytes) {
  if (bytes < 1024)    return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}
function escHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function setMidiData(data) {
  parsedMidi = data;
  window.midiData = data;
}

function showVisualizationPanels() {
  document.getElementById('controls').classList.remove('hidden');
  document.getElementById('canvas-wrap').classList.remove('hidden');
  document.getElementById('ascii-wrap').classList.remove('hidden');
  document.getElementById('tracksPanel').classList.remove('hidden');
}

function updateLiveMidiCapture(data, options = {}) {
  if (!data) return;

  setMidiData(data);
  showVisualizationPanels();
  renderStats(data);
  renderTracks(data);

  const now = Date.now();
  const shouldRender = options.final || now - lastLiveRenderAt > 1200;
  if (data.notes?.length && shouldRender) {
    generateImage({ logUsage: false });
    renderAscii(false);
    lastLiveRenderAt = now;
  }

  if (options.final && window.showToast) {
    showToast(`✓ Live capture ready: ${data.notes?.length || 0} notes`, 'success');
  }
}

window.generateAsciiArt = () => renderAscii(false);
window.generateP5Visualization = () => generateImage();
window.loadMidiDataFromSpotify = (data, filename) => onMidiLoaded(data, filename || data.name || 'Spotify track');
window.setMidiData = setMidiData;
window.updateLiveMidiCapture = updateLiveMidiCapture;
window.showToast = showToast;
