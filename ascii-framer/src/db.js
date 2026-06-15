const DB_NAME = 'ascii-framer-db'
const DB_VERSION = 1
const STORE_NAME = 'snapshots'
const MAX_SNAPSHOTS = 12

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not available in this browser'))
      return
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'))
  })
}

export async function saveSnapshot(snapshot) {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const entry = {
      createdAt: Date.now(),
      ...snapshot,
    }

    const request = store.add(entry)

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Failed to save snapshot'))

    transaction.oncomplete = async () => {
      try {
        await trimSnapshots(database)
      } finally {
        database.close()
      }
    }

    transaction.onerror = () => {
      database.close()
      reject(transaction.error || new Error('Failed to save snapshot'))
    }
  })
}

export async function getRecentSnapshots(limit = MAX_SNAPSHOTS) {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const items = []
    const request = store.openCursor(null, 'prev')

    request.onsuccess = event => {
      const cursor = event.target.result
      if (cursor && items.length < limit) {
        items.push(cursor.value)
        cursor.continue()
        return
      }
      resolve(items)
    }

    request.onerror = () => reject(request.error || new Error('Failed to load snapshots'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => {
      database.close()
      reject(transaction.error || new Error('Failed to load snapshots'))
    }
  })
}

async function trimSnapshots(database) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.openCursor(null, 'prev')
    const idsToKeep = new Set()
    let count = 0

    request.onsuccess = event => {
      const cursor = event.target.result
      if (cursor) {
        count += 1
        if (count <= MAX_SNAPSHOTS) {
          idsToKeep.add(cursor.value.id)
        } else {
          cursor.delete()
        }
        cursor.continue()
      }
    }

    transaction.oncomplete = () => resolve(idsToKeep)
    transaction.onerror = () => reject(transaction.error || new Error('Failed to trim snapshots'))
    request.onerror = () => reject(request.error || new Error('Failed to trim snapshots'))
  })
}
