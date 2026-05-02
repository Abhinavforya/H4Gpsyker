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
    alert(`✅ Converted ${songs.length} song(s) to ASCII art!`);
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
    // For now, we'll create a synthetic audio representation
    // In a real scenario, you'd:
    // 1. Get the preview URL from Spotify
    // 2. Download and analyze the audio
    // 3. Convert to MIDI
    // 4. Generate ASCII art

    // Create a synthetic MIDI based on song characteristics
    const syntheticMidi = generateSyntheticMidiFromSong(song);

    if (window.setMidiData) {
      window.setMidiData(syntheticMidi);
    } else {
      window.midiData = syntheticMidi;
    }

    // Trigger ASCII art generation
    if (window.generateAsciiArt) {
      window.generateAsciiArt();
    }

    // Also trigger p5.js visualization
    if (window.generateP5Visualization) {
      window.generateP5Visualization();
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

  // Create a melody based on song characteristics
  const baseNote = 48 + Math.round((popularity / 100) * 24) + Math.round(valence * 6);
  const duration = song.duration || 180000; // Default 3 minutes
  const patternLength = Math.max(8, Math.min(32, Math.round((tempo / 120) * 16)));
  const noteDuration = (duration / 1000) / patternLength;

  // Generate notes based on song name hash for uniqueness
  const hash = hashString(song.name);
  const pattern = generatePattern(hash, patternLength);

  pattern.forEach((offset, index) => {
    const motionOffset = Math.round((offset - 6) * (0.5 + danceability));
    midiNotes.push({
      note: baseNote + motionOffset,
      time: index * noteDuration,
      duration: noteDuration * 0.9,
      velocity: Math.max(24, Math.min(127, Math.round(40 + energy * 60 + (index % 8) * 4)))
    });
  });

  return {
    name: song.name,
    tracks: [{
      notes: midiNotes
    }]
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
