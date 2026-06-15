/**
 * spotify-converter.js
 * Handles conversion of Spotify songs to MIDI and then to ASCII art
 */

let spotifyConversionInProgress = false;
let currentConversionSongs = [];

/**
 * Convert selected Spotify songs to ASCII art
 */
async function convertSpotifySongsToAsciiArt(songs) {
  if (spotifyConversionInProgress) {
    alert('Conversion already in progress...');
    return;
  }

  if (!songs || songs.length === 0) {
    alert('No songs to convert');
    return;
  }

  spotifyConversionInProgress = true;
  currentConversionSongs = songs;

  try {
    // Step 1: Show the main app
    showMainApp();

    // Step 2: For each song, get preview and convert
    for (let i = 0; i < songs.length; i++) {
      const song = songs[i];
      console.log(`[${i + 1}/${songs.length}] Processing: ${song.name}`);

      await processSpotifySongToAsciiArt(song);

      // Add delay between processing to avoid rate limiting
      if (i < songs.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('✅ All songs processed!');
    if (window.showToast) {
      window.showToast(`✓ Generated art from ${songs.length} Spotify song(s)`, 'success');
    } else {
      alert(`✅ Converted ${songs.length} song(s) to ASCII art!`);
    }
  } catch (err) {
    console.error('❌ Conversion failed:', err);
    alert('Error during conversion: ' + err.message);
  } finally {
    spotifyConversionInProgress = false;
  }
}

/**
 * Process a single Spotify song to ASCII art
 */
async function processSpotifySongToAsciiArt(song) {
  try {
    // Spotify gives us rich track/audio-feature metadata here. We map those
    // details into MIDI-like notes, then let app.js run the normal render path.
    const syntheticMidi = generateSyntheticMidiFromSong(song);

    if (window.loadMidiDataFromSpotify) {
      window.loadMidiDataFromSpotify(syntheticMidi, song.name);
    } else if (window.setMidiData) {
      window.setMidiData(syntheticMidi);
      if (window.generateAsciiArt) window.generateAsciiArt();
      if (window.generateP5Visualization) window.generateP5Visualization();
    }

    return true;
  } catch (err) {
    console.error(`Failed to process song: ${song.name}`, err);
    throw err;
  }
}

/**
 * Generate synthetic MIDI data from song metadata
 * This creates an artistic representation based on popularity, duration, etc.
 */
function generateSyntheticMidiFromSong(song) {
  const midiNotes = [];

  const features = song.audioFeatures || {};
  const popularity = song.popularity ?? 50;
  const tempo = features.tempo || 120;
  const energy = features.energy ?? (popularity / 100);
  const danceability = features.danceability ?? 0.5;
  const valence = features.valence ?? 0.5;
  const acousticness = features.acousticness ?? 0.35;
  const speechiness = features.speechiness ?? 0.08;
  const instrumentalness = features.instrumentalness ?? 0.1;
  const loudness = features.loudness ?? -10;

  // Create a melody based on song characteristics
  const baseNote = Math.max(36, Math.min(84, 45 + Math.round(valence * 18) + Math.round((popularity / 100) * 12)));
  const sourceDuration = song.duration || 180000; // Default 3 minutes
  const renderDuration = Math.min(20, Math.max(8, sourceDuration / 1000));
  const patternLength = Math.max(16, Math.min(56, Math.round((tempo / 120) * 24 + danceability * 12)));
  const noteDuration = renderDuration / patternLength;
  const tpb = 480;
  const secondsPerBeat = 60 / tempo;
  const secondsPerTick = secondsPerBeat / tpb;
  const scale = valence >= 0.5
    ? [0, 2, 4, 5, 7, 9, 11, 12]
    : [0, 2, 3, 5, 7, 8, 10, 12];

  // Generate notes based on song name hash for uniqueness
  const artistText = Array.isArray(song.artists)
    ? song.artists.map(a => a.name || a).join(', ')
    : (song.artists || '');
  const hash = hashString(`${song.name}-${artistText}-${song.id || ''}`);
  const pattern = generatePattern(hash, patternLength);

  pattern.forEach((offset, index) => {
    const phrase = index / Math.max(1, patternLength - 1);
    const scaleOffset = scale[offset % scale.length];
    const octaveLift = Math.floor(offset / scale.length) * 12;
    const motionOffset = scaleOffset + octaveLift + Math.round(Math.sin(phrase * Math.PI * 2) * danceability * 5);
    const note = Math.max(36, Math.min(96, baseNote + motionOffset - Math.round(acousticness * 5)));
    const startSec = index * noteDuration;
    const durationSec = Math.max(0.08, noteDuration * (0.45 + energy * 0.45 + instrumentalness * 0.2));
    const startTick = Math.round(startSec / secondsPerTick);
    const endTick = Math.round((startSec + durationSec) / secondsPerTick);
    const accent = index % Math.max(2, Math.round(8 - danceability * 4)) === 0 ? 12 : 0;
    const loudnessBoost = Math.max(0, Math.min(20, loudness + 24));

    midiNotes.push({
      note,
      channel: 0,
      velocity: Math.max(24, Math.min(127, Math.round(34 + energy * 58 + loudnessBoost + accent - speechiness * 10))),
      startTick,
      endTick,
      durationTicks: Math.max(1, endTick - startTick),
      startSec,
      endSec: startSec + durationSec,
      durationSec,
      trackIdx: 0,
      trackName: 'Spotify Audio Details',
      bpm: tempo,
    });
  });

  const maxTick = midiNotes.length ? Math.max(...midiNotes.map(n => n.endTick)) : 0;
  const uniquePitches = [...new Set(midiNotes.map(n => n.note))].sort((a, b) => a - b);
  const avgVelocity = midiNotes.length
    ? midiNotes.reduce((sum, note) => sum + note.velocity, 0) / midiNotes.length
    : 0;

  return {
    name: song.name,
    header: { format: 0, ntracks: 1, division: tpb },
    tracks: [{
      index: 0,
      name: 'Spotify Audio Details',
      noteCount: midiNotes.length,
      notes: midiNotes,
      minNote: uniquePitches[0] || 0,
      maxNote: uniquePitches[uniquePitches.length - 1] || 127,
      avgVelocity,
    }],
    notes: midiNotes,
    bpm: Math.round(tempo),
    totalNotes: midiNotes.length,
    maxTick,
    uniquePitches,
    duration: renderDuration,
    sourceType: 'spotify',
    spotifyTrack: {
      id: song.id,
      name: song.name,
      artists: artistText,
      duration: sourceDuration,
      popularity,
      audioFeatures: features,
    },
  };
}

/**
 * Simple hash function for consistency
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Generate a pattern of note offsets
 */
function generatePattern(seed, length) {
  const pattern = [];
  let random = seed;

  for (let i = 0; i < length; i++) {
    random = (random * 9301 + 49297) % 233280; // Linear congruential generator
    const offset = Math.floor((random / 233280) * 12); // 0-11 semitones (octave)
    pattern.push(offset);
  }

  return pattern;
}

/**
 * Alternative: Use Spotify preview URL if available
 * This would require server-side audio processing
 */
async function downloadAndAnalyzePreview(previewUrl, songName) {
  if (!previewUrl) {
    console.warn(`No preview available for ${songName}`);
    return null;
  }

  try {
    // This would require a backend service to analyze audio
    // For now, we'll just generate synthetic data
    console.log(`Would download preview: ${previewUrl}`);
    return null;
  } catch (err) {
    console.error(`Failed to download preview for ${songName}:`, err);
    return null;
  }
}

// Export for use in other modules
window.convertSpotifySongsToAsciiArt = convertSpotifySongsToAsciiArt;
window.processSpotifySongToAsciiArt = processSpotifySongToAsciiArt;
