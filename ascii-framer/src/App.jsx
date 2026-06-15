import React, {useEffect, useState, useRef} from 'react'
import AsciiArt from './AsciiArt'
import { processFile } from './processor'
import { getRecentSnapshots, saveSnapshot } from './db'

export default function App(){
  const [input, setInput] = useState('H4G')
  const [mode, setMode] = useState('text')
  const [processing, setProcessing] = useState(false)
  const [history, setHistory] = useState([])
  const [historyStatus, setHistoryStatus] = useState('Loading saved snapshots...')
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
    const f = files[0]
    setProcessing(true)
    try{
      const ascii = await processFile(f)
      setInput(ascii)
      setMode('text')
      await persistSnapshot({
        input: ascii,
        mode: 'text',
        label: f.name,
        source: 'file',
      })
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
      const items = await getRecentSnapshots()
      setHistory(items)
      setHistoryStatus('Snapshot saved.')
    } catch (error) {
      console.error('snapshot save error', error)
      setHistoryStatus('Could not save to database.')
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
    setInput(snapshot.input || '')
    setMode(snapshot.mode || 'text')
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
              <strong>Drop audio (.mp3, .wav) or MIDI (.mid) here</strong>
              <div className="muted">or <button onClick={()=>fileRef.current.click()}>choose a file</button></div>
              <input ref={fileRef} type="file" style={{display:'none'}} onChange={e=>handleFiles(e.target.files)} />
            </div>
          </div>
          <div className="status">{processing ? 'Processing...' : 'Ready'}</div>
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
            <button
              key={item.id}
              className="history-item"
              onClick={() => restoreSnapshot(item)}
            >
              <strong>{item.label || 'Untitled snapshot'}</strong>
              <span>{new Date(item.createdAt).toLocaleString()}</span>
              <small>{item.source === 'file' ? 'Imported from file' : 'Saved manually'}</small>
            </button>
          ))}
        </div>
      </section>

      <main className="canvas">
        <AsciiArt text={input} mode={mode} />
      </main>

      <footer className="footer">Framer Motion used for staggered line & char animation</footer>
    </div>
  )
}

function randomSeed(){
  const samples = ['H4G','MUSIC','SYNTH','BEATS','ASCII']
  return samples[Math.floor(Math.random()*samples.length)]
}
