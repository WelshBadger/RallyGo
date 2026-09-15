import { useEffect, useState } from 'react'

// WMO weather code → [label, emoji]
const WMO = {
  0: ['Clear', '☀️'], 1: ['Mainly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'], 48: ['Rime fog', '🌫️'],
  51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Heavy drizzle', '🌧️'],
  56: ['Freezing drizzle', '🌧️'], 57: ['Freezing drizzle', '🌧️'],
  61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'],
  66: ['Freezing rain', '🌧️'], 67: ['Freezing rain', '🌧️'],
  71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'], 77: ['Snow grains', '🌨️'],
  80: ['Rain showers', '🌦️'], 81: ['Rain showers', '🌧️'], 82: ['Violent showers', '⛈️'],
  85: ['Snow showers', '🌨️'], 86: ['Snow showers', '❄️'],
  95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm, hail', '⛈️'], 99: ['Thunderstorm, hail', '⛈️'],
}
const wmo = (c) => WMO[c] || ['—', '🌡️']

// Pull a UK postcode out of a string (most precise location we have)
function ukPostcode(str) {
  if (!str) return null
  const m = String(str).toUpperCase().match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/)
  return m ? m[0].replace(/\s+/g, ' ').trim() : null
}

async function geocode(rally) {
  const regs = rally?.regulations_data || {}
  const pc = ukPostcode(regs.serviceArea) || ukPostcode(rally?.location) || ukPostcode(rally?.custom_location)
  if (pc) {
    try {
      const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc.replace(/\s+/g, ''))}`).then(r => r.json())
      if (r.status === 200 && r.result) {
        return { lat: r.result.latitude, lon: r.result.longitude, label: r.result.admin_ward || r.result.parish || r.result.admin_district || pc, query: pc }
      }
    } catch { /* fall through */ }
  }
  const q = (rally?.location || rally?.custom_location || rally?.name || '').split(',')[0].trim()
  if (q) {
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&country=GB`).then(r => r.json())
      const g = r.results?.[0]
      if (g) return { lat: g.latitude, lon: g.longitude, label: g.name, query: q }
    } catch { /* fall through */ }
  }
  return null
}

function fetchForecast(lat, lon) {
  const p = new URLSearchParams({
    latitude: lat, longitude: lon, timezone: 'Europe/London',
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max',
    forecast_days: '10', wind_speed_unit: 'mph', temperature_unit: 'celsius', precipitation_unit: 'mm',
  })
  return fetch(`https://api.open-meteo.com/v1/forecast?${p}`).then(r => r.json())
}

const dayLabel = (iso) => {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}
const timeAgo = (ts) => {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}

