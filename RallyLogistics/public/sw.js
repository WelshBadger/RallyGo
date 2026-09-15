// Rally Logistics Service Worker — offline-first caching + push notifications
const SHELL_CACHE = 'rally-logistics-shell-v6'
const RUNTIME_CACHE = 'rally-logistics-runtime-v6'
const FILE_CACHE = 'rally-logistics-files-v6'

self.addEventListener('install', event => {
  self.skipWaiting()
  // Precache the app shell so the app can cold-start with no signal, on any route.
  event.waitUntil(
    caches.open(SHELL_CACHE).then(c => Promise.all([
      c.add('/').catch(() => {}),
      c.add('/index.html').catch(() => {}),
    ]))
  )
})

// Let the page tell a waiting worker to activate immediately (self-healing updates)
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== SHELL_CACHE && k !== RUNTIME_CACHE && k !== FILE_CACHE)
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

  // Vercel Web Analytics — never intercept or cache; must always hit the network
  if (url.pathname.startsWith('/_vercel/')) return

  const isSupabase = url.hostname.includes('supabase.co')
  // Map tiles for the Locations thumbnails — cache-first like files, so the little
  // maps still draw with no signal once they've been seen online.
  const isMapTile = url.hostname.endsWith('basemaps.cartocdn.com') || url.hostname.endsWith('tile.openstreetmap.org')
  // Leaflet (live team map) is loaded from a CDN — cache it like a file so the map still opens offline
  const isMapLib = url.hostname === 'cdnjs.cloudflare.com' && url.pathname.includes('/leaflet/')

  // ── Supabase Storage FILES (images / PDFs) ── Cache-first (immutable, timestamped
  //    filenames), so once seen with signal they open offline forever. Opaque (no-cors
  //    <img>/<a>) responses are cached too — response.ok is false for those.
  if (isMapTile || isMapLib || (isSupabase && url.pathname.includes('/storage/'))) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached
        return fetch(request)
          .then(response => {
            if (response && (response.ok || response.type === 'opaque')) {
              const clone = response.clone()
              caches.open(FILE_CACHE).then(c => c.put(request, clone))
            }
            return response
          })
          .catch(() => caches.match(request))
      })
    )
    return
  }

  // ── Supabase REST/API data ── Network-first, cache fallback (offline reads)
  if (isSupabase) {
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

  // ── Navigations ── Network-first so code updates land immediately; offline, fall
  //    back to this exact page if cached, else the app shell (SPA routes client-side),
  //    so the app cold-starts with no signal on ANY route.
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
        .catch(async () => {
          return (await caches.match(request))
            || (await caches.match('/index.html'))
            || (await caches.match('/'))
            || Response.error()
        })
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

// ── Push notifications ──
self.addEventListener('push', event => {
  if (!event.data) return

  let data = {}
  try { data = event.data.json() } catch { return }

  const title = data.title || 'Rally Logistics'
  const options = {
    body: data.body || 'New message',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    data: { url: data.url || '/' },
    tag: data.rallyId ? `rl-${data.rallyId}` : 'rally-logistics',
    renotify: true,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// ── Notification tap → deep-link into the app ──
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client) client.navigate(url)
          return
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
