/**
 * cozy-player-controller.js
 * Main controller for Spotify Web Playback SDK integration
 * Manages authentication, device selection, and playback control
 * Zero interference with Spotify's actual playback pipeline
 */

class CozyPlayerController {
  static STORAGE_KEY = 'cozy-player-state-v1';
  static ART_WORKFLOW_KEY = 'cozy-player-art-workflow-v1';
  static ART_CAPTURE_SECONDS = 20;
  static ART_TRIGGER_EVERY = 5;

  getBackendBaseUrl() {
    if (window.SPOTIFY_SITE_URL) {
      return window.SPOTIFY_SITE_URL.replace(/\/$/, '');
    }

    if (window.location && /^https?:$/.test(window.location.protocol)) {
      return window.location.origin;
    }

    return 'http://localhost:8000';
  }

  constructor() {
    this.accessToken = null;
    this.spotifyPlayer = null;
    this.deviceId = null;
    this.currentTrack = null;
    this.isPlaying = false;
    this.audioFeatures = null;
    this.tokenExpiresAt = 0;
    this.positionMs = 0;
    this.durationMs = 0;
    this.progressTimer = null;
    this.persistedState = this.loadPersistedState();
    this.artWorkflowState = this.loadArtWorkflowState();
    this.autoArtworkPendingTrackId = null;
    this.autoArtworkSaving = false;
    
    // DOM Elements
    this.authBtn = document.getElementById('auth-btn');
    this.authIndicator = document.getElementById('auth-indicator');
    this.playBtn = document.getElementById('btn-play');
    this.prevBtn = document.getElementById('btn-prev');
    this.nextBtn = document.getElementById('btn-next');
    this.deviceSelect = document.getElementById('device-select');
    this.progressBar = document.getElementById('progress-bar');
    this.progressInput = document.getElementById('progress-input');
    this.progressFill = document.getElementById('progress-fill');
    this.currentTimeEl = document.getElementById('current-time');
    this.totalTimeEl = document.getElementById('total-time');
    this.volumeSlider = document.getElementById('volume-slider');
    this.trackName = document.getElementById('track-name');
    this.trackArtist = document.getElementById('track-artist');
    this.trackAlbum = document.getElementById('track-album');
    this.albumImage = document.getElementById('album-image');
    this.albumArt = document.getElementById('album-art');
    this.visualModeSelect = document.getElementById('visual-mode');
    this.playlistList = document.getElementById('playlist-list');
    this.recentTrackList = document.getElementById('recent-track-list');
    this.playlistTrackList = document.getElementById('playlist-track-list');
    this.statusPanel = document.getElementById('status-panel');
    this.deviceHelp = document.getElementById('device-help');
    this.artWorkflowStatus = document.getElementById('art-workflow-status');
    this.artGalleryLink = document.getElementById('art-gallery-link');
    
    this.init();
  }

  async init() {
    this.setupEventListeners();
    this.hydratePersistedState();
    this.updateArtWorkflowUI();
    this.updateAuthUI();
    this.startProgressTimer();
    await this.loadAccessToken();
    
    if (this.accessToken) {
      this.showStatusMessage('Connected. Loading Spotify playback and library...');
      await this.initSpotifyPlayer();
      await this.loadLibraryData();
      await this.loadAvailableDevices();
      await this.refreshPlaybackState();
      this.updateAuthUI();
    } else {
      this.showStatusMessage('Connect Spotify to load your playlists, recent tracks, browser device, and visual metadata.');
    }
  }

  setupEventListeners() {
    this.authBtn.addEventListener('click', () => this.handleAuthClick());
    this.playBtn.addEventListener('click', () => this.togglePlayback());
    this.prevBtn.addEventListener('click', () => this.previousTrack());
    this.nextBtn.addEventListener('click', () => this.nextTrack());
    this.deviceSelect.addEventListener('change', (e) => this.switchDevice(e.target.value));
    this.progressInput.addEventListener('change', (e) => this.seekToPosition(parseInt(e.target.value)));
    this.volumeSlider.addEventListener('input', (e) => this.setVolume(parseInt(e.target.value)));
    this.visualModeSelect.addEventListener('change', (e) => {
      if (window.visualEngine) {
        window.visualEngine.setMode(e.target.value);
      }
      this.persistState();
    });
    if (this.artGalleryLink) {
      this.artGalleryLink.addEventListener('click', () => {
        window.location.href = '/artworks';
      });
    }
  }

  loadPersistedState() {
    try {
      const rawState = localStorage.getItem(CozyPlayerController.STORAGE_KEY);
      return rawState ? JSON.parse(rawState) : {};
    } catch (error) {
      console.warn('[Cozy] Unable to read saved player state:', error);
      return {};
    }
  }