export default function WeatherPanel({ rally }) {
  const key = rally?.id || rally?._packId || rally?.name || 'wx'
  const storeKey = `wx:${key}`
  const [state, setState] = useState(null)   // { place, lat, lon, data, ts }
  const [status, setStatus] = useState('loading') // loading | ready | offline | none
  const [err, setErr] = useState(null)

  const startDate = rally?.date || rally?.custom_date || null
  const endDate = rally?.end_date || rally?.custom_end_date || startDate

  useEffect(() => {
    let cancelled = false
    // 1) show cached immediately (also our offline fallback)
    let cached = null
    try { cached = JSON.parse(localStorage.getItem(storeKey) || 'null') } catch { /* ignore */ }
    if (cached) { setState(cached); setStatus('ready') }

    async function run() {
      try {
        const geo = cached?.lat ? { lat: cached.lat, lon: cached.lon, label: cached.place } : await geocode(rally)
        if (!geo) { if (!cached) setStatus('none'); return }
        const data = await fetchForecast(geo.lat, geo.lon)
        if (cancelled) return
        if (!data?.daily) throw new Error('no data')
        const next = { place: geo.label, lat: geo.lat, lon: geo.lon, data, ts: Date.now() }
        setState(next); setStatus('ready'); setErr(null)
        try { localStorage.setItem(storeKey, JSON.stringify(next)) } catch { /* ignore */ }
      } catch (e) {
        if (cancelled) return
        if (cached) setStatus('offline')       // keep showing last-known
        else { setStatus('offline'); setErr('Could not load the forecast — you may be offline.') }
      }
    }
    run()
    return () => { cancelled = true }
  }, [storeKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'loading') return <p className="text-white/40 text-sm">Loading the forecast…</p>
  if (status === 'none') return (
    <div className="bg-rl-card border border-white/10 rounded-xl p-5">
      <p className="text-white/60 text-sm">No location set for this rally yet, so I can't pull the weather. Add a service-area address or postcode on RallyGo and it'll appear here.</p>
    </div>
  )
  if (!state) return <p className="text-white/40 text-sm">{err || 'No forecast available.'}</p>

  const cur = state.data.current
  const d = state.data.daily
  const [curLabel, curIcon] = wmo(cur?.weather_code)
  const metOffice = 'https://weather.metoffice.gov.uk/'

  const inRally = (iso) => startDate && iso >= startDate && iso <= (endDate || startDate)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-medium">Weather</h2>
          <p className="text-white/35 text-xs mt-0.5">{state.place}{status === 'offline' ? ' · offline' : ''}</p>
        </div>
        <span className="text-white/30 text-[11px]">{status === 'offline' ? `last updated ${timeAgo(state.ts)}` : `updated ${timeAgo(state.ts)}`}</span>
      </div>

      {/* Current conditions */}
      {cur && (
        <div className="bg-rl-card border border-white/10 rounded-2xl p-5 flex items-center gap-4">
          <div className="text-5xl leading-none">{curIcon}</div>
          <div className="flex-1">
            <p className="text-white text-3xl font-semibold leading-tight">{Math.round(cur.temperature_2m)}°C</p>
            <p className="text-white/60 text-sm">{curLabel}{cur.apparent_temperature != null ? ` · feels ${Math.round(cur.apparent_temperature)}°` : ''}</p>
          </div>
          <div className="text-right text-xs text-white/50 space-y-1">
            <p>💨 {Math.round(cur.wind_speed_10m)} mph</p>
            <p>🌧️ {cur.precipitation ?? 0} mm</p>
          </div>
        </div>
      )}

      {/* Daily forecast */}
      <div className="space-y-1.5">
        {d.time.map((iso, i) => {
          const [lab, icon] = wmo(d.weather_code[i])
          const rain = d.precipitation_probability_max?.[i]
          const hl = inRally(iso)
          return (
            <div key={iso}
              className={`flex items-center gap-3 rounded-xl px-4 py-2.5 border ${hl ? 'bg-rl-accent/10 border-rl-accent/40' : 'bg-rl-card border-white/10'}`}>
              <span className="text-2xl w-8 text-center">{icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium">{i === 0 ? 'Today' : dayLabel(iso)}{hl ? ' · rally' : ''}</p>
                <p className="text-white/40 text-xs truncate">{lab}</p>
              </div>
              <div className="text-right text-xs text-white/60 w-16">
                {rain != null && <p className="text-sky-500 font-medium">{rain}% 🌧️</p>}
                <p>💨 {Math.round(d.wind_speed_10m_max[i])}</p>
              </div>
              <div className="text-right w-14">
                <p className="text-white text-sm font-semibold">{Math.round(d.temperature_2m_max[i])}°</p>
                <p className="text-white/40 text-xs">{Math.round(d.temperature_2m_min[i])}°</p>
              </div>
            </div>
          )
        })}
      </div>

      <a href={metOffice} target="_blank" rel="noopener noreferrer"
        className="rl-btn-ghost w-full justify-center text-sm no-underline">
        Full forecast on Met Office →
      </a>
      <p className="text-white/25 text-[11px] text-center">Forecast by Open-Meteo (UK Met Office model)</p>
    </div>
  )
}
