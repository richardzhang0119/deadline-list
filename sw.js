// Keeps a copy of the app's files so the site opens with no connection. Lists themselves are
// kept offline by Firestore's own cache; this only covers the pages, code, styles, and icons.
//
// The page registers this file as sw.js?build=<id>, and each publish has a new id, so the
// browser installs a fresh copy of the files after every publish.

const BUILD = new URL(self.location.href).searchParams.get('build') ?? 'dev'
const CACHE_PREFIX = 'todo-list-'
const CACHE = `${CACHE_PREFIX}${BUILD}`

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch(`precache.json?build=${BUILD}`, { cache: 'no-store' })
      const files = await response.json()
      const cache = await caches.open(CACHE)
      await cache.addAll(files)
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE)
          .map((name) => caches.delete(name)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  // Only this site's own files; Firebase and other sites go straight to the network.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    // The page itself: the newest copy when online, the saved one when not.
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        try {
          const response = await fetch(request)
          if (response.ok) await cache.put('./', response.clone())
          return response
        } catch {
          return (await cache.match('./', { ignoreVary: true })) ?? Response.error()
        }
      })(),
    )
    return
  }

  // Code, styles, and icons have the version in their names, so a saved copy is always right.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      // ignoreVary: servers may mark files "Vary: Origin", and the saved copies were fetched
      // without the Origin header that the page's own requests carry.
      const saved = await cache.match(request, { ignoreSearch: true, ignoreVary: true })
      if (saved !== undefined) return saved
      const response = await fetch(request)
      if (response.ok) await cache.put(request, response.clone())
      return response
    })(),
  )
})
