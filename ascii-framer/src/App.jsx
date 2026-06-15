import React, {useEffect, useState, useRef} from 'react'
import AsciiArt from './AsciiArt'
import { getRecentSnapshots, saveSnapshot } from './db'
import { saveAudioUpload } from './audioUploadService'

export default function App(){
  const [input, setInput] = useState('H4G')
  const [mode, setMode] = useState('text')
  const [artOutput, setArtOutput] = useState('')
  const [processing, setProcessing] = useState(false)
  const [history, setHistory] = useState([])
  const [historyStatus, setHistoryStatus] = useState('Loading saved snapshots...')
  const [activeUpload, setActiveUpload] = useState(null)
  const [selectedSnapshot, setSelectedSnapshot] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function loadHistory() {
      try {
        const items = await getRecentSnapshots()
        if (!cancelled) {
          setHistory(items)
          setHistoryStatus(items.length ? 'Saved snapshots loaded.' : 'No saved snapshots yet.')
        }
      } catch (error) {
        if (!cancelled) {
          console.error('history load error', error)
          setHistoryStatus('Database unavailable in this browser.')
        }
      }
    }

    loadHistory()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleFiles(files){
    if(!files || files.length === 0) return
    const file = files[0]
    setProcessing(true)
    try{
      const savedUpload = await saveAudioUpload(file)
      setActiveUpload(savedUpload)
      setSelectedSnapshot(savedUpload)
      setInput(savedUpload.input)
      setArtOutput(savedUpload.generatedArt)
      setMode('text')
      await refreshHistory('Audio upload saved with generated art.')
    }catch(err){
      console.error('processing error', err)
      alert('File processing failed: '+ (err && err.message ? err.message : String(err)))
    }finally{
      setProcessing(false)
    }
  }

  function handleDrop(e){
    e.preventDefault()
    e.stopPropagation()
    const dt = e.dataTransfer
    if(dt && dt.files && dt.files.length) handleFiles(dt.files)
  }

  function handleDragOver(e){
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  async function persistSnapshot(snapshot) {
    try {
      await saveSnapshot(snapshot)
      await refreshHistory('Snapshot saved.')
    } catch (error) {
      console.error('snapshot save error', error)
      setHistoryStatus('Could not save to database.')
    }
  }

  async function refreshHistory(statusMessage) {
    const items = await getRecentSnapshots()
    setHistory(items)
    if (statusMessage) {
      setHistoryStatus(statusMessage)
    } else {
      setHistoryStatus(items.length ? 'Saved snapshots loaded.' : 'No saved snapshots yet.')
    }
  }

  function handleSaveSnapshot(){
    persistSnapshot({
      input,
      mode,
      label: `Manual ${mode} snapshot`,
      source: 'manual',
    })
  }

  function restoreSnapshot(snapshot) {
    if (!snapshot) return
    setSelectedSnapshot(snapshot)
    setInput(snapshot.input || '')
    setMode(snapshot.mode || 'text')
    setArtOutput(snapshot.generatedArt || '')
    setActiveUpload(snapshot.source === 'audio-upload' ? snapshot : null)
  }

  function viewSnapshot(snapshot) {
    restoreSnapshot(snapshot)
  }

  function downloadSnapshotAudio(snapshot) {
    const downloadUrl = snapshot?.audioUrl
    const sourceFile = snapshot?.audioFile
    if (!downloadUrl && !sourceFile) {
      alert('No saved audio file is available for this entry.')
      return
    }

    const link = document.createElement('a')
    if (downloadUrl) {
      link.href = downloadUrl
    } else {
      const objectUrl = URL.createObjectURL(sourceFile)
      link.href = objectUrl
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    }
    link.download = snapshot.fileName || 'audio-upload'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <div className="app-root">
      <header className="header">
        <h1>ASCII Framer — live ASCII animations</h1>
        <p className="sub">Paste text or upload audio/MIDI to generate animated ASCII</p>
      </header>

      <section className="controls">
        <div className="left-controls">
          <textarea value={input} onChange={e=>setInput(e.target.value)} rows={3} />
          <div className="buttons">
            <button onClick={()=>setInput(prev=>prev+' *')}>Append</button>
            <button onClick={()=>setInput(randomSeed())}>Random</button>
            <button onClick={handleSaveSnapshot}>Save Snapshot</button>
            <select value={mode} onChange={e=>setMode(e.target.value)}>
              <option value="text">Text</option>
              <option value="wave">Wave</option>
            </select>
          </div>
        </div>

        <div className="upload-panel">
          <div className="dropzone" onDrop={handleDrop} onDragOver={handleDragOver}>
            <div className="drop-content">
              <strong>Drop an audio file here (.mp3, .wav, .ogg, .m4a)</strong>
              <div className="muted">or <button onClick={()=>fileRef.current.click()}>choose a file</button></div>
              <input ref={fileRef} type="file" accept="audio/*,.mid,.midi" style={{display:'none'}} onChange={e=>handleFiles(e.target.files)} />
            </div>
          </div>
          <div className="status">{processing ? 'Processing...' : 'Ready'}</div>
          {activeUpload && (
            <div className="status">
              Saved to S3: {activeUpload.fileName} · audio, art, and metadata stored
            </div>
          )}
        </div>
      </section>

      <section className="database-panel">
        <div className="database-header">
          <h2>Local DB</h2>
          <p>{historyStatus}</p>
        </div>
        <div className="history-list">
          {history.length === 0 ? (
            <div className="history-empty">Saved snapshots will appear here after you click Save Snapshot or upload a file.</div>
          ) : history.map(item => (
            <div
              key={item.id}
              className="history-item"
            >
              <div className="history-item-main" onClick={() => viewSnapshot(item)}>
                <strong>{item.label || 'Untitled snapshot'}</strong>
                <span>{new Date(item.createdAt).toLocaleString()}</span>
                <small>{item.source === 'audio-upload' ? 'Audio upload stored in AWS S3' : 'Saved manually'}</small>
              </div>
              <div className="history-item-actions">
                <button type="button" onClick={() => viewSnapshot(item)}>View</button>
                {item.source === 'audio-upload' && (
                  <button type="button" onClick={() => downloadSnapshotAudio(item)}>Download audio</button>
                )}
              </div>
            </div>
          ))}
        </div>
        {selectedSnapshot && (
          <div className="selected-snapshot">
            <h3>Saved preview</h3>
            <p>{selectedSnapshot.label || selectedSnapshot.fileName || 'Selected snapshot'}</p>
            {selectedSnapshot.source === 'audio-upload' ? (
              <>
                <p>Audio file, generated ASCII, and metadata are saved in AWS S3.</p>
                <button type="button" onClick={() => downloadSnapshotAudio(selectedSnapshot)}>
                  Download saved audio
                </button>
              </>
            ) : (
              <p>Manual snapshot loaded.</p>
            )}
          </div>
        )}
      </section>

      <main className="canvas">
        <AsciiArt text={input} mode={mode} art={artOutput} />
      </main>

      <footer className="footer">Framer Motion used for staggered line & char animation</footer>
    </div>
  )
}

function randomSeed(){
  const samples = ['H4G','MUSIC','SYNTH','BEATS','ASCII']
  return samples[Math.floor(Math.random()*samples.length)]
}
