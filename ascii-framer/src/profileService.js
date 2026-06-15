const PROFILE_STORAGE_KEY = 'ascii-framer-profile'

export function createProfileId(name) {
  return String(name || 'guest')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'guest'
}

export function getStoredProfile() {
  try {
    const rawProfile = window.localStorage.getItem(PROFILE_STORAGE_KEY)
    return rawProfile ? JSON.parse(rawProfile) : null
  } catch {
    return null
  }
}

export function saveStoredProfile(name) {
  const profile = {
    id: createProfileId(name),
    name: String(name || 'Guest').trim() || 'Guest',
  }
  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
  return profile
}

export function clearStoredProfile() {
  window.localStorage.removeItem(PROFILE_STORAGE_KEY)
}
