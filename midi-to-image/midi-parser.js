/**
 * midi-parser.js
 * Pure JS MIDI binary parser — no dependencies.
 * Returns a structured object from a MIDI ArrayBuffer.
 */

const MidiParser = (() => {
  function readUint16(buf, offset) {
    return (buf[offset] << 8) | buf[offset + 1];
  }
  function readUint32(buf, offset) {
    return ((buf[offset] << 24) | (buf[offset+1] << 16) | (buf[offset+2] << 8) | buf[offset+3]) >>> 0;
  }
  function readVarLen(buf, offset) {
    let value = 0, bytesRead = 0;
    let byte;
    do {
      byte = buf[offset + bytesRead];
      value = (value << 7) | (byte & 0x7f);
      bytesRead++;
    } while (byte & 0x80);
    return { value, bytesRead };
  }

  function parseHeader(buf) {
    const tag = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
    if (tag !== 'MThd') throw new Error('Not a valid MIDI file (missing MThd)');
    const length  = readUint32(buf, 4);
    const format  = readUint16(buf, 8);
    const ntracks = readUint16(buf, 10);
    const division= readUint16(buf, 12);
    return { format, ntracks, division, headerLength: 8 + length };
  }

  function parseTrack(buf, startOffset) {
    const tag = String.fromCharCode(buf[startOffset], buf[startOffset+1], buf[startOffset+2], buf[startOffset+3]);
    if (tag !== 'MTrk') throw new Error('Expected MTrk at offset ' + startOffset);
    const length = readUint32(buf, startOffset + 4);
    const end = startOffset + 8 + length;

    const events = [];
    let offset = startOffset + 8;
    let runningStatus = 0;
    let absoluteTick = 0;

    while (offset < end) {
      const deltaResult = readVarLen(buf, offset);
      offset += deltaResult.bytesRead;
      absoluteTick += deltaResult.value;

      let statusByte = buf[offset];
      if (statusByte & 0x80) {
        runningStatus = statusByte;
        offset++;
      } else {
        statusByte = runningStatus;
      }

      const type = (statusByte >> 4) & 0xf;
      const channel = statusByte & 0xf;

      let event = { tick: absoluteTick, delta: deltaResult.value, type, channel, raw: statusByte };

      // Meta event
      if (statusByte === 0xff) {
        const metaType = buf[offset++];
        const lenResult = readVarLen(buf, offset);
        offset += lenResult.bytesRead;
        const metaData = buf.slice(offset, offset + lenResult.value);
        offset += lenResult.value;

        event.eventType = 'meta';
        event.metaType = metaType;

        if (metaType === 0x51) {
          // Tempo
          event.tempo = (metaData[0] << 16) | (metaData[1] << 8) | metaData[2];
        } else if (metaType === 0x03) {
          event.text = String.fromCharCode(...metaData);
          event.trackName = event.text;
        } else if (metaType === 0x01) {
          event.text = String.fromCharCode(...metaData);
        } else if (metaType === 0x2f) {
          event.endOfTrack = true;
        }
        events.push(event);
        continue;
      }

      // SysEx
      if (statusByte === 0xf0 || statusByte === 0xf7) {
        const lenResult = readVarLen(buf, offset);
        offset += lenResult.bytesRead + lenResult.value;
        event.eventType = 'sysex';
        events.push(event);
        continue;
      }

      // MIDI events
      event.eventType = 'midi';
      switch (type) {
        case 0x8: // Note Off
          event.subtype = 'noteOff';
          event.note    = buf[offset++];
          event.velocity= buf[offset++];
          break;
        case 0x9: // Note On
          event.subtype  = buf[offset+1] > 0 ? 'noteOn' : 'noteOff';
          event.note     = buf[offset++];
          event.velocity = buf[offset++];
          break;
        case 0xa: // Aftertouch
          event.subtype = 'aftertouch';
          event.note    = buf[offset++];
          event.pressure= buf[offset++];
          break;
        case 0xb: // Control Change
          event.subtype    = 'controlChange';
          event.controller = buf[offset++];
          event.value      = buf[offset++];
          break;
        case 0xc: // Program Change
          event.subtype  = 'programChange';
          event.program  = buf[offset++];
          break;
        case 0xd: // Channel Pressure
          event.subtype  = 'channelPressure';
          event.pressure = buf[offset++];
          break;
        case 0xe: // Pitch Bend
          const lsb = buf[offset++];
          const msb = buf[offset++];
          event.subtype    = 'pitchBend';
          event.pitchBend  = ((msb << 7) | lsb) - 8192;
          break;
        default:
          // Unknown — skip 1 byte
          offset++;
          break;
      }
      events.push(event);
    }
    return { events, byteLength: 8 + length };
  }

  function parse(arrayBuffer) {
    const buf = new Uint8Array(arrayBuffer);
    const header = parseHeader(buf);
    const tracks = [];
    let offset = header.headerLength;

    for (let i = 0; i < header.ntracks; i++) {
      if (offset >= buf.length) break;
      const track = parseTrack(buf, offset);
      tracks.push(track);
      offset += track.byteLength;
    }

    // Collect notes (noteOn + noteOff pairs)
    const notes = [];
    const pendingNotes = {};

    let globalTempo = 500000; // default 120 BPM
    const division = header.division;

    tracks.forEach((track, trackIdx) => {
      let trackName = `Track ${trackIdx + 1}`;
      const activeNotes = {};

      track.events.forEach(evt => {
        if (evt.eventType === 'meta' && evt.metaType === 0x51) globalTempo = evt.tempo;
        if (evt.eventType === 'meta' && evt.trackName) trackName = evt.trackName;

        if (evt.eventType === 'midi') {
          if (evt.subtype === 'noteOn') {
            const key = `${trackIdx}-${evt.channel}-${evt.note}`;
            activeNotes[key] = { ...evt, trackIdx, trackName };
          } else if (evt.subtype === 'noteOff') {
            const key = `${trackIdx}-${evt.channel}-${evt.note}`;
            if (activeNotes[key]) {
              const start = activeNotes[key];
              const durationTicks = evt.tick - start.tick;
              const bpm = 60000000 / globalTempo;
              const ticksPerBeat = division & 0x8000 ? 480 : division;
              const durationSec = (durationTicks / ticksPerBeat) * (60 / bpm);

              notes.push({
                note:      start.note,
                channel:   start.channel,
                velocity:  start.velocity,
                startTick: start.tick,
                endTick:   evt.tick,
                durationTicks,
                durationSec,
                trackIdx,
                trackName,
                bpm,
              });
              delete activeNotes[key];
            }
          }
        }
      });
    });

    // Summarize per track
    const trackSummaries = tracks.map((track, i) => {
      const trackNotes = notes.filter(n => n.trackIdx === i);
      const name = track.events.find(e => e.trackName)?.trackName || `Track ${i + 1}`;
      return {
        index: i,
        name,
        noteCount: trackNotes.length,
        notes: trackNotes,
        minNote: trackNotes.length ? Math.min(...trackNotes.map(n => n.note)) : 0,
        maxNote: trackNotes.length ? Math.max(...trackNotes.map(n => n.note)) : 127,
        avgVelocity: trackNotes.length
          ? trackNotes.reduce((a, b) => a + b.velocity, 0) / trackNotes.length
          : 0,
      };
    }).filter(t => t.noteCount > 0);

    const maxTick = notes.length ? Math.max(...notes.map(n => n.endTick)) : 0;
    const bpm     = 60000000 / globalTempo;

    return {
      header,
      tracks: trackSummaries,
      notes,
      bpm: Math.round(bpm),
      totalNotes: notes.length,
      maxTick,
      uniquePitches: [...new Set(notes.map(n => n.note))].sort((a,b) => a-b),
    };
  }

  return { parse };
})();
