// Lightweight processor: decode audio to waveform and map amplitude -> ASCII
export async function processFile(file){
  const name = (file && file.name) ? file.name.toLowerCase() : ''
  if(name.endsWith('.mid') || name.endsWith('.midi')){
    return await processMidiFile(file)
  }
  return await processAudioFile(file)
}

async function processAudioFile(file){
  const ab = await file.arrayBuffer()
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if(!AudioCtx) throw new Error('Web Audio API not supported')
  const ctx = new AudioCtx()
  const decoded = await ctx.decodeAudioData(ab.slice(0))
  const channel = decoded.numberOfChannels>0 ? decoded.getChannelData(0) : null
  if(!channel) throw new Error('No audio data')

  // build N columns across the audio buffer
  const cols = 80
  const samplesPerCol = Math.max(1, Math.floor(channel.length / cols))
  const amps = new Float32Array(cols)
  for(let c=0;c<cols;c++){
    let sum=0
    const start = c*samplesPerCol
    const end = Math.min(channel.length, start+samplesPerCol)
    for(let i=start;i<end;i++){
      const v = channel[i]
      sum += v*v
    }
    const rms = Math.sqrt(sum / (end-start))
    amps[c] = rms
  }

  // map amplitude to chars
  const charset = [' ','.',':','-','=','+','*','#','%','@']
  const lines = []
  const rows = 12
  for(let r=0;r<rows;r++){
    let line = ''
    for(let c=0;c<cols;c++){
      // introduce slight phase shift per row for texture
      const v = amps[(c + r*3) % cols]
      const idx = Math.min(charset.length-1, Math.floor(v * (charset.length*6)))
      line += charset[idx]
    }
    lines.push(line)
  }

  try{ ctx.close() }catch(e){}
  return lines.join('\n')
}

async function processMidiFile(file){
  // Simple fallback: read bytes and map to patterns. Not a full MIDI parser,
  // but it produces deterministic ASCII preview from file content.
  const ab = await file.arrayBuffer()
  const u8 = new Uint8Array(ab)
  const cols = 80
  const rows = 12
  const charset = [' ','.',':','-','=','+','*','#','%','@']
  const lines = []
  for(let r=0;r<rows;r++){
    let line = ''
    for(let c=0;c<cols;c++){
      const idx = u8[(r*cols + c) % u8.length] % charset.length
      line += charset[idx]
    }
    lines.push(line)
  }
  return lines.join('\n')
}
