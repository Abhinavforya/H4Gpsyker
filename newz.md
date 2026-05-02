Here’s a **Codex-ready instruction file** you can paste directly into your repo (e.g., `CODEX_INSTRUCTIONS.md`).
It is written so Codex generates the system **correctly without breaking Spotify rules or functionality**.

---

# 📄 CODEX EXECUTION INSTRUCTIONS

## Cozy Spotify Visual Player (Strict SDK Integration)

---

## 0. Goal

Build a **web app that plays Spotify music using the official SDK** and overlays a **custom visual + cozy UI layer**.

The system must:

* Use **Spotify Web Playback SDK for playback
* Use **Spotify Web API for metadata
* NEVER interfere with Spotify’s actual playback mechanism

---

## 1. Hard Constraints (DO NOT VIOLATE)

Codex must enforce:

* ❌ Do NOT access raw audio streams
* ❌ Do NOT download/cache Spotify content
* ❌ Do NOT modify or wrap audio pipeline
* ❌ Do NOT sync Spotify audio with external media

Spotify explicitly forbids altering or synchronizing content with visuals ([Spotify for Developers][1])

✔ Only metadata-driven visuals allowed

---

## 2. Requirements from Spotify (MANDATORY)

* User must have **Spotify Premium** for playback ([Spotify for Developers][2])
* OAuth authentication required (Authorization Code + PKCE recommended) ([Spotify for Developers][3])
* Access token expires (~1 hour), must support refresh ([Spotify for Developers][1])

---

## 3. System Overview

### Architecture

```
Frontend (React / Next.js)
  ├── Spotify Player SDK
  ├── UI Layer (cozy interface)
  ├── Visual Engine (canvas/WebGL)

Backend (Node.js)
  ├── OAuth handler
  ├── Token exchange + refresh

Spotify
  ├── Playback SDK (audio)
  ├── Web API (metadata)
```

---

## 4. Step-by-Step Implementation Plan

Codex must generate code in THIS ORDER:

---

### STEP 1 — Backend OAuth Server

Create `/server/index.ts`

Responsibilities:

* Handle `/login`
* Handle `/callback`
* Exchange authorization code → access token
* Return token to frontend

Use:

* Authorization Code Flow with PKCE

Key Notes:

* Store client secret ONLY in backend
* Redirect URI must match Spotify app settings

---

### STEP 2 — Frontend Auth Flow

Create:

```
/client/lib/auth.ts
```

Features:

* Redirect user to Spotify login
* Receive token after redirect
* Store token in memory (NOT localStorage if possible)

---

### STEP 3 — Initialize Spotify Player

Create:

```
/client/hooks/useSpotifyPlayer.ts
```

Implementation:

* Load SDK script:

```html
<script src="https://sdk.scdn.co/spotify-player.js"></script>
```

* Initialize player:

```js
const player = new Spotify.Player({
  name: "Cozy Player",
  getOAuthToken: cb => cb(token),
  volume: 0.5
});
```

* Connect player:

```js
player.connect();
```

* Listen to events:

  * ready
  * not_ready
  * player_state_changed

The SDK requires a valid OAuth token to initialize playback ([Spotify for Developers][4])

---

### STEP 4 — Playback Controls

Create:

```
/client/components/PlayerControls.tsx
```

Must support:

* Play / Pause
* Next / Previous
* Seek
* Volume

Use:

```js
player.togglePlay()
```

---

### STEP 5 — Track + Audio Features

Create:

```
/client/hooks/useTrackFeatures.ts
```

Fetch:

* `/v1/me/player/currently-playing`
* `/v1/audio-features/{id}`

Extract:

* tempo
* energy
* valence
* danceability

---

### STEP 6 — Visual Engine

Create:

```
/client/lib/visuals.ts
/client/components/VisualCanvas.tsx
```

Rules:

* NO audio processing
* ONLY metadata-driven visuals

Mapping:

| Feature  | Effect               |
| -------- | -------------------- |
| tempo    | animation speed      |
| energy   | brightness/intensity |
| valence  | color palette        |
| progress | animation phase      |

---

### STEP 7 — UI Layout

Split layout:

```
---------------------------------
| Player Info | Visual Canvas   |
| Controls    | (main feature)  |
---------------------------------
```

UI Requirements:

* Cozy theme (blur, gradients, soft glow)
* Album art background blur
* Responsive layout

---

### STEP 8 — Playback Transfer

After player is ready:

* Transfer playback to browser device

Use Web API:

```
PUT /v1/me/player
```

---

## 5. Data Flow

```
User → Login → Backend → Token
     → Frontend → SDK init
     → Player state → Track ID
     → Fetch features → Visual engine
     → Render UI + animation
```

---

## 6. Performance Rules

* Visual engine must run at ~60 FPS
* Avoid heavy computations in render loop
* Cache track features
* Debounce API calls

---

## 7. Error Handling

Codex must implement:

* If no active device:
  → show "Open Spotify and play something"

* If token expired:
  → refresh silently

* If no track:
  → pause visuals

---

## 8. Development Setup

* Use **ngrok for local OAuth redirect
* Register redirect URL in Spotify dashboard

---

## 9. Deliverables

Codex must output:

* Working backend (OAuth)
* React frontend
* Spotify player integration
* Visual engine (canvas-based)
* Clean modular code

---

## 10. Strict Anti-Patterns

Codex must NEVER:

* Attempt to extract audio waveform
* Use `<audio>` tag for Spotify streams
* Reverse-engineer Spotify playback
* Sync visuals to actual audio waveform

---

## 11. Definition of Done

* User logs in with Spotify
* Music plays via SDK
* UI updates in real-time
* Visuals respond to track metadata
* No Spotify policy violations

---

## 12. Optional Enhancements (DO NOT BLOCK MVP)

* ASCII art renderer
* AI-generated visual styles
* Playlist-based mood system
* Multi-theme UI

---

## Final Instruction to Codex

> Build incrementally.
> Do NOT generate the entire project at once.
> Start with backend OAuth, then move step-by-step.

---

If you want next level:
I can generate a **fully working starter repo (frontend + backend)** so you skip 70% of the setup pain.

[1]: https://developer.spotify.com/documentation/web-playback-sdk/tutorials/getting-started?utm_source=chatgpt.com "Getting Started with Web Playback SDK - Spotify for Developers"
[2]: https://developer.spotify.com/documentation/web-playback-sdk/howtos/web-app-player?utm_source=chatgpt.com "Building a Spotify Player inside a Web app"
[3]: https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow?utm_source=chatgpt.com "Authorization Code with PKCE Flow"
[4]: https://developer.spotify.com/documentation/web-playback-sdk/reference?utm_source=chatgpt.com "Web Playback SDK Reference"
