// Simple frontend logic for auth display and playlist dropdown
(function(){
  const API_BASE = window.SPOTIFY_API_BASE_URL || '';
  const authBtn = document.getElementById('auth-btn');
  const authStatus = document.getElementById('auth-status');
  const dropdownToggle = document.getElementById('dropdown-toggle');
  const dropdownMenu = document.getElementById('dropdown-menu');
  const playlistPreview = document.getElementById('playlist-preview');
  const coverEl = document.getElementById('cover');
  const playlistName = document.getElementById('playlist-name');
  const playlistDesc = document.getElementById('playlist-desc');
  const trackList = document.getElementById('track-list');

  function apiUrl(path){
    return new URL(path, API_BASE || window.location.origin).toString();
  }

  function consumeAccessTokenFromUrl(){
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

  function getAccessToken(){
    return consumeAccessTokenFromUrl() || localStorage.getItem('spotify_access_token');
  }

  // Demo-friendly: try to read a token from localStorage (backend must store it there after redirect)
  function isConnected(){
    return !!getAccessToken();
  }

  function updateAuthUI(){
    if(isConnected()){
      authStatus.textContent = 'Connected';
      authBtn.textContent = 'Disconnect';
    } else {
      authStatus.textContent = 'Not connected';
      authBtn.textContent = 'Connect to Spotify';
    }
  }

  authBtn.addEventListener('click', ()=>{
    if(isConnected()){
      localStorage.removeItem('spotify_access_token');
      updateAuthUI();
    } else {
      window.location.href = '/auth/spotify';
    }
  });

  dropdownToggle.addEventListener('click', ()=>{
    dropdownMenu.classList.toggle('hidden');
  });

  function clearTracks(){
    trackList.innerHTML = '';
  }

  function showTracks(tracks){
    clearTracks();
    if(!tracks || tracks.length===0){
      trackList.innerHTML = '<li class="muted">No tracks to show.</li>';
      return;
    }
    tracks.forEach((t, idx)=>{
      const li = document.createElement('li');
      li.innerHTML = `<span>${idx+1}. ${t.name}</span><span class="muted">${t.duration || ''}</span>`;
      trackList.appendChild(li);
    });
  }

  // Mock fetch — replace with a real fetch to your backend: /api/spotify/playlists
  async function fetchPlaylists(){
    const token = getAccessToken();

    // If connected and real endpoint exists, call it. Fallback to mocked data.
    try{
      if(token){
        const resp = await fetch(apiUrl('/api/playlists'), {
          headers: { Authorization: `Bearer ${token}` }
        });
        if(resp.ok){
          const data = await resp.json();
          return data.playlists || [];
        }
      }
    }catch(e){/* ignore and fallback */}

    // Mocked playlists
    return [
      {id:'pl_1',name:'Late Night Beats',desc:'Chill instrumentals and ambient grooves',image:'https://picsum.photos/200?random=11',tracks:[{name:'Midnight Sketch',duration:'3:21'},{name:'Low Glow',duration:'4:02'},{name:'Paper Waves',duration:'2:44'}]},
      {id:'pl_2',name:'Morning Piano',desc:'Acoustic piano and gentle pieces',image:'https://picsum.photos/200?random=12',tracks:[{name:'Dawn',duration:'2:10'},{name:'First Light',duration:'3:46'}]},
      {id:'pl_3',name:'Energetic',desc:'Upbeat electronic workouts',image:'https://picsum.photos/200?random=13',tracks:[{name:'Drive',duration:'3:30'},{name:'Pulse',duration:'2:58'},{name:'Finish Line',duration:'3:12'}]}
    ];
  }

  async function loadPlaylists(){
    dropdownToggle.textContent = 'Loading…';
    const pls = await fetchPlaylists();
    dropdownMenu.innerHTML = '';
    pls.forEach(p => {
      const item = document.createElement('div');
      item.className = 'dropdown-item';
      item.innerHTML = `<div class="thumb" style="background-image:url(${p.image || ''})"></div><div class="col"><div class="nm">${p.name}</div><div class="muted" style="font-size:12px">${p.desc||''}</div></div>`;
      item.addEventListener('click', ()=>selectPlaylist(p));
      dropdownMenu.appendChild(item);
    });
    dropdownToggle.textContent = 'Choose playlist';
    dropdownMenu.classList.remove('hidden');
  }

  function selectPlaylist(p){
    dropdownMenu.classList.add('hidden');
    dropdownToggle.textContent = p.name;
    coverEl.style.backgroundImage = `url(${p.image})`;
    playlistName.textContent = p.name;
    playlistDesc.textContent = p.desc || '';
    showTracks(p.tracks || []);
  }

  // init
  (function init(){
    consumeAccessTokenFromUrl();
    updateAuthUI();
    loadPlaylists();
  })();

})();
