import React, {useEffect, useState, useRef} from 'react'
import AsciiArt from './AsciiArt'
import { saveSnapshot } from './db'
import { saveAudioUpload } from './audioUploadService'
import { clearStoredProfile, getStoredProfile, saveStoredProfile } from './profileService'
import { getProfileArt, saveProfileArt } from './profileArtService'

export default function App(){
  const [input, setInput] = useState('H4G')
  const [mode, setMode] = useState('text')
  const [artOutput, setArtOutput] = useState('')
  const [processing, setProcessing] = useState(false)
  const [history, setHistory] = useState([])
  const [historyStatus, setHistoryStatus] = useState('Loading saved snapshots...')
  const [activeUpload, setActiveUpload] = useState(null)
  const [selectedSnapshot, setSelectedSnapshot] = useState(null)
  const [profile, setProfile] = useState(() => getStoredProfile())
  const [profileName, setProfileName] = useState(() => getStoredProfile()?.name || '')
  const fileRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function loadHistory() {
      if (!profile?.id) {
        setHistory([])
        setHistoryStatus('Login to load your saved art.')
        return
      }

      try {
        const items = await getProfileArt(profile.id)
        if (!cancelled) {
          setHistory(items)
          setHistoryStatus(items.length ? 'Profile art loaded from S3.' : 'No saved art in this profile yet.')
        }
      } catch (error) {
        if (!cancelled) {
          console.error('profile art load error', error)
          setHistoryStatus('Could not load profile art from S3.')
        }
      }
    }

    loadHistory()

    return () => {
      cancelled = true
    }
  }, [profile])

  async function handleFiles(files){
    if(!files || files.length === 0) return
    if(!profile?.id) {
      alert('Login to a profile before uploading audio.')
      return
    }
    const file = files[0]
    setProcessing(true)
    try{
      const savedUpload = await saveAudioUpload(file, profile)
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
    if (!profile?.id) {
      alert('Login to a profile before saving art.')
      return
    }

    try {
      const savedArt = await saveProfileArt({
        ...snapshot,
        userId: profile.id,
        generatedArt: artOutput || snapshot.input,
      })
      await saveSnapshot({
        ...snapshot,
        ...savedArt,
        userId: profile.id,
      })
      setSelectedSnapshot(savedArt)
      await refreshHistory('Art saved to your S3 profile.')
    } catch (error) {
      console.error('snapshot save error', error)
      setHistoryStatus('Could not save art to S3.')
    }
  }

  async function refreshHistory(statusMessage) {
    if (!profile?.id) {
      setHistory([])
      setHistoryStatus('Login to load your saved art.')
      return
    }

    const items = await getProfileArt(profile.id)
    setHistory(items)
    if (statusMessage) {
      setHistoryStatus(statusMessage)
    } else {
      setHistoryStatus(items.length ? 'Profile art loaded from S3.' : 'No saved art in this profile yet.')
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

  function handleLogin(event) {
    event.preventDefault()
    const nextProfile = saveStoredProfile(profileName)
    setProfile(nextProfile)
    setProfileName(nextProfile.name)
    setSelectedSnapshot(null)
    setActiveUpload(null)
  }

  function handleLogout() {
    clearStoredProfile()
    setProfile(null)
    setHistory([])
    setSelectedSnapshot(null)
    setActiveUpload(null)
    setHistoryStatus('Login to load your saved art.')
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
        <div>
          <h1>ASCII Framer — live ASCII animations</h1>
          <p className="sub">Paste text or upload audio/MIDI to generate animated ASCII</p>
        </div>
        {profile ? (
          <div className="profile-chip">
            <span>{profile.name}</span>
            <small>{profile.id}</small>
            <button type="button" onClick={handleLogout}>Logout</button>
          </div>
        ) : null}
      </header>

      {!profile && (
        <section className="profile-login">
          <form onSubmit={handleLogin}>
            <label htmlFor="profile-name">Profile</label>
            <input
              id="profile-name"
              value={profileName}
              onChange={event => setProfileName(event.target.value)}
              placeholder="Enter your name or email"
            />
            <button type="submit">Login</button>
          </form>
        </section>
      )}

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
              Saved to S3 profile: {activeUpload.fileName} · audio, art, and metadata stored
            </div>
          )}
        </div>
      </section>

      <section className="database-panel">
        <div className="database-header">
          <h2>{profile ? `${profile.name}'s profile art` : 'Profile art'}</h2>
          <p>{historyStatus}</p>
        </div>
        <div className="history-list">
          {history.length === 0 ? (
            <div className="history-empty">Saved art will appear here after you login and save or upload a file.</div>
          ) : history.map(item => (
            <div
              key={item.id || item.metadataKey || item.artKey}
              className="history-item"
            >
              <div className="history-item-main" onClick={() => viewSnapshot(item)}>
                <strong>{item.label || 'Untitled snapshot'}</strong>
                <span>{new Date(item.createdAt).toLocaleString()}</span>
                <small>{item.source === 'audio-upload' ? 'Audio upload stored in your S3 profile' : 'Generated art stored in your S3 profile'}</small>
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
                <p>Audio file, generated ASCII, and metadata are saved in this profile's S3 folder.</p>
                <button type="button" onClick={() => downloadSnapshotAudio(selectedSnapshot)}>
                  Download saved audio
                </button>
              </>
            ) : (
              <p>Generated art loaded from this profile's S3 folder.</p>
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
