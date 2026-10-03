import { useEffect, useRef, useState } from 'react'

// Map of the organiser's KMZ / KML route files (one per day is common), each with
// its own on/off switch. Leaflet and JSZip load from the CDN on first use.

export const routeFilesOf = r => (Array.isArray(r?.route_kmz_files) && r.route_kmz_files.length)
  ? r.route_kmz_files
  : (r?.route_kmz_url ? [{ id: 'route', label: 'Route', url: r.route_kmz_url }] : [])

function loadScript(id, src, ready) {
  if (ready()) return Promise.resolve()
  return new Promise((resolve, reject) => {
    let s = document.getElementById(id)
    if (!s) {
      s = document.createElement('script')
      s.id = id
      s.src = src
      document.head.appendChild(s)
    }
    s.addEventListener('load', () => resolve())
    s.addEventListener('error', () => reject(new Error('Could not load the map')))
  })
}

function loadLeaflet() {
  if (!document.getElementById('leaflet-css')) {
    const css = document.createElement('link')
    css.id = 'leaflet-css'
    css.rel = 'stylesheet'
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css'
    document.head.appendChild(css)
  }
  return loadScript('leaflet-js', 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js', () => !!window.L)
}

// KML colours are aabbggrr
function kmlColour(v) {
  const h = (v || '').trim()
  return /^[0-9a-f]{8}$/i.test(h) ? `#${h.slice(6, 8)}${h.slice(4, 6)}${h.slice(2, 4)}` : null
}

function parseKml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const byTag = (el, tag) => [...el.getElementsByTagName(tag)]
  const colours = {}
  byTag(doc, 'Style').forEach(st => {
    const line = st.getElementsByTagName('LineStyle')[0]?.getElementsByTagName('color')[0]?.textContent
    const icon = st.getElementsByTagName('IconStyle')[0]?.getElementsByTagName('color')[0]?.textContent
    const col = kmlColour(line) || kmlColour(icon)
    if (st.getAttribute('id') && col) colours['#' + st.getAttribute('id')] = col
  })
  byTag(doc, 'StyleMap').forEach(sm => {
    const normal = byTag(sm, 'Pair').find(pr => pr.getElementsByTagName('key')[0]?.textContent === 'normal')
    const url = normal?.getElementsByTagName('styleUrl')[0]?.textContent?.trim()
    if (sm.getAttribute('id') && url && colours[url]) colours['#' + sm.getAttribute('id')] = colours[url]
  })
  const coordsOf = el => (el.getElementsByTagName('coordinates')[0]?.textContent || '')
    .trim().split(/\s+/).map(t => t.split(',').map(Number)).filter(p => p.length >= 2 && !isNaN(p[0]) && !isNaN(p[1]))
    .map(([lon, lat]) => [lat, lon])

  const features = []
  byTag(doc, 'Placemark').forEach(pm => {
    const name = pm.getElementsByTagName('name')[0]?.textContent?.trim() || ''
    const styleUrl = pm.getElementsByTagName('styleUrl')[0]?.textContent?.trim()
    const inline = pm.getElementsByTagName('LineStyle')[0]?.getElementsByTagName('color')[0]?.textContent
    const colour = kmlColour(inline) || colours[styleUrl] || null
    byTag(pm, 'LineString').forEach(ls => { const pts = coordsOf(ls); if (pts.length > 1) features.push({ type: 'line', name, colour, pts }) })
    byTag(pm, 'LinearRing').forEach(lr => { const pts = coordsOf(lr); if (pts.length > 1) features.push({ type: 'line', name, colour, pts }) })
    byTag(pm, 'Point').forEach(pt => { const pts = coordsOf(pt); if (pts.length) features.push({ type: 'point', name, colour, pts }) })
  })
  return features
}

async function loadRouteFeatures(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Could not download the route map')
  const buf = await res.arrayBuffer()
  const head = new Uint8Array(buf, 0, 2)
  let text
  if (head[0] === 0x50 && head[1] === 0x4b) {
    await loadScript('jszip-js', 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', () => !!window.JSZip)
    const zip = await window.JSZip.loadAsync(buf)
    const kml = Object.values(zip.files).find(f => !f.dir && /\.kml$/i.test(f.name))
    if (!kml) throw new Error('No map found inside the KMZ file')
    text = await kml.async('text')
  } else {
    text = new TextDecoder().decode(buf)
  }
  return parseKml(text)
}

const escapeHtml = v => String(v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))