  persistState(extraState = {}) {
    try {
      const state = {
        visualMode: this.visualModeSelect?.value || this.persistedState.visualMode || 'particles',
        volume: Number(this.volumeSlider?.value || this.persistedState.volume || 70),
        deviceId: this.deviceId || this.persistedState.deviceId || null,
        currentTrack: this.currentTrack ? this.serializeTrackForStorage(this.currentTrack) : this.persistedState.currentTrack || null,
        positionMs: this.positionMs || 0,
        durationMs: this.durationMs || 0,
        isPlaying: !!this.isPlaying,
        updatedAt: Date.now(),
        ...extraState,
      };

      this.persistedState = state;
      localStorage.setItem(CozyPlayerController.STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('[Cozy] Unable to save player state:', error);
    }
  }

  hydratePersistedState() {
    const state = this.persistedState || {};

    if (state.visualMode && this.visualModeSelect) {
      this.visualModeSelect.value = state.visualMode;
      if (window.visualEngine) window.visualEngine.setMode(state.visualMode);
    }

    if (Number.isFinite(Number(state.volume)) && this.volumeSlider) {
      this.volumeSlider.value = String(Math.max(0, Math.min(100, Number(state.volume))));
    }

    if (state.deviceId) {
      this.deviceId = state.deviceId;
    }

    if (state.currentTrack) {
      this.currentTrack = this.normalizeTrack(state.currentTrack);
      this.positionMs = Number(state.positionMs) || 0;
      this.durationMs = Number(state.durationMs) || this.currentTrack.duration_ms || 0;
      this.updateTrackInfo(this.currentTrack);
      this.updateProgress(this.positionMs, this.durationMs);
      this.isPlaying = false;
      this.updatePlayButton();
      this.showStatusMessage('Restored your last cozy player selection. Press play when you are ready.');
    }
  }

  loadArtWorkflowState() {
    try {
      const rawState = localStorage.getItem(CozyPlayerController.ART_WORKFLOW_KEY);
      const state = rawState ? JSON.parse(rawState) : {};
      return {
        playedCount: Number(state.playedCount) || 0,
        lastTrackId: state.lastTrackId || null,
        savedCount: Number(state.savedCount) || 0,
        lastSavedAt: state.lastSavedAt || null,
        lastSavedTrack: state.lastSavedTrack || null,
      };
    } catch (error) {
      console.warn('[Cozy] Unable to read art workflow state:', error);
      return { playedCount: 0, lastTrackId: null, savedCount: 0 };
    }
  }

  persistArtWorkflowState(extraState = {}) {
    try {
      this.artWorkflowState = {
        ...this.artWorkflowState,
        ...extraState,
      };
      localStorage.setItem(CozyPlayerController.ART_WORKFLOW_KEY, JSON.stringify(this.artWorkflowState));
      this.updateArtWorkflowUI();
    } catch (error) {
      console.warn('[Cozy] Unable to save art workflow state:', error);
    }
  }

  async loadLibraryData() {
    await Promise.all([
      this.loadPlaylists(),
      this.loadRecentlyPlayed(),
    ]);
  }

  /**
   * Load the access token from the backend session.
   * Tokens are kept out of the URL and browser storage.
   */
  async loadAccessToken() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('token')) {
      params.delete('token');
      const query = params.toString();
      window.history.replaceState({}, document.title, `${window.location.pathname}${query ? `?${query}` : ''}`);
    }

