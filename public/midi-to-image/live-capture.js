/**
 * live-capture.js
 * Builds MIDI-like note data from live browser audio input.
 */

const LiveCapture = (() => {
  const STORAGE_KEY = 'midi-to-image-live-capture-v1';
  const FRAME_SIZE = 2048;
  const MIN_NOTE = 36;
  const MAX_NOTE = 96;
  const MIN_FREQ = 65.41;
  const MAX_FREQ = 2093;
  const RMS_THRESH = 0.012;
  const FRAME_INTERVAL_MS = 55;
  const RENDER_INTERVAL_MS = 1400;
  const STORE_INTERVAL_MS = 3000;
  const MAX_CAPTURE_SECONDS = 180;
  const MAX_NOTES = 2400;
  const BPM = 120;
  const TPB = 480;

  let audioContext = null;
  let analyser = null;
  let sourceNode = null;
  let mediaStream = null;
  let rafId = null;
  let frameBuffer = null;
  let isCapturing = false;
  let startedAt = 0;
  let lastFrameAt = 0;
  let lastRenderAt = 0;
  let lastStoreAt = 0;
  let notes = [];
  let currentNote = null;
  let captureMode = 'mic';

  const dom = {};

  function init() {
    dom.source = document.getElementById('liveSource');
    dom.start = document.getElementById('liveStartBtn');
    dom.stop = document.getElementById('liveStopBtn');
    dom.save = document.getElementById('liveSaveMidiBtn');
    dom.restore = document.getElementById('liveRestoreBtn');
    dom.clear = document.getElementById('liveClearBtn');
    dom.status = document.getElementById('liveStatus');
    dom.stats = document.getElementById('liveCaptureStats');
    dom.meter = document.getElementById('liveMeterFill');

    if (!dom.start) return;

    dom.start.addEventListener('click', () => start(dom.source?.value || 'mic'));
    dom.stop.addEventListener('click', stop);
    dom.save.addEventListener('click', saveMidi);
    dom.restore.addEventListener('click', restoreLastCapture);
    dom.clear.addEventListener('click', clearCapture);

    updateControls();
    renderStats();
  }

  async function start(mode = 'mic') {
    if (isCapturing) return;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext || !navigator.mediaDevices) {
      setStatus('Live capture is not supported in this browser.');
      return;
    }

    try {
      captureMode = mode;
      setStatus('Waiting for audio permission...');

      mediaStream = captureMode === 'tab'
        ? await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        })
        : await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
          },
        });

      if (mediaStream.getAudioTracks().length === 0) {
        releaseStream();
        setStatus('No audio track was shared.');
        return;
      }

      audioContext = new AudioContext();
      await audioContext.resume();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = FRAME_SIZE;
      analyser.smoothingTimeConstant = 0;
      frameBuffer = new Float32Array(analyser.fftSize);

      sourceNode = audioContext.createMediaStreamSource(mediaStream);
      sourceNode.connect(analyser);

      notes = [];
      currentNote = null;
      startedAt = performance.now();
      lastFrameAt = 0;
      lastRenderAt = 0;
      lastStoreAt = 0;
      isCapturing = true;

      mediaStream.getTracks().forEach(track => {
        track.addEventListener('ended', () => {
          if (isCapturing) stop();
        }, { once: true });
      });

      updateControls();
      setStatus(captureMode === 'tab' ? 'Listening to shared audio...' : 'Listening to microphone...');
      rafId = requestAnimationFrame(tick);
    } catch (error) {
      console.error('[LiveCapture] Unable to start:', error);
      setStatus(error?.name === 'NotAllowedError'
        ? 'Audio permission was cancelled.'
        : `Could not start live capture: ${error.message}`);
      await cleanup();
    }
  }

  async function stop() {
    if (!isCapturing) return;

    isCapturing = false;
    const elapsed = elapsedSeconds();
    finishCurrentNote(elapsed);
    pushUpdate({ final: true });
    persistCapture();
    await cleanup();
    updateControls();
    setStatus(`Capture stopped. ${notes.length} notes ready.`);
  }

  async function cleanup() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (sourceNode) {
      try { sourceNode.disconnect(); } catch (_) {}
      sourceNode = null;
    }
    analyser = null;
    releaseStream();
    if (audioContext) {
      const ctx = audioContext;
      audioContext = null;
      if (ctx.state !== 'closed') {
        await ctx.close().catch(() => {});
      }
    }
    if (dom.meter) dom.meter.style.width = '0%';
  }

  function releaseStream() {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }
  }

  function tick(now) {
    if (!isCapturing || !analyser) return;

    if (now - startedAt > MAX_CAPTURE_SECONDS * 1000) {
      stop();
      return;
    }

    if (now - lastFrameAt >= FRAME_INTERVAL_MS) {
      analyseFrame(now);
      lastFrameAt = now;
    }

    if (now - lastRenderAt >= RENDER_INTERVAL_MS) {
      pushUpdate({ silent: true });
      lastRenderAt = now;
    }

    if (now - lastStoreAt >= STORE_INTERVAL_MS) {
      persistCapture();
      lastStoreAt = now;
    }

    rafId = requestAnimationFrame(tick);
  }

  function analyseFrame(now) {
    analyser.getFloatTimeDomainData(frameBuffer);
    const volume = rms(frameBuffer);
    updateMeter(volume);

    const timeSec = (now - startedAt) / 1000;
    if (volume < RMS_THRESH) {
      finishCurrentNote(timeSec);
      renderStats();
      return;
    }

    const freq = detectPitch(frameBuffer, audioContext.sampleRate);
    const midiNote = freqToMidi(freq);
    if (!midiNote) {
      finishCurrentNote(timeSec);
      renderStats();
      return;
    }

    const velocity = Math.max(18, Math.min(127, Math.round(volume * 850)));
    extendOrStartNote(midiNote, velocity, freq, timeSec);
    renderStats();
  }

  function extendOrStartNote(note, velocity, freq, timeSec) {
    const canContinue = currentNote
      && Math.abs(currentNote.note - note) <= 1
      && timeSec - currentNote.endSec < 0.18;

    if (!canContinue) {
      finishCurrentNote(timeSec);
      currentNote = {
        note,
        startSec: timeSec,
        endSec: timeSec,
        velocitySum: velocity,
        velocityCount: 1,
        freqSum: freq || 0,
      };
      return;
    }

    const count = currentNote.velocityCount + 1;
    currentNote.note = Math.round((currentNote.note * currentNote.velocityCount + note) / count);
    currentNote.endSec = timeSec;
    currentNote.velocitySum += velocity;
    currentNote.velocityCount = count;
    currentNote.freqSum += freq || 0;
  }

  function finishCurrentNote(endSec) {
    if (!currentNote) return;

    currentNote.endSec = Math.max(currentNote.endSec, endSec);
    const note = buildMidiNote(currentNote);
    currentNote = null;

    if (!note || note.durationSec < 0.07 || note.velocity < 20) return;

    notes.push(note);
    if (notes.length > MAX_NOTES) {
      notes = notes.slice(notes.length - MAX_NOTES);
      rebaseNotes(notes[0]?.startSec || 0);
    }
  }

  function buildMidiNote(raw) {
    const velocity = Math.round(raw.velocitySum / Math.max(1, raw.velocityCount));
    const startSec = Math.max(0, raw.startSec);
    const endSec = Math.max(startSec + 0.04, raw.endSec);
    const startTick = secondsToTicks(startSec);
    const endTick = Math.max(startTick + 1, secondsToTicks(endSec));

    return {
      note: Math.max(MIN_NOTE, Math.min(MAX_NOTE, raw.note)),
      channel: 0,
      velocity: Math.max(1, Math.min(127, velocity)),
      startTick,
      endTick,
      durationTicks: endTick - startTick,
      startSec,
      endSec,
      durationSec: endSec - startSec,
      frequency: raw.freqSum / Math.max(1, raw.velocityCount),
      trackIdx: 0,
      trackName: getTrackName(),
      bpm: BPM,
    };
  }

  function makeMidiData(includeCurrent = true) {
    const activeNote = includeCurrent && currentNote ? buildMidiNote(currentNote) : null;
    const allNotes = activeNote ? notes.concat(activeNote) : notes.slice();
    const maxTick = allNotes.length ? Math.max(...allNotes.map(note => note.endTick)) : 0;
    const duration = allNotes.length ? Math.max(...allNotes.map(note => note.endSec || 0)) : elapsedSeconds();
    const uniquePitches = [...new Set(allNotes.map(note => note.note))].sort((a, b) => a - b);
    const avgVelocity = allNotes.length
      ? allNotes.reduce((sum, note) => sum + note.velocity, 0) / allNotes.length
      : 0;

    return {
      name: 'Live Capture',
      header: { format: 0, ntracks: 1, division: TPB },
      tracks: [{
        index: 0,
        name: getTrackName(),
        noteCount: allNotes.length,
        notes: allNotes,
        minNote: uniquePitches[0] || 0,
        maxNote: uniquePitches[uniquePitches.length - 1] || 127,
        avgVelocity,
      }],
      notes: allNotes,
      bpm: BPM,
      totalNotes: allNotes.length,
      maxTick,
      uniquePitches,
      duration,
      sourceType: 'live',
      captureMode,
      updatedAt: Date.now(),
    };
  }

  function pushUpdate(options = {}) {
    const data = makeMidiData(true);
    if (window.updateLiveMidiCapture) {
      window.updateLiveMidiCapture(data, options);
    }
  }

  function persistCapture() {
    const data = makeMidiData(false);
    if (!data.notes.length) return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        savedAt: Date.now(),
        data,
      }));
    } catch (error) {
      console.warn('[LiveCapture] Unable to persist capture:', error);
    }
  }

  function restoreLastCapture() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setStatus('No saved live capture found.');
        return;
      }

      const saved = JSON.parse(raw);
      const data = saved.data;
      if (!data?.notes?.length) {
        setStatus('Saved live capture is empty.');
        return;
      }

      notes = data.notes;
      currentNote = null;
      captureMode = data.captureMode || 'mic';
      if (dom.source) dom.source.value = captureMode;
      if (window.updateLiveMidiCapture) {
        window.updateLiveMidiCapture(data, { final: true });
      }
      renderStats(data);
      setStatus(`Restored ${data.notes.length} notes from browser storage.`);
    } catch (error) {
      console.error('[LiveCapture] Restore failed:', error);
      setStatus('Could not restore the saved live capture.');
    }
  }

  function clearCapture() {
    notes = [];
    currentNote = null;
    localStorage.removeItem(STORAGE_KEY);
    renderStats();
    if (dom.meter) dom.meter.style.width = '0%';
    setStatus('Live capture cleared.');
  }

  function saveMidi() {
    const data = makeMidiData(false);
    if (!data.notes.length) {
      setStatus('No notes to save yet.');
      return;
    }

    const blob = writeMidiBlob(data);
    const filename = `live-capture-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.mid`;
    downloadBlob(blob, filename);
    persistCapture();
    setStatus(`Saved ${data.notes.length} notes as MIDI.`);

    if (window.memory?.logExport) {
      window.memory.logExport('live-midi', {
        noteCount: data.notes.length,
        duration: data.duration,
      });
    }
  }

  function writeMidiBlob(data) {
    const bytes = [];
    const track = [];
    const tempo = Math.round(60000000 / (data.bpm || BPM));

    writeVarLen(track, 0);
    track.push(0xff, 0x51, 0x03, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff);

    const events = [];
    (data.notes || []).forEach(note => {
      const channel = Math.max(0, Math.min(15, note.channel || 0));
      const pitch = Math.max(0, Math.min(127, note.note || 60));
      const velocity = Math.max(1, Math.min(127, note.velocity || 64));
      const startTick = Math.max(0, Math.round(note.startTick || 0));
      const endTick = Math.max(startTick + 1, Math.round(note.endTick || startTick + note.durationTicks || startTick + TPB / 4));

      events.push({ tick: startTick, order: 0, bytes: [0x90 | channel, pitch, velocity] });
      events.push({ tick: endTick, order: 1, bytes: [0x80 | channel, pitch, 0] });
    });

    events.sort((a, b) => (a.tick - b.tick) || (a.order - b.order));

    let cursor = 0;
    events.forEach(event => {
      writeVarLen(track, Math.max(0, event.tick - cursor));
      track.push(...event.bytes);
      cursor = event.tick;
    });

    writeVarLen(track, 0);
    track.push(0xff, 0x2f, 0x00);

    writeAscii(bytes, 'MThd');
    writeUInt32(bytes, 6);
    writeUInt16(bytes, 0);
    writeUInt16(bytes, 1);
    writeUInt16(bytes, TPB);
    writeAscii(bytes, 'MTrk');
    writeUInt32(bytes, track.length);
    bytes.push(...track);

    return new Blob([new Uint8Array(bytes)], { type: 'audio/midi' });
  }

  function writeAscii(target, text) {
    for (let i = 0; i < text.length; i++) {
      target.push(text.charCodeAt(i) & 0xff);
    }
  }

  function writeUInt16(target, value) {
    target.push((value >> 8) & 0xff, value & 0xff);
  }

  function writeUInt32(target, value) {
    target.push((value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
  }

  function writeVarLen(target, value) {
    let buffer = value & 0x7f;
    while ((value >>= 7)) {
      buffer <<= 8;
      buffer |= ((value & 0x7f) | 0x80);
    }

    while (true) {
      target.push(buffer & 0xff);
      if (buffer & 0x80) buffer >>= 8;
      else break;
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

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

    let d = 0;
    while (d < n && corr[d] > 0) d++;

    let maxCorr = -Infinity;
    let bestLag = -1;
    const minLag = Math.floor(sampleRate / MAX_FREQ);
    const maxLag = Math.ceil(sampleRate / MIN_FREQ);

    for (let lag = Math.max(d, minLag); lag <= Math.min(n - 1, maxLag); lag++) {
      if (corr[lag] > maxCorr) {
        maxCorr = corr[lag];
        bestLag = lag;
      }
    }

    if (bestLag < 0 || maxCorr < corr[0] * 0.1) return null;

    let refinedLag = bestLag;
    if (bestLag > 0 && bestLag < n - 1) {
      const a = corr[bestLag - 1];
      const b = corr[bestLag];
      const c = corr[bestLag + 1];
      if (b > 0) {
        refinedLag = bestLag + 0.5 * (c - a) / (2 * b - a - c);
      }
    }

    return sampleRate / refinedLag;
  }

  function freqToMidi(freq) {
    if (!freq || freq <= 0) return null;
    const midi = Math.round(12 * Math.log2(freq / 440) + 69);
    return midi >= MIN_NOTE && midi <= MAX_NOTE ? midi : null;
  }

  function rms(buf) {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      sum += buf[i] * buf[i];
    }
    return Math.sqrt(sum / buf.length);
  }

  function secondsToTicks(seconds) {
    return Math.round(seconds * TPB / (60 / BPM));
  }

  function elapsedSeconds() {
    if (!startedAt) return 0;
    return Math.max(0, (performance.now() - startedAt) / 1000);
  }

  function rebaseNotes(offsetSec) {
    notes = notes.map(note => {
      const startSec = Math.max(0, note.startSec - offsetSec);
      const endSec = Math.max(startSec + 0.04, note.endSec - offsetSec);
      const startTick = secondsToTicks(startSec);
      const endTick = Math.max(startTick + 1, secondsToTicks(endSec));
      return {
        ...note,
        startSec,
        endSec,
        startTick,
        endTick,
        durationSec: endSec - startSec,
        durationTicks: endTick - startTick,
      };
    });
    startedAt = performance.now() - (notes.at(-1)?.endSec || 0) * 1000;
  }

  function updateControls() {
    if (dom.start) dom.start.disabled = isCapturing;
    if (dom.stop) dom.stop.disabled = !isCapturing;
    if (dom.source) dom.source.disabled = isCapturing;
    if (dom.save) dom.save.disabled = isCapturing || notes.length === 0;
  }

  function renderStats(data = makeMidiData(true)) {
    updateControls();
    if (!dom.stats) return;

    const last = data.notes?.at(-1);
    const lastNote = last ? midiNoteName(last.note) : '--';
    dom.stats.innerHTML = [
      stat('Notes', data.notes?.length || 0),
      stat('Duration', `${(data.duration || 0).toFixed(1)}s`),
      stat('Last', lastNote),
      stat('Input', captureMode === 'tab' ? 'Tab' : 'Mic'),
    ].join('');
  }

  function stat(label, value) {
    return `<div class="stat-badge">${label}: <span>${value}</span></div>`;
  }

  function midiNoteName(note) {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return `${names[note % 12]}${Math.floor(note / 12 - 1)}`;
  }

  function updateMeter(volume) {
    if (!dom.meter) return;
    const level = Math.max(0, Math.min(100, Math.round(volume * 1500)));
    dom.meter.style.width = `${level}%`;
  }

  function setStatus(message) {
    if (dom.status) dom.status.textContent = message;
  }

  function getTrackName() {
    return captureMode === 'tab' ? 'Shared Audio Capture' : 'Microphone Capture';
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    start,
    stop,
    restoreLastCapture,
    clearCapture,
    saveMidi,
    makeMidiData,
    writeMidiBlob,
  };
})();
