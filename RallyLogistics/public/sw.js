// Rally Logistics Service Worker — offline-first caching
const SHELL_CACHE = 'rally-logistics-shell-v3'
const RUNTIME_CACHE = 'rally-logistics-runtime-v3'

self.addEventListener('install', event => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map(k => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET') return
  if (!url.protocol.startsWith('http')) return

  // ── Supabase API + Storage ── Network-first, cache fallback
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(RUNTIME_CACHE).then(c => c.put(request, clone))
          }
          return response
        })
        .catch(() => caches.match(request))
    )
    return
  }

  // ── index.html / navigation ── Always network-first so code updates are picked up immediately
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(SHELL_CACHE).then(c => c.put(request, clone))
          }
          return response
        })
        .catch(() => caches.match(request).then(r => r || caches.match('/index.html')))
    )
    return
  }

  // ── Hashed static assets (JS/CSS/fonts) ── Cache-first (hash changes on every build so cache stays fresh)
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached
      return fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(SHELL_CACHE).then(c => c.put(request, clone))
        }
        return response
      })
    })
  )
})
