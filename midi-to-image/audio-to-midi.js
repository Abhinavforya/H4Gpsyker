/**
 * audio-to-midi.js
 * Converts an audio file (mp3/wav/ogg) into a synthetic MIDI-like data object
 * using Web Audio API + autocorrelation pitch detection.
 * No external libraries required.
 */

const AudioToMidi = (() => {

  // ── Constants ────────────────────────────────────────────
  const SAMPLE_RATE = 44100;
  const FRAME_SIZE  = 2048;  // ~46 ms per frame at 44100 Hz
  const HOP_SIZE    = 1024;  // 50% overlap
  const MIN_NOTE    = 36;    // C2
  const MAX_NOTE    = 96;    // C7
  const MIN_FREQ    = 65.41; // C2
  const MAX_FREQ    = 2093;  // C7
  const RMS_THRESH  = 0.01;  // silence gate
  const MAX_DURATION_SEC = 20; // Only analyse first 20 seconds

  // ── Helpers ──────────────────────────────────────────────
  function freqToMidi(freq) {
    if (!freq || freq <= 0) return null;
    const midi = Math.round(12 * Math.log2(freq / 440) + 69);
    return (midi >= MIN_NOTE && midi <= MAX_NOTE) ? midi : null;
  }

  function rms(buf) {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  }

  /**
   * Autocorrelation-based pitch detection (McLeod Pitch Method lite).
   * Returns dominant frequency in Hz or null.
   * Enhanced with parabolic interpolation for sub-sample accuracy.
   */
  function detectPitch(buf, sampleRate) {
    const n = buf.length;
    const corr = new Float32Array(n);

    for (let lag = 0; lag < n; lag++) {
      let sum = 0;
      for (let i = 0; i < n - lag; i++) {
        sum += buf[i] * buf[i + lag];
      }
      corr[lag] = sum;
    }

    // Find first peak after initial dip
    let d = 0;
    while (d < n && corr[d] > 0) d++;

    let maxCorr = -Infinity;
    let maxLag   = -1;
    const minLag = Math.floor(sampleRate / MAX_FREQ);
    const maxLag_  = Math.ceil(sampleRate / MIN_FREQ);

    for (let lag = Math.max(d, minLag); lag <= Math.min(n - 1, maxLag_); lag++) {
      if (corr[lag] > maxCorr) {
        maxCorr = corr[lag];
        maxLag  = lag;
      }
    }

    if (maxLag < 0 || maxCorr < corr[0] * 0.1) return null;

    // Parabolic interpolation for sub-sample accuracy
    let refinedLag = maxLag;
    if (maxLag > 0 && maxLag < n - 1) {
      const a = corr[maxLag - 1];
      const b = corr[maxLag];
      const c = corr[maxLag + 1];
      if (b > 0) {
        refinedLag = maxLag + 0.5 * (c - a) / (2 * b - a - c);
      }
    }

    return sampleRate / refinedLag;
  }

  /**
   * Analyse an AudioBuffer frame by frame, return array of detected notes.
   * Each note: { note, startSec, endSec, velocityRaw, frequency }
   */
  function analyseBuffer(audioBuffer, onProgress) {
    const data       = audioBuffer.getChannelData(0); // mono/left
    const sampleRate = audioBuffer.sampleRate;
    const duration   = audioBuffer.duration;
    const totalFrames = Math.floor((data.length - FRAME_SIZE) / HOP_SIZE);

    const rawFrames = []; // { time, note, vel }

    for (let f = 0; f < totalFrames; f++) {
      const start = f * HOP_SIZE;
      const frame = data.slice(start, start + FRAME_SIZE);
      const vol   = rms(frame);

      if (vol < RMS_THRESH) {
        rawFrames.push({ time: start / sampleRate, note: null, vel: 0 });
        continue;
      }

      const freq = detectPitch(frame, sampleRate);
      const note = freqToMidi(freq);
      rawFrames.push({ time: start / sampleRate, note, vel: Math.min(1, vol * 6) });

      if (onProgress && f % 200 === 0) {
        onProgress(f / totalFrames);
      }
    }

    // ── Merge consecutive identical notes → note events ──
    // Add smoothing: merge notes within semitone if gap is small
    const notes = [];
    let current = null;

    rawFrames.forEach((fr, i) => {
      if (fr.note !== null) {
        // Check if this note should continue the current note (same or very close)
        const isSameNote = current && current.note === fr.note;
        const isSimilarNote = current && Math.abs(current.note - fr.note) <= 1 && (fr.time - current.endSec) < 0.15;

        if (!current || (!isSameNote && !isSimilarNote)) {
          if (current) {
            current.endSec = fr.time;
            notes.push(current);
          }
          current = { note: fr.note, startSec: fr.time, endSec: fr.time, velSum: fr.vel, velCount: 1 };
        } else {
          // Merge with current note
          if (fr.note !== current.note) {
            // Smooth note transition by averaging nearby notes
            current.note = Math.round((current.note * current.velCount + fr.note * fr.vel) / (current.velCount + fr.vel));
          }
          current.velSum  += fr.vel;
          current.velCount++;
          current.endSec   = fr.time;
        }
      } else {
        if (current) {
          current.endSec = fr.time;
          notes.push(current);
          current = null;
        }
      }
    });
    if (current) notes.push(current);

    // Filter out very short noise blips (< 60 ms) and very quiet notes
    const filtered = notes.filter(n => {
      const duration = n.endSec - n.startSec;
      const avgVel = n.velSum / n.velCount;
      return duration > 0.06 && avgVel > 0.05;
    });

    // ── Convert to MIDI-like structure ──────────────────
    const BPM       = 120;
    const TPB       = 480; // ticks per beat
    const secPerBeat = 60 / BPM;
    const secPerTick = secPerBeat / TPB;

    const midiNotes = filtered.map(n => {
      const velocity   = Math.round((n.velSum / n.velCount) * 127);
      const startTick  = Math.round(n.startSec / secPerTick);
      const endTick    = Math.round(n.endSec   / secPerTick);
      const durationSec = n.endSec - n.startSec;
      return {
        note:         n.note,
        channel:      0,
        velocity:     Math.max(20, Math.min(127, velocity)),
        startTick,
        endTick,
        durationTicks: endTick - startTick,
        durationSec,
        trackIdx:     0,
        trackName:    'Audio Track',
        bpm:          BPM,
      };
    });

    const maxTick       = midiNotes.length ? Math.max(...midiNotes.map(n => n.endTick)) : 0;
    const uniquePitches = [...new Set(midiNotes.map(n => n.note))].sort((a, b) => a - b);

    return {
      header: { format: 0, ntracks: 1, division: TPB },
      tracks: [{
        index: 0,
        name: 'Audio Track',
        noteCount: midiNotes.length,
        notes: midiNotes,
        minNote: uniquePitches[0] || 0,
        maxNote: uniquePitches[uniquePitches.length - 1] || 127,
        avgVelocity: midiNotes.length
          ? midiNotes.reduce((a, b) => a + b.velocity, 0) / midiNotes.length : 0,
      }],
      notes:        midiNotes,
      bpm:          BPM,
      totalNotes:   midiNotes.length,
      maxTick,
      uniquePitches,
      duration,
      sourceType:   'audio',
    };
  }

  /**
   * Public API: convert an ArrayBuffer (audio file) to MIDI-like data.
   * Returns a Promise resolving with the data object.
   */
  async function convert(arrayBuffer, onProgress) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    let audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    // Trim to first MAX_DURATION_SEC seconds
    if (audioBuffer.duration > MAX_DURATION_SEC) {
      const trimmedLength = Math.floor(audioBuffer.sampleRate * MAX_DURATION_SEC);
      const trimmed = ctx.createBuffer(
        audioBuffer.numberOfChannels,
        trimmedLength,
        audioBuffer.sampleRate
      );
      for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        const src = audioBuffer.getChannelData(ch);
        const dst = trimmed.getChannelData(ch);
        dst.set(src.subarray(0, trimmedLength));
      }
      audioBuffer = trimmed;
    }

    await ctx.close();
    return analyseBuffer(audioBuffer, onProgress);
  }

  return { convert };
})();
