// RallyGo Service Worker — offline-first caching + push notifications
// v2: navigation is network-first so app updates reach users immediately
// (v1 served the shell cache-first, which froze users on old builds)
const SHELL_CACHE = 'rallygo-shell-v2'
const RUNTIME_CACHE = 'rallygo-runtime-v2'

self.addEventListener('install', event => {
  self.skipWaiting()
})

// Remove old caches on activate (clears the stale v1 shell)
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

  // Skip non-GET and non-http(s)
  if (request.method !== 'GET') return
  if (!url.protocol.startsWith('http')) return

  // ── Supabase API ── Network-first, cache fallback
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

  // ── index.html / navigation ── Network-first so code updates land immediately
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

  // ── Hashed static assets (JS/CSS/fonts) ── Cache-first (hash changes each build)
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

  const title = data.title || 'RallyGo'
  const options = {
    body: data.body || 'New update',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    data: { url: data.url || '/' },
    tag: data.rallyId ? `rally-${data.rallyId}` : 'rallygo',
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
      // If app is already open, focus and navigate it
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client) client.navigate(url)
          return
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