    try {
      const response = await fetch('/api/spotify/token', { credentials: 'include' });
      if (!response.ok) {
        this.accessToken = null;
        return null;
      }

      const tokenPayload = await response.json();
      this.accessToken = tokenPayload.access_token;
      this.tokenExpiresAt = Date.now() + ((tokenPayload.expires_in || 3600) * 1000);
      return this.accessToken;
    } catch (error) {
      console.error('[Cozy] Unable to load token:', error);
      this.accessToken = null;
      return null;
    }
  }

  async getAccessToken() {
    if (!this.accessToken || Date.now() > this.tokenExpiresAt - 60000) {
      await this.loadAccessToken();
    }
    return this.accessToken;
  }

  /**
   * Handle authentication button click
   */
  async handleAuthClick() {
    if (this.isAuthenticated()) {
      // Disconnect
      await fetch('/api/spotify/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
      this.accessToken = null;
      if (this.spotifyPlayer) {
        this.spotifyPlayer.disconnect();
      }
      this.updateAuthUI();
      this.resetUI();
    } else {
      // Connect - redirect to backend auth endpoint
      window.location.href = `${this.getBackendBaseUrl()}/auth/spotify?next=/cozy-player`;
    }
  }

  /**
   * Initialize Spotify Web Playback SDK
   * This ONLY sets up the SDK without interfering with playback
   */
  async initSpotifyPlayer() {
    return new Promise((resolve) => {
      const createPlayer = async () => {
        this.spotifyPlayer = new Spotify.Player({
          name: 'Cozy Studio',
          getOAuthToken: async (cb) => {
            cb(await this.getAccessToken());
          },
          volume: (Number(this.volumeSlider?.value || this.persistedState.volume || 70) / 100),
          enableMediaSession: true, // Allow OS media controls
        });

        // Setup player listeners
        this.setupPlayerListeners();

        // Connect player (but don't start playback)
        await this.spotifyPlayer.connect();
        console.log('[Cozy] Spotify Web Playback SDK connected');
        resolve();
      };

      if (window.Spotify?.Player) {
        createPlayer();
      } else {
        window.onSpotifyWebPlaybackSDKReady = createPlayer;
      }
    });
  }

  /**
   * Setup Spotify Player event listeners
   * These are read-only observers - no interference with playback pipeline
   */
  setupPlayerListeners() {
    // Player state changed
    this.spotifyPlayer.addListener('player_state_changed', (state) => {
      if (state) {
        this.onPlayerStateChanged(state);
      } else if (window.visualEngine) {
        window.visualEngine.stop();
      }
    });

    // Ready - device initialized
    this.spotifyPlayer.addListener('ready', ({ device_id }) => {
      console.log('[Cozy] Device ready:', device_id);
      this.deviceId = device_id;
      this.transferPlaybackToBrowser();
      this.loadAvailableDevices();
    });

    // Not ready - device disconnected
    this.spotifyPlayer.addListener('not_ready', ({ device_id }) => {
      console.log('[Cozy] Device not ready:', device_id);
    });

    // Errors
    this.spotifyPlayer.addListener('initialization_error', ({ message }) => {
      console.error('[Cozy] Init error:', message);
    });

    this.spotifyPlayer.addListener('authentication_error', ({ message }) => {
      console.error('[Cozy] Auth error:', message);
      this.handleAuthError();
    });

    this.spotifyPlayer.addListener('account_error', ({ message }) => {
      console.error('[Cozy] Account error:', message);
      this.showStatusMessage('Spotify Premium is required for browser playback.');
    });
  }

  /**
   * Player state changed - update UI and fetch track metadata
   */
  async onPlayerStateChanged(state) {
    if (!state) return;

    const current_track = state.track_window?.current_track || state.current_track || null;
    const is_playing = typeof state.paused === 'boolean' ? !state.paused : !!state.is_playing;
    const { position, duration } = state;
    if (!current_track) {
      this.resetUI();
      if (window.visualEngine) window.visualEngine.stop();
      return;
    }

    if (window.visualEngine) {
      if (is_playing) window.visualEngine.resume();
      else window.visualEngine.stop();
    }

    this.isPlaying = is_playing;
    this.positionMs = position || 0;
    this.durationMs = duration || current_track.duration_ms || 0;
    this.syncVisualPlayback();
    this.updatePlayButton();
    this.updateProgress(this.positionMs, this.durationMs);
    this.persistState();

    // Track changed - fetch audio features
    if (!this.currentTrack || this.currentTrack.id !== current_track.id) {
      if (is_playing) {
        this.trackSpotifyPlaybackForArt(current_track);
      }
      this.currentTrack = current_track;
      await this.updateTrackInfo(current_track);
    }
  }

  /**
   * Update track information in UI and fetch audio features
   */
  async updateTrackInfo(track) {
    if (!track) {
      this.resetUI();
      return;
    }

    // Update UI immediately
    this.trackName.textContent = track.name || 'Unknown Track';
    this.trackArtist.textContent = this.getArtistNames(track) || 'Unknown Artist';
    this.trackAlbum.textContent = track.album?.name || 'Unknown Album';

    // Update album art
    const imageUrl = this.getTrackImage(track);
    if (imageUrl) {
      this.albumImage.src = imageUrl;
      this.albumImage.onload = () => {
        this.albumArt.classList.add('loaded');
      };
    } else {
      this.albumArt.classList.remove('loaded');
    }

    this.durationMs = track.duration_ms || track.duration || this.durationMs || 0;
    this.totalTimeEl.textContent = this.formatTime(this.durationMs / 1000);
    this.showStatusMessage(`Ready: ${track.name || 'selected track'} by ${this.getArtistNames(track) || 'Unknown Artist'}.`);
    this.persistState({ currentTrack: this.serializeTrackForStorage(track) });

    if (window.visualEngine) {
      window.visualEngine.setTrackContext(this.normalizeTrack(track));
      this.syncVisualPlayback();
    }

    // Fetch audio features from Spotify API
    if (track.id) {
      await this.fetchAudioFeatures(track.id);
      if (this.autoArtworkPendingTrackId === track.id) {
        await this.saveAutomaticSpotifyArtwork(track);
      }
    }
  }

  /**
   * Fetch audio features from Spotify API
   * Pass to visual engine for real-time visualization
   */
  async fetchAudioFeatures(trackId) {
    try {
      await this.getAccessToken();
      const response = await fetch(`/api/audio-features/${trackId}`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      });

      if (!response.ok) throw new Error('Failed to fetch audio features');

      const featurePayload = await response.json();
      const features = featurePayload.normalized || featurePayload;
      this.audioFeatures = features;
      if (this.currentTrack) {
        this.currentTrack.audioFeatures = features;
      }

      // Update UI with audio features
      this.updateAudioFeaturesBars(features);

      // Send to visual engine
      if (window.visualEngine) {
        window.visualEngine.setAudioFeatures(features);
      }

      console.log('[Cozy] Audio features fetched:', features);
      this.persistState();
    } catch (error) {
      console.error('[Cozy] Error fetching audio features:', error);
      const fallbackFeatures = this.getFallbackFeatures(this.currentTrack || {});
      this.audioFeatures = fallbackFeatures;
      if (this.currentTrack) {
        this.currentTrack.audioFeatures = fallbackFeatures;
      }
      this.updateAudioFeaturesBars(fallbackFeatures);
      if (window.visualEngine) {
        window.visualEngine.setAudioFeatures(fallbackFeatures);
      }
      this.persistState();
    }
  }

  trackSpotifyPlaybackForArt(track) {
    const normalized = this.normalizeTrack(track);
    const trackId = normalized?.id || normalized?.uri;
    if (!trackId || this.artWorkflowState.lastTrackId === trackId) return;

    const playedCount = (Number(this.artWorkflowState.playedCount) || 0) + 1;
    const shouldCapture = playedCount % CozyPlayerController.ART_TRIGGER_EVERY === 0;

    this.persistArtWorkflowState({
      playedCount,
      lastTrackId: trackId,
    });

    if (shouldCapture) {
      this.autoArtworkPendingTrackId = trackId;
      this.showStatusMessage(`Track ${playedCount}: saving a ${CozyPlayerController.ART_CAPTURE_SECONDS}s MIDI/art capture after audio features load.`);
    } else {
      const remaining = CozyPlayerController.ART_TRIGGER_EVERY - (playedCount % CozyPlayerController.ART_TRIGGER_EVERY);
      this.updateArtWorkflowUI(`Auto art in ${remaining} track${remaining === 1 ? '' : 's'}.`);
    }
  }

  async saveAutomaticSpotifyArtwork(track) {
    const normalized = this.normalizeTrack(track);
    const trackId = normalized?.id || normalized?.uri;
    if (!trackId || this.autoArtworkSaving) return;

    this.autoArtworkSaving = true;
    this.autoArtworkPendingTrackId = null;

    try {
      const payload = {
        track: this.serializeTrackForStorage(normalized),
        features: this.audioFeatures || normalized.audioFeatures || this.getFallbackFeatures(normalized),
        captureSeconds: CozyPlayerController.ART_CAPTURE_SECONDS,
        triggerEvery: CozyPlayerController.ART_TRIGGER_EVERY,
        playedCount: this.artWorkflowState.playedCount,
      };

      const response = await fetch('/api/artworks/spotify-capture', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Artwork save failed');
      }

      const data = await response.json();
      const artwork = data.artwork;
      this.persistArtWorkflowState({
        savedCount: (Number(this.artWorkflowState.savedCount) || 0) + 1,
        lastSavedAt: artwork?.createdAt || new Date().toISOString(),
        lastSavedTrack: payload.track.name,
      });
      this.showStatusMessage(`Saved automatic Spotify artwork for ${payload.track.name}. Open the gallery to view it.`);
    } catch (error) {
      console.error('[Cozy] Automatic artwork save failed:', error);
      this.showStatusMessage('Automatic artwork save failed. The player will keep counting tracks.');
      this.updateArtWorkflowUI('Last save failed.');
    } finally {
      this.autoArtworkSaving = false;
    }
  }

  updateArtWorkflowUI(extraMessage = '') {
    if (!this.artWorkflowStatus) return;

    const playedCount = Number(this.artWorkflowState.playedCount) || 0;
    const savedCount = Number(this.artWorkflowState.savedCount) || 0;
    const modulo = playedCount % CozyPlayerController.ART_TRIGGER_EVERY;
    const remaining = modulo === 0 ? CozyPlayerController.ART_TRIGGER_EVERY : CozyPlayerController.ART_TRIGGER_EVERY - modulo;
    const savedText = this.artWorkflowState.lastSavedTrack
      ? `Last saved: ${this.artWorkflowState.lastSavedTrack}.`
      : 'No automatic saves yet.';

    this.artWorkflowStatus.textContent = extraMessage || `${playedCount} tracks counted. Next save in ${remaining}. ${savedCount} saved. ${savedText}`;
  }

  /**
   * Update audio features display bars
   */
  updateAudioFeaturesBars(features) {
    if (!features) return;

    document.getElementById('energy-bar').style.width = (this.clamp01(features.energy) * 100) + '%';
    document.getElementById('valence-bar').style.width = (this.clamp01(features.valence) * 100) + '%';
    document.getElementById('danceability-bar').style.width = (this.clamp01(features.danceability) * 100) + '%';
    document.getElementById('tempo-value').textContent = Math.round(features.tempo) + ' BPM';
  }

  /**
   * Load available Spotify devices and include the browser SDK device.
   */
  async loadAvailableDevices() {
    if (!this.deviceSelect || !this.accessToken) return;

    try {
      await this.getAccessToken();
      const response = await fetch('https://api.spotify.com/v1/me/player/devices', {
        headers: { 'Authorization': `Bearer ${this.accessToken}` },
      });

      if (!response.ok) throw new Error('Failed to load devices');

      const data = await response.json();
      const devices = data.devices || [];
      const hasBrowserDevice = this.deviceId && devices.some((device) => device.id === this.deviceId);

      if (this.deviceId && !hasBrowserDevice) {
        devices.unshift({
          id: this.deviceId,
          name: 'Cozy Studio in this browser',
          type: 'Computer',
          is_active: true,
        });
      }

      this.deviceSelect.innerHTML = '';

      if (devices.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No Spotify devices found';
        this.deviceSelect.appendChild(option);
        if (this.deviceHelp) this.deviceHelp.textContent = 'Open Spotify once, then refresh devices by reconnecting.';
        return;
      }

      devices.forEach((device) => {
        const option = document.createElement('option');
        option.value = device.id;
        option.textContent = `${device.name || 'Unnamed device'}${device.type ? ` (${device.type})` : ''}${device.is_active ? ' - active' : ''}`;
        this.deviceSelect.appendChild(option);
      });

      const activeDevice = devices.find((device) => device.is_active) || devices.find((device) => device.id === this.deviceId) || devices[0];
      this.deviceId = activeDevice.id;
      this.deviceSelect.value = this.deviceId;
      this.persistState();
      if (this.deviceHelp) this.deviceHelp.textContent = activeDevice.id === this.deviceId
        ? 'Use this device for tap-to-play and browser controls.'
        : 'Choose where Spotify should play selected tracks.';
    } catch (error) {
      console.error('[Cozy] Failed to load devices:', error);
      if (this.deviceHelp) this.deviceHelp.textContent = 'Could not read Spotify devices. Try reconnecting Spotify.';
    }
  }

  /**
   * Playback control - Play/Pause
   * Uses Spotify Web Playback SDK methods
   */
  async togglePlayback() {
    try {
      if (this.isPlaying) {
        await this.pausePlayback();
      } else {
        if (this.currentTrack?.uri) {
          await this.playTrack(this.currentTrack.uri, this.currentTrack);
        } else if (this.spotifyPlayer) {
          await this.spotifyPlayer.resume();
        } else {
          this.showStatusMessage('Choose a recent track or playlist track first.');
        }
      }
    } catch (error) {
      console.error('[Cozy] Playback toggle error:', error);
    }
  }

  async pausePlayback() {
    await this.getAccessToken();
    const response = await fetch('https://api.spotify.com/v1/me/player/pause', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${this.accessToken}` },
    });

    if (!response.ok && response.status !== 204) {
      if (this.spotifyPlayer) {
        await this.spotifyPlayer.pause();
      } else {
        throw new Error('Failed to pause playback');
      }
    }

    this.isPlaying = false;
    this.updatePlayButton();
    this.persistState({ isPlaying: false });
    this.syncVisualPlayback();
    if (window.visualEngine) window.visualEngine.stop();
  }

  /**
   * Previous track
   */
  async previousTrack() {
    try {
      await this.getAccessToken();
      const response = await fetch('https://api.spotify.com/v1/me/player/previous', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.accessToken}` },
      });
      if (!response.ok && this.spotifyPlayer) await this.spotifyPlayer.previousTrack();
      setTimeout(() => this.refreshPlaybackState(), 500);
    } catch (error) {
      console.error('[Cozy] Previous track error:', error);
    }
  }

  /**
   * Next track
   */
  async nextTrack() {
    try {
      await this.getAccessToken();
      const response = await fetch('https://api.spotify.com/v1/me/player/next', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.accessToken}` },
      });
      if (!response.ok && this.spotifyPlayer) await this.spotifyPlayer.nextTrack();
      setTimeout(() => this.refreshPlaybackState(), 500);
    } catch (error) {
      console.error('[Cozy] Next track error:', error);
    }
  }

  /**
   * Seek to position in track (in milliseconds)
   */
  async seekToPosition(percentage) {
    if (!this.currentTrack) return;

    const positionMs = (percentage / 100) * (this.currentTrack.duration_ms || this.currentTrack.duration || this.durationMs);

    try {
      await this.getAccessToken();
      const response = await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${Math.floor(positionMs)}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${this.accessToken}` },
      });
      if (!response.ok && this.spotifyPlayer) await this.spotifyPlayer.seek(Math.floor(positionMs));
      this.positionMs = positionMs;
      this.updateProgress(positionMs, this.durationMs);
      this.syncVisualPlayback();
      this.persistState();
    } catch (error) {
      console.error('[Cozy] Seek error:', error);
    }
  }

  /**
   * Set volume (0-100)
   */
  async setVolume(volumePercent) {
    try {
      await this.getAccessToken();
      const response = await fetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${volumePercent}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${this.accessToken}` },
      });
      if (this.spotifyPlayer) await this.spotifyPlayer.setVolume(volumePercent / 100);
      this.persistState({ volume: volumePercent });
    } catch (error) {
      console.error('[Cozy] Volume set error:', error);
    }
  }

  /**
   * Switch playback device
   */
  async switchDevice(deviceId) {
    if (!deviceId || !this.accessToken) return;

    try {
      await this.getAccessToken();
      // Use Spotify Web API to transfer playback
      const response = await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_ids: [deviceId],
          play: this.isPlaying,
        }),
      });

      if (!response.ok) throw new Error('Failed to switch device');
      this.deviceId = deviceId;
      if (this.deviceSelect) this.deviceSelect.value = deviceId;
      this.persistState();
      console.log('[Cozy] Switched to device:', deviceId);
    } catch (error) {
      console.error('[Cozy] Device switch error:', error);
    }
  }

  async playTrack(trackUri, track = null) {
    if (!trackUri || !this.accessToken) return;

    try {
      await this.getAccessToken();
      if (track) {
        this.currentTrack = this.normalizeTrack(track);
        await this.updateTrackInfo(this.currentTrack);
      }
      if (this.deviceId) {
        await fetch('https://api.spotify.com/v1/me/player', {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            device_ids: [this.deviceId],
            play: true,
          }),
        });
      }

      const url = this.deviceId
        ? `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(this.deviceId)}`
        : 'https://api.spotify.com/v1/me/player/play';
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uris: [trackUri] }),
      });

      if (!response.ok && response.status !== 204) {
        const errorText = await response.text();
        throw new Error(errorText || 'Spotify rejected playback');
      }

      this.isPlaying = true;
      this.updatePlayButton();
      this.persistState();
      this.syncVisualPlayback();
      if (window.visualEngine) window.visualEngine.resume();
      setTimeout(() => this.refreshPlaybackState(), 600);
    } catch (error) {
      console.error('[Cozy] Play track error:', error);
      this.showStatusMessage('Playback needs Spotify Premium and an active device. Open Spotify once, then try the track again.');
    }
  }

  async fetchJson(path) {
    await this.getAccessToken();
    const response = await fetch(path, {
      credentials: 'include',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${path}`);
    }

    return response.json();
  }

  renderLibraryItems(container, items, emptyMessage, itemRenderer) {
    if (!container) return;

    if (!items || items.length === 0) {
      container.classList.add('empty-state');
      container.textContent = emptyMessage;
      return;
    }

    container.classList.remove('empty-state');
    container.innerHTML = '';
    items.forEach((item) => container.appendChild(itemRenderer(item)));
  }

  createLibraryRow({ title, subtitle, imageUrl, onPlay, onSelect, buttonLabel = '▶' }) {
    const row = document.createElement('div');
    row.className = 'library-item';

    const main = document.createElement('div');
    main.className = 'library-item-main';
    if (onSelect) {
      main.style.cursor = 'pointer';
      main.addEventListener('click', onSelect);
    }

    const thumb = document.createElement('div');
    thumb.className = 'library-thumb';
    if (imageUrl) {
      thumb.style.backgroundImage = `url(${imageUrl})`;
    }

    const label = document.createElement('div');
    label.className = 'library-label';
    const titleEl = document.createElement('div');
    titleEl.className = 'library-name';
    titleEl.textContent = title;
    const subtitleEl = document.createElement('div');
    subtitleEl.className = 'library-meta';
    subtitleEl.textContent = subtitle || '';
    label.appendChild(titleEl);
    label.appendChild(subtitleEl);

    main.appendChild(thumb);
    main.appendChild(label);

    row.appendChild(main);

    if (onPlay) {
      const btn = document.createElement('button');
      btn.className = 'library-play-btn';
      btn.textContent = buttonLabel;
      btn.title = 'Play';
      btn.setAttribute('aria-label', `Play ${title}`);
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        onPlay(event);
      });
      row.appendChild(btn);
    }

    return row;
  }

  async loadPlaylists() {
    try {
      const data = await this.fetchJson('/api/spotify/playlists');
      const playlists = data.playlists || [];
      this.renderLibraryItems(this.playlistList, playlists, 'No playlists found.', (playlist) =>
        this.createLibraryRow({
          title: playlist.name,
          subtitle: `${playlist.trackCount || 0} tracks${playlist.owner ? ` • ${playlist.owner}` : ''}`,
          imageUrl: playlist.image,
          onSelect: async () => this.loadPlaylistTracks(playlist.id, playlist.name),
        })
      );
    } catch (error) {
      console.error('[Cozy] Failed to load playlists:', error);
      this.renderLibraryItems(this.playlistList, [], 'Unable to load playlists.', () => document.createElement('div'));
    }
  }

  async loadRecentlyPlayed() {
    try {
      const data = await this.fetchJson('/api/spotify/me/player/recently-played');
      const tracks = data.tracks || [];
      this.renderLibraryItems(this.recentTrackList, tracks, 'No recently played tracks found.', (track) =>
        this.createLibraryRow({
          title: track.name,
          subtitle: track.artists || 'Unknown artist',
          imageUrl: track.image,
          onSelect: () => this.previewTrack(track),
          onPlay: track.uri ? () => this.playTrack(track.uri, track) : null,
        })
      );
    } catch (error) {
      console.error('[Cozy] Failed to load recently played:', error);
      this.renderLibraryItems(this.recentTrackList, [], 'Unable to load recent tracks.', () => document.createElement('div'));
    }
  }

  async loadPlaylistTracks(playlistId, playlistName) {
    if (!playlistId) return;

    this.playlistTrackList.textContent = `Loading ${playlistName || 'playlist'}…`;

    try {
      const data = await this.fetchJson(`/api/spotify/playlist/${playlistId}/tracks`);
      const tracks = data.tracks || [];

      this.renderLibraryItems(this.playlistTrackList, tracks, 'No tracks in playlist.', (track) =>
        this.createLibraryRow({
          title: track.name,
          subtitle: track.artists || 'Unknown artist',
          imageUrl: track.image,
          onSelect: () => this.previewTrack(track),
          onPlay: track.uri ? () => this.playTrack(track.uri, track) : null,
        })
      );
    } catch (error) {
      console.error('[Cozy] Failed to load playlist tracks:', error);
      this.renderLibraryItems(this.playlistTrackList, [], 'Unable to load playlist tracks.', () => document.createElement('div'));
    }
  }

  /**
   * Update progress bar and time display
   */
  updateProgress(positionMs, durationMs) {
    if (durationMs) {
      const percentage = (positionMs / durationMs) * 100;
      this.progressFill.style.width = percentage + '%';
      this.progressInput.max = 100;
      this.progressInput.value = percentage;
    }

    this.currentTimeEl.textContent = this.formatTime(positionMs / 1000);
    this.totalTimeEl.textContent = this.formatTime((durationMs || this.durationMs) / 1000);
  }

  /**
   * Update play button state
   */
  updatePlayButton() {
    if (this.isPlaying) {
      this.playBtn.classList.add('playing');
      // Change to pause icon
      this.playBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
        </svg>
      `;
    } else {
      this.playBtn.classList.remove('playing');
      // Change to play icon
      this.playBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
      `;
    }
  }

  /**
   * Update authentication UI
   */
  updateAuthUI() {
    if (this.isAuthenticated()) {
      this.authIndicator.classList.remove('disconnected');
      this.authIndicator.classList.add('connected');
      this.authIndicator.innerHTML = `
        <span class="indicator-dot"></span>
        <span class="indicator-text">Connected</span>
      `;
      this.authBtn.textContent = 'Disconnect Spotify';
    } else {
      this.authIndicator.classList.add('disconnected');
      this.authIndicator.classList.remove('connected');
      this.authIndicator.innerHTML = `
        <span class="indicator-dot"></span>
        <span class="indicator-text">Disconnected</span>
      `;
      this.authBtn.textContent = 'Connect Spotify';
    }
  }

  /**
   * Reset UI to default state
   */
  resetUI() {
    this.trackName.textContent = 'Select a track';
    this.trackArtist.textContent = 'No artist';
    this.trackAlbum.textContent = 'No album';
    this.currentTimeEl.textContent = '0:00';
    this.totalTimeEl.textContent = '0:00';
    this.progressFill.style.width = '0%';
    this.progressInput.value = 0;
    this.albumArt.classList.remove('loaded');
    this.albumImage.src = '';
    this.currentTrack = null;
    this.isPlaying = false;
    this.positionMs = 0;
    this.durationMs = 0;
    this.updatePlayButton();
    this.syncVisualPlayback();
    this.persistState({ currentTrack: null, positionMs: 0, durationMs: 0, isPlaying: false });
    this.showStatusMessage(this.accessToken
      ? 'Choose a track below, or start playback in Spotify and select Cozy Studio as the device.'
      : 'Connect Spotify to load your playlists, recent tracks, browser device, and visual metadata.');
    
    // Reset audio features
    document.getElementById('energy-bar').style.width = '0%';
    document.getElementById('valence-bar').style.width = '0%';
    document.getElementById('danceability-bar').style.width = '0%';
    document.getElementById('tempo-value').textContent = '0 BPM';
  }

  /**
   * Handle authentication error
   */
  handleAuthError() {
    this.accessToken = null;
    this.updateAuthUI();
    this.resetUI();
    alert('Authentication error. Please reconnect.');
  }

  async transferPlaybackToBrowser() {
    if (!this.deviceId) return;

    try {
      await this.getAccessToken();
      const response = await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_ids: [this.deviceId],
          play: false,
        }),
      });

      if (response.status === 404) {
        this.showStatusMessage('Open Spotify and play something, then choose Cozy Studio as the device.');
      }
    } catch (error) {
      console.error('[Cozy] Playback transfer error:', error);
    }
  }

  async refreshPlaybackState() {
    if (!this.accessToken) return;

    try {
      await this.getAccessToken();
      const response = await fetch('https://api.spotify.com/v1/me/player', {
        headers: { 'Authorization': `Bearer ${this.accessToken}` },
      });

      if (response.status === 204 || response.status === 404) {
        this.showStatusMessage('Choose a track below, or start playback in Spotify and select Cozy Studio as the device.');
        return;
      }

      if (!response.ok) throw new Error('Unable to read playback state');

      const state = await response.json();
      if (state?.device?.id) {
        this.deviceId = state.device.id;
        this.setDeviceSelectValue(this.deviceId);
      }

      if (state?.item) {
        this.currentTrack = this.normalizeTrack(state.item);
        this.isPlaying = !!state.is_playing;
        this.positionMs = state.progress_ms || 0;
        this.durationMs = state.item.duration_ms || 0;
        await this.updateTrackInfo(this.currentTrack);
        this.updateProgress(this.positionMs, this.durationMs);
        this.updatePlayButton();
        this.syncVisualPlayback();
        this.persistState();
      }
    } catch (error) {
      console.error('[Cozy] Failed to refresh playback:', error);
    }
  }

  async previewTrack(track) {
    this.currentTrack = this.normalizeTrack(track);
    await this.updateTrackInfo(this.currentTrack);
    this.positionMs = 0;
    this.durationMs = this.currentTrack.duration_ms || this.currentTrack.duration || 0;
    this.isPlaying = false;
    this.updateProgress(this.positionMs, this.durationMs);
    this.syncVisualPlayback();
    if (this.currentTrack.audioFeatures) {
      const features = this.normalizeAudioFeatureShape(this.currentTrack.audioFeatures);
      this.audioFeatures = features;
      this.updateAudioFeaturesBars(features);
      if (window.visualEngine) window.visualEngine.setAudioFeatures(features);
    }
    this.persistState();
  }

  normalizeTrack(track) {
    if (!track) return null;
    return {
      ...track,
      duration_ms: track.duration_ms || track.duration || 0,
      album: typeof track.album === 'string'
        ? { name: track.album, images: track.image ? [{ url: track.image }] : [] }
        : (track.album || { name: 'Unknown Album', images: track.image ? [{ url: track.image }] : [] }),
      artists: Array.isArray(track.artists)
        ? track.artists
        : String(track.artists || 'Unknown Artist').split(',').map((name) => ({ name: name.trim() })),
    };
  }

  getArtistNames(track) {
    if (!track?.artists) return '';
    if (typeof track.artists === 'string') return track.artists;
    return track.artists.map((artist) => artist.name).filter(Boolean).join(', ');
  }

  getTrackImage(track) {
    return track?.album?.images?.[0]?.url || track?.image || '';
  }

  serializeTrackForStorage(track) {
    if (!track) return null;
    const normalized = this.normalizeTrack(track);
    return {
      id: normalized.id || null,
      uri: normalized.uri || null,
      name: normalized.name || 'Unknown Track',
      artists: this.getArtistNames(normalized) || 'Unknown Artist',
      album: normalized.album?.name || 'Unknown Album',
      image: this.getTrackImage(normalized),
      duration_ms: normalized.duration_ms || normalized.duration || 0,
      popularity: normalized.popularity,
      audioFeatures: normalized.audioFeatures || this.audioFeatures || null,
    };
  }

  getFallbackFeatures(track) {
    const duration = track.duration_ms || track.duration || 180000;
    const popularity = typeof track.popularity === 'number' ? track.popularity / 100 : 0.55;
    return {
      energy: this.clamp01(0.38 + popularity * 0.45),
      valence: this.clamp01(0.44 + ((duration % 90000) / 90000) * 0.24),
      danceability: this.clamp01(0.42 + popularity * 0.35),
      tempo: 96 + Math.round(popularity * 56),
      acousticness: 0.24,
      instrumentalness: 0.08,
      liveness: 0.35,
      speechiness: 0.08,
    };
  }

  normalizeAudioFeatureShape(features) {
    if (!features) return this.getFallbackFeatures(this.currentTrack || {});
    return {
      energy: this.clamp01(features.energy),
      valence: this.clamp01(features.valence),
      danceability: this.clamp01(features.danceability),
      tempo: Number.isFinite(Number(features.tempo)) ? Number(features.tempo) : 120,
      acousticness: this.clamp01(features.acousticness),
      instrumentalness: this.clamp01(features.instrumentalness),
      liveness: this.clamp01(features.liveness),
      speechiness: this.clamp01(features.speechiness),
    };
  }

  clamp01(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.min(1, numeric));
  }

  startProgressTimer() {
    if (this.progressTimer) return;
    this.progressTimer = setInterval(() => {
      if (!this.isPlaying || !this.durationMs) return;
      this.positionMs = Math.min(this.durationMs, this.positionMs + 1000);
      this.updateProgress(this.positionMs, this.durationMs);
      this.syncVisualPlayback();
      if (this.positionMs % 5000 === 0 || this.positionMs >= this.durationMs) {
        this.persistState();
      }
    }, 1000);
  }

  syncVisualPlayback() {
    if (!window.visualEngine) return;
    window.visualEngine.setPlaybackState({
      positionMs: this.positionMs || 0,
      durationMs: this.durationMs || this.currentTrack?.duration_ms || this.currentTrack?.duration || 0,
      isPlaying: this.isPlaying,
    });
  }

  setDeviceSelectValue(deviceId) {
    if (!this.deviceSelect || !deviceId) return;
    for (const option of this.deviceSelect.options) {
      if (option.value === deviceId) {
        this.deviceSelect.value = deviceId;
        return;
      }
    }
  }

  showStatusMessage(message) {
    if (this.statusPanel) {
      this.statusPanel.textContent = message;
    }
  }

  /**
   * Check if authenticated
   */
  isAuthenticated() {
    return !!this.accessToken;
  }

  /**
   * Format seconds to MM:SS
   */
  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

// Initialize controller when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.playerController = new CozyPlayerController();
});