export default function RouteMap({ rally }) {
  const files = routeFilesOf(rally)
  const fileKey = files.map(f => f.url).join('|')
  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const meRef = useRef(null)
  const fittedRef = useRef(false)
  const [ready, setReady] = useState(!!window.L)
  const [routes, setRoutes] = useState({}) // url → { features } | { error }
  const [hiddenFiles, setHiddenFiles] = useState([])
  const [locating, setLocating] = useState(false)
  const [mapError, setMapError] = useState(null)

  useEffect(() => {
    loadLeaflet().then(() => setReady(true)).catch(err => setMapError(err.message))
  }, [])

  useEffect(() => {
    let live = true
    setRoutes({})
    fittedRef.current = false
    files.forEach(f => {
      loadRouteFeatures(f.url)
        .then(features => { if (live) setRoutes(r => ({ ...r, [f.url]: { features } })) })
        .catch(err => { if (live) setRoutes(r => ({ ...r, [f.url]: { error: err.message || 'Could not show this file' } })) })
    })
    return () => { live = false }
  }, [fileKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready || !mapEl.current || mapRef.current) return
    const L = window.L
    const map = L.map(mapEl.current).setView([54.5, -3], 6)
    // Free, keyless base maps (CARTO's tiles now need a paid key). Topo shows forest tracks.
    const baseMaps = {
      'Street map': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }),
      'Topo map': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        subdomains: 'abc',
        attribution: '&copy; OpenStreetMap contributors, SRTM | &copy; OpenTopoMap (CC-BY-SA)',
      }),
    }
    baseMaps['Street map'].addTo(map)
    L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map)
    mapRef.current = map
    setTimeout(() => map.invalidateSize(), 60)
    return () => { map.remove(); mapRef.current = null }
  }, [ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !window.L) return
    const L = window.L
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null }
    const features = files.filter(f => !hiddenFiles.includes(f.url)).flatMap(f => routes[f.url]?.features || [])
    if (!features.length) return
    const group = L.featureGroup()
    features.forEach(f => {
      const colour = f.colour || '#E24B4A'
      const layer = f.type === 'line'
        ? L.polyline(f.pts, { color: colour, weight: 4, opacity: 0.85 })
        : L.circleMarker(f.pts[0], { radius: 5, color: '#fff', weight: 2, fillColor: colour, fillOpacity: 1 })
      if (f.name) layer.bindPopup(`<strong>${escapeHtml(f.name)}</strong>`)
      group.addLayer(layer)
    })
    group.addTo(map)
    layerRef.current = group
    if (!fittedRef.current) {
      map.fitBounds(group.getBounds().pad(0.1), { maxZoom: 14 })
      fittedRef.current = true
    }
  }, [routes, hiddenFiles, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  function fitRoute() {
    const map = mapRef.current
    if (map && layerRef.current) map.fitBounds(layerRef.current.getBounds().pad(0.1), { maxZoom: 14 })
  }

  // One-off "where am I" dot — nothing is shared or stored
  function locateMe() {
    if (!navigator.geolocation || !mapRef.current) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(pos => {
      setLocating(false)
      const L = window.L
      const ll = [pos.coords.latitude, pos.coords.longitude]
      if (meRef.current) meRef.current.setLatLng(ll)
      else meRef.current = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).addTo(mapRef.current)
      mapRef.current.setView(ll, Math.max(mapRef.current.getZoom(), 13))
    }, () => setLocating(false), { enableHighAccuracy: true, timeout: 15000 })
  }

  if (!files.length) {
    return <p className="text-white/40 text-sm text-center py-10">The organisers haven't added a route map yet.</p>
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl overflow-hidden border border-white/10 relative" style={{ height: '62vh', minHeight: '340px' }}>
        <div ref={mapEl} className="w-full h-full" />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-rl-card">
            {mapError
              ? <p className="text-white/40 text-sm px-6 text-center">{mapError} — the map needs signal the first time it opens.</p>
              : <div className="w-6 h-6 border-2 border-white/10 border-t-rl-accent rounded-full animate-spin" />}
          </div>
        )}
      </div>

      <div className="flex gap-2 justify-end">
        <button onClick={locateMe} disabled={locating} className="rl-btn-ghost text-xs">{locating ? 'Finding you…' : 'Show where I am'}</button>
        <button onClick={fitRoute} className="rl-btn-ghost text-xs">Fit route</button>
      </div>

      {files.map(file => {
        const r = routes[file.url]
        const features = r?.features || []
        const shown = !hiddenFiles.includes(file.url)
        return (
          <label key={file.url} className="flex items-center justify-between gap-3 bg-rl-card border border-white/10 rounded-xl px-4 py-2.5 cursor-pointer">
            <div className="min-w-0">
              <p className="text-white text-sm truncate">{file.label}</p>
              <p className="text-white/35 text-[11px]">
                {r?.error ? r.error : r ? `${features.filter(f => f.type === 'line').length} lines · ${features.filter(f => f.type === 'point').length} points` : 'Loading…'}
              </p>
            </div>
            {features.length > 0 && (
              <input type="checkbox" checked={shown} className="w-4 h-4 accent-rl-accent flex-shrink-0"
                onChange={e => setHiddenFiles(h => e.target.checked ? h.filter(u => u !== file.url) : [...h, file.url])} />
            )}
          </label>
        )
      })}

      <p className="text-white/25 text-[11px]">Tap a stage line or point to see its name. Route lines are saved for offline use; the background map needs signal.</p>
    </div>
  )
}
