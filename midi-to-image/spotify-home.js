/**
 * spotify-home.js
 * Handles Spotify user home page with profile, playlists, and recently played artists
 */

let currentUser = null;
let currentPlaylistSongs = [];
const SPOTIFY_API_BASE = window.SPOTIFY_API_BASE_URL || '';

function apiUrl(path) {
  return new URL(path, SPOTIFY_API_BASE || window.location.origin).toString();
}

function consumeAccessTokenFromUrl() {
  const currentUrl = new URL(window.location.href);
  const token = currentUrl.searchParams.get('token');

  if (!token) {
    return null;
  }

  localStorage.setItem('spotify_access_token', token);
  currentUrl.searchParams.delete('token');
  window.history.replaceState({}, document.title, `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
  return token;
}

function getAccessToken() {
  return consumeAccessTokenFromUrl() || localStorage.getItem('spotify_access_token');
}

// Initialize Spotify home on page load
document.addEventListener('DOMContentLoaded', async () => {
  consumeAccessTokenFromUrl();
  checkSpotifyAuth();
});

/**
 * Check if user is authenticated with Spotify
 */
async function checkSpotifyAuth() {
  const token = getAccessToken();

  if (!token) {
    showMainApp();
    return;
  }

  try {
    const response = await fetch(apiUrl('/api/me'), {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (response.ok) {
      currentUser = await response.json();
      showSpotifyHome();
      loadSpotifyData();
    } else {
      localStorage.removeItem('spotify_access_token');
      showMainApp();
    }
  } catch (err) {
    console.error('❌ Auth check failed:', err);
    showMainApp();
  }
}

/**
 * Show Spotify home page and hide main app
 */
function showSpotifyHome() {
  const spotifyHome = document.getElementById('spotifyHome');
  const mainContent = document.getElementById('mainContent');
  const spotifyAuthBtn = document.getElementById('spotifyAuthBtn');
  const spotifyProfileIcon = document.getElementById('spotifyProfileIcon');
  
  if (spotifyHome) spotifyHome.style.display = 'block';
  if (mainContent) mainContent.style.display = 'none';
  if (spotifyAuthBtn) spotifyAuthBtn.style.display = 'none';
  if (spotifyProfileIcon) spotifyProfileIcon.style.display = 'flex';
  
  // Set up profile picture and greeting
  if (currentUser) {
    if (currentUser.image) {
      const profileImg = document.getElementById('userProfileImg');
      if (profileImg) profileImg.src = currentUser.image;
    }
    
    const greeting = document.getElementById('userGreeting');
    if (greeting) {
      const hour = new Date().getHours();
      let timeOfDay = 'day';
      if (hour < 12) timeOfDay = 'morning';
      else if (hour < 18) timeOfDay = 'afternoon';
      else timeOfDay = 'evening';
      
      greeting.textContent = `Good ${timeOfDay}, ${currentUser.name}! 🎵`;
    }
  }
}

/**
 * Show main app and hide Spotify home
 */
function showMainApp() {
  const spotifyHome = document.getElementById('spotifyHome');
  const mainContent = document.getElementById('mainContent');
  const spotifyAuthBtn = document.getElementById('spotifyAuthBtn');
  const spotifyProfileIcon = document.getElementById('spotifyProfileIcon');
  
  if (spotifyHome) spotifyHome.style.display = 'none';
  if (mainContent) mainContent.style.display = 'block';
  if (spotifyAuthBtn) spotifyAuthBtn.style.display = 'inline-flex';
  if (spotifyProfileIcon) spotifyProfileIcon.style.display = 'none';
}

/**
 * Load Spotify data (playlists and recently played artists)
 */
async function loadSpotifyData() {
  try {
    // Load playlists
    loadPlaylists();
    
    // Load recently played artists
    loadRecentlyPlayedArtists();
    
    // Set up event listeners
    setupEventListeners();
  } catch (err) {
    console.error('❌ Failed to load Spotify data:', err);
  }
}

/**
 * Load user's playlists
 */
async function loadPlaylists() {
  const container = document.getElementById('playlistsContainer');
  const count = document.getElementById('playlistCount');
  const token = getAccessToken();
  
  try {
    const response = await fetch(apiUrl('/api/playlists'), {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch playlists');
    }
    
    const data = await response.json();
    const playlists = data.playlists || [];
    
    if (count) count.textContent = playlists.length;
    
    if (playlists.length === 0) {
      container.innerHTML = '<div class="empty-state">No playlists found</div>';
      return;
    }
    
    // Clear skeleton loaders
    container.innerHTML = '';
    
    // Create playlist cards
    playlists.forEach(playlist => {
      const card = createPlaylistCard(playlist);
      container.appendChild(card);
    });
  } catch (err) {
    console.error('❌ Failed to load playlists:', err);
    container.innerHTML = '<div class="empty-state">Failed to load playlists</div>';
  }
}

/**
 * Create playlist card element
 */
function createPlaylistCard(playlist) {
  const card = document.createElement('div');
  card.className = 'playlist-card';
  
  const imageUrl = playlist.image || 'https://via.placeholder.com/220?text=No+Image';
  const trackCount = playlist.trackCount || 0;
  const owner = playlist.owner || 'Unknown';
  
  card.innerHTML = `
    <img src="${imageUrl}" alt="${playlist.name}" class="playlist-image" onerror="this.src='https://via.placeholder.com/220?text=Playlist'">
    <div class="playlist-info">
      <div class="playlist-name">${escapeHtml(playlist.name)}</div>
      <div class="playlist-meta">
        <span class="playlist-owner">${escapeHtml(owner)}</span>
        <span class="playlist-tracks">${trackCount} 🎵</span>
      </div>
    </div>
  `;
  
  card.style.cursor = 'pointer';
  card.addEventListener('click', () => {
    openPlaylistModal(playlist);
  });
  
  return card;
}

/**
 * Load user's recently played artists and songs
 */
async function loadRecentlyPlayedArtists() {
  const songsContainer = document.getElementById('songsContainer');
  const songsCount = document.getElementById('songsCount');
  const artistsContainer = document.getElementById('artistsContainer');
  const artistsCount = document.getElementById('artistCount');
  const token = getAccessToken();
  
  try {
    const response = await fetch(apiUrl('/api/recently-played'), {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch recently played data');
    }
    
    const data = await response.json();
    const songs = data.songs || [];
    const artists = data.artists || [];
    
    // Load songs
    if (songsCount) songsCount.textContent = songs.length;
    
    if (songs.length === 0) {
      songsContainer.innerHTML = '<div class="empty-state">No recently played songs found</div>';
    } else {
      songsContainer.innerHTML = '';
      songs.forEach(song => {
        const card = createSongCard(song);
        songsContainer.appendChild(card);
      });
    }
    
    // Load artists
    if (artistsCount) artistsCount.textContent = artists.length;
    
    if (artists.length === 0) {
      artistsContainer.innerHTML = '<div class="empty-state">No recently played artists found</div>';
      return;
    }
    
    // Clear skeleton loaders
    artistsContainer.innerHTML = '';
    
    // Create artist cards
    artists.forEach(artist => {
      const card = createArtistCard(artist);
      artistsContainer.appendChild(card);
    });
  } catch (err) {
    console.error('❌ Failed to load recently played data:', err);
    songsContainer.innerHTML = '<div class="empty-state">Failed to load songs</div>';
    artistsContainer.innerHTML = '<div class="empty-state">Failed to load artists</div>';
  }
}

/**
 * Create song card element
 */
function createSongCard(song) {
  const card = document.createElement('div');
  card.className = 'song-card';
  
  const imageUrl = song.image || 'https://via.placeholder.com/220?text=No+Album';
  const artistNames = song.artists?.map(a => a.name).join(', ') || 'Unknown Artist';
  const duration = `${Math.floor(song.duration / 60000)}:${String(Math.floor((song.duration % 60000) / 1000)).padStart(2, '0')}`;
  
  card.innerHTML = `
    <img src="${imageUrl}" alt="${song.name}" class="song-image" onerror="this.src='https://via.placeholder.com/220?text=Album'">
    <div class="song-info">
      <div class="song-name">${escapeHtml(song.name)}</div>
      <div class="song-artist">${escapeHtml(artistNames)}</div>
      <div class="song-meta">
        <span class="song-duration">${duration}</span>
        <span class="song-popularity">⭐ ${song.popularity || 0}</span>
      </div>
    </div>
  `;
  
  if (song.url) {
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => window.open(song.url, '_blank'));
  }
  
  return card;
}

/**
 * Create artist card element
 */
function createArtistCard(artist) {
  const card = document.createElement('div');
  card.className = 'artist-card';
  
  // Use first letter of artist name as fallback avatar
  const fallbackAvatar = artist.name.charAt(0).toUpperCase();
  
  card.innerHTML = `
    <div class="artist-avatar">
      <span>${fallbackAvatar}</span>
    </div>
    <div class="artist-name">${escapeHtml(artist.name)}</div>
  `;
  
  if (artist.url) {
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => window.open(artist.url, '_blank'));
  }
  
  return card;
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Back to app button
  const backBtn = document.getElementById('backToAppBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      logoutFromSpotify();
    });
  }
  
  // Logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      logoutFromSpotify();
    });
  }
  
  // Profile picture click - could navigate back to app or refresh data
  const profileImg = document.getElementById('userProfileImg');
  if (profileImg) {
    profileImg.addEventListener('click', () => {
      // Refresh data on profile click
      loadSpotifyData();
    });
  }

  // Modal close button
  const closeModalBtn = document.getElementById('closePlaylistModalBtn');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closePlaylistModal);
  }

  // Modal background click to close
  const modal = document.getElementById('playlistModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closePlaylistModal();
      }
    });
  }

  // Song search input
  const searchInput = document.getElementById('songSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', filterSongs);
  }

  // Select all / Deselect all buttons
  const selectAllBtn = document.getElementById('selectAllSongsBtn');
  const deselectAllBtn = document.getElementById('deselectAllSongsBtn');
  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', selectAllSongs);
  }
  if (deselectAllBtn) {
    deselectAllBtn.addEventListener('click', deselectAllSongs);
  }

  // Convert button
  const convertBtn = document.getElementById('convertSelectedSongsBtn');
  if (convertBtn) {
    convertBtn.addEventListener('click', convertSelectedSongs);
  }
}

/**
 * Open playlist modal and load songs
 */
async function openPlaylistModal(playlist) {
  const modal = document.getElementById('playlistModal');
  const title = document.getElementById('playlistModalTitle');
  const container = document.getElementById('playlistSongsContainer');
  
  if (!modal) return;

  // Set title
  if (title) {
    title.textContent = `Songs in "${escapeHtml(playlist.name)}"`;
  }

  // Show modal
  modal.style.display = 'flex';
  
  // Clear and show loading state
  container.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const loader = document.createElement('div');
    loader.className = 'skeleton-loader';
    loader.style.height = '60px';
    container.appendChild(loader);
  }

  // Load songs
  await loadPlaylistSongs(playlist.id);
}

/**
 * Close playlist modal
 */
function closePlaylistModal() {
  const modal = document.getElementById('playlistModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * Load songs from playlist
 */
async function loadPlaylistSongs(playlistId) {
  const container = document.getElementById('playlistSongsContainer');
  const token = getAccessToken();

  try {
    const candidatePaths = [
      `/api/spotify/playlist/${playlistId}/tracks`,
      `/api/playlist/${playlistId}/tracks`,
    ];

    let response = null;
    for (const path of candidatePaths) {
      const candidateResponse = await fetch(apiUrl(path), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (candidateResponse.ok) {
        response = candidateResponse;
        break;
      }

      if (candidateResponse.status !== 404) {
        response = candidateResponse;
        break;
      }
    }

    if (!response || !response.ok) {
      throw new Error('Failed to fetch songs');
    }

    const data = await response.json();
    const songs = data.tracks || [];
    currentPlaylistSongs = songs;
    window.currentSpotifyPlaylistSongs = songs;

    container.innerHTML = '';

    if (songs.length === 0) {
      container.innerHTML = '<div class="empty-state">No songs found in this playlist</div>';
      return;
    }

    // Create song items
    songs.forEach(song => {
      const item = createSongItem(song);
      container.appendChild(item);
    });

    // Store songs for filtering
    container.dataset.allSongs = JSON.stringify(songs);
  } catch (err) {
    console.error('❌ Failed to load playlist songs:', err);
    container.innerHTML = '<div class="empty-state">Failed to load songs</div>';
  }
}

/**
 * Create song item element
 */
function createSongItem(song) {
  const item = document.createElement('div');
  item.className = 'song-item';
  item.dataset.songId = song.id;
  item.dataset.songName = song.name.toLowerCase();

  const duration = formatDuration(song.duration);
  const explicit = song.explicit ? '🅴 ' : '';

  item.innerHTML = `
    <input type="checkbox" class="song-checkbox" data-song-id="${song.id}">
    <div class="song-item-info">
      <div class="song-item-name">${escapeHtml(song.name)}</div>
      <div class="song-item-meta">
        <span>${escapeHtml(song.artists)}</span>
        ${explicit ? `<span>${explicit}</span>` : ''}
      </div>
    </div>
    <div class="song-item-duration">${duration}</div>
  `;

  return item;
}

/**
 * Format duration from milliseconds to MM:SS
 */
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Filter songs based on search input
 */
function filterSongs(e) {
  const query = e.target.value.toLowerCase();
  const items = document.querySelectorAll('.song-item');

  items.forEach(item => {
    const name = item.dataset.songName;
    item.style.display = name.includes(query) ? 'flex' : 'none';
  });
}

/**
 * Select all visible songs
 */
function selectAllSongs() {
  const checkboxes = document.querySelectorAll('.song-checkbox:not([style*="display: none"])');
  checkboxes.forEach(checkbox => {
    const item = checkbox.closest('.song-item');
    if (item.style.display !== 'none') {
      checkbox.checked = true;
    }
  });
}

/**
 * Deselect all songs
 */
function deselectAllSongs() {
  const checkboxes = document.querySelectorAll('.song-checkbox');
  checkboxes.forEach(checkbox => {
    checkbox.checked = false;
  });
}

/**
 * Convert selected songs to MIDI and then ASCII art
 */
async function convertSelectedSongs() {
  const checkboxes = Array.from(document.querySelectorAll('.song-checkbox:checked'));

  if (checkboxes.length === 0) {
    alert('Please select at least one song to convert');
    return;
  }

  const selectedSongs = checkboxes.map(cb => {
    const songId = cb.dataset.songId;
    const fullSong = currentPlaylistSongs.find(song => song.id === songId);

    return fullSong || {
      id: songId,
      name: cb.closest('.song-item').querySelector('.song-item-name').textContent
    };
  });

  console.log('Converting songs:', selectedSongs);

  // Store selected songs for processing
  sessionStorage.setItem('selectedSongsForConversion', JSON.stringify(selectedSongs));

  // Close modal
  closePlaylistModal();

  // Trigger conversion (you'll need to implement this in app.js or sketch.js)
  if (window.convertSpotifySongsToAsciiArt) {
    window.convertSpotifySongsToAsciiArt(selectedSongs);
  } else {
    alert('Conversion feature is being loaded. Please try again.');
  }
}

/**
 * Logout from Spotify
 */
async function logoutFromSpotify() {
  localStorage.removeItem('spotify_access_token');
  currentUser = null;
  showMainApp();
  location.reload();
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
