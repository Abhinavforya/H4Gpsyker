Here’s a clean, execution-ready PRD. No fluff—this is structured so you (or a team) can actually build it.

---

# **Product Requirements Document (PRD)**

## **Product Name:** SonicCanvas (working title)

---

## **1. Overview**

SonicCanvas converts music into generative visual art in real time and from history. It integrates with Spotify Web API to analyze user listening behavior and produces adaptive, personalized art using audio features and AI-driven style decisions.

The system transforms:

```
Audio → Structured Events → Visual Output (ASCII / p5.js)
```

---

## **2. Problem Statement**

Current music visualizers:

* Are generic and repetitive
* Lack personalization
* Don’t evolve with user taste
* Don’t create persistent or shareable outputs

Users want:

* A way to *see* their music identity
* Real-time visual feedback
* Unique, evolving art tied to their listening history

---

## **3. Goals & Objectives**

### Primary Goals

* Convert music into meaningful, dynamic visuals
* Enable Spotify-based automation
* Build a system that adapts to user taste over time

### Secondary Goals

* Support multiple art styles (ASCII + generative canvas)
* Enable real-time rendering
* Store and revisit generated art

---

## **4. Target Users**

* Developers / creators interested in generative art
* Music enthusiasts (Spotify users)
* Artists exploring data-driven visuals

---

## **5. Core Features**

---

### **5.1 Music Input Layer**

#### Features:

* Upload MP3 files
* Spotify login and sync
* Fetch:

  * Recently played tracks
  * Currently playing track

#### Requirements:

* OAuth via Spotify
* Secure token handling
* Support near real-time polling (~5–10 sec)

---

### **5.2 Audio Intelligence Engine**

#### Tools:

* Librosa
* Essentia
* Optional: Basic Pitch

#### Extract:

* Tempo (BPM)
* Beat timestamps
* Onset detection
* Spectral features (brightness, energy)
* Pitch (approximate)

#### Output:

Structured event stream:

```
{
  time: float,
  type: "beat" | "note" | "energy",
  value: float | int
}
```

---

### **5.3 Event Processing Layer**

#### Responsibilities:

* Normalize audio features
* Convert into time-based events
* Stream events to frontend

#### Requirements:

* Real-time compatibility
* WebSocket support
* Buffering for smooth playback

---

### **5.4 Art Engine**

---

#### **A. ASCII Art Generator**

Maps:

* Pitch → character type
* Energy → density
* Time → rows

Output:

* Terminal-style visuals
* Exportable as text/image

---

#### **B. Generative Canvas (p5.js)**

Uses:

* p5.js

Maps:

* BPM → animation speed
* Beats → triggers
* Frequency → color
* Energy → scale

#### Features:

* Real-time animation
* Multiple visual modes (particles, waves, geometry)

---

### **5.5 Agentic Personalization Layer**

#### Tools:

* OpenAI API

#### Responsibilities:

* Build user taste profile from Spotify history
* Classify:

  * Genre preference
  * Energy levels
  * Listening patterns

#### Outputs:

```
{
  preferred_style: "minimal" | "chaotic" | "geometric",
  color_palette: [...],
  motion_intensity: float
}
```

#### Behavior:

* Selects visual style dynamically
* Evolves over time
* Overrides default mappings

---

### **5.6 Spotify Integration Layer**

#### Features:

* Login via OAuth
* Fetch:

  * Recently played
  * Currently playing

#### Behavior:

* Auto-trigger art generation
* Continuous sync for real-time mode

---

### **5.7 Storage & Gallery**

#### Features:

* Save generated artworks
* Tag by:

  * Song
  * Date
  * Mood

#### Optional:

* Shareable links
* Download (PNG / GIF / TXT)

---

## **6. User Flows**

---

### **Flow 1: MP3 Upload**

1. User uploads file
2. Audio is analyzed
3. Event stream generated
4. Art rendered

---

### **Flow 2: Spotify Login**

1. User logs in via Spotify
2. System fetches recent tracks
3. Generates batch visuals
4. Stores results

---

### **Flow 3: Real-Time Mode**

1. Detect currently playing track
2. Poll track state
3. Generate evolving visuals
4. Update canvas continuously

---

### **Flow 4: Agent Learning**

1. Collect listening history
2. Build profile
3. Adjust art style
4. Improve over time

---

## **7. Technical Architecture**

---

### **Frontend**

* React
* p5.js
* WebSockets

---

### **Backend**

* FastAPI (Python)
* Audio processing (Librosa / Essentia)
* AI inference (OpenAI API)

---

### **Infrastructure**

* ngrok (dev tunneling)
* Vercel (frontend)
* Railway / Render (backend)

---

## **8. Non-Functional Requirements**

* Latency:

  * Real-time rendering < 200ms delay

* Scalability:

  * Handle concurrent users

* Reliability:

  * Graceful fallback if Spotify fails

* Security:

  * OAuth token encryption
  * No long-term storage of sensitive tokens

---

## **9. MVP Scope (Phase 1)**

Must-have:

* MP3 upload
* BPM + beat detection
* Basic p5.js visualization

Exclude:

* Agent layer
* Spotify real-time
* MIDI

---

## **10. Phase 2**

* Spotify login
* Recently played visualization
* ASCII art mode

---

## **11. Phase 3**

* Agent personalization
* Real-time playback sync
* Style evolution

---

## **12. Risks & Constraints**

* MP3 → MIDI inaccuracies
* Spotify API rate limits
* Real-time sync complexity
* Audio processing performance

---

## **13. Success Metrics**

* User engagement (time spent visualizing)
* Number of generated artworks
* Spotify login conversion rate
* Repeat usage

---

## **14. Future Enhancements**

* Multi-user shared sessions
* NFT / ownership layer (if you must)
* VR / immersive visuals
* AI-generated music → art loop

---

## **15. Final Note**

If you try to build everything at once, you won’t ship.

Ship in this order:

1. Beat-synced visuals
2. Spotify sync
3. Personalization

Everything else is garnish.

---

If you want, next step I can break this into:

* exact API routes
* DB schema
* or a 7-day build sprint plan
