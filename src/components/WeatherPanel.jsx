import { useEffect, useState } from 'react'

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

function ukPostcode(str) {
  if (!str) return null
  const m = String(str).toUpperCase().match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/)
  return m ? m[0].replace(/\s+/g, ' ').trim() : null
}

async function geocode(rally) {
  const regs = rally?.regulations_data || {}
  const pc = ukPostcode(regs.serviceArea) || ukPostcode(rally?.location)
  if (pc) {
    try {
      const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc.replace(/\s+/g, ''))}`).then(r => r.json())
      if (r.status === 200 && r.result) {
        return { lat: r.result.latitude, lon: r.result.longitude, label: r.result.admin_ward || r.result.parish || r.result.admin_district || pc }
      }
    } catch { /* fall through */ }
  }
  const q = (rally?.location || rally?.name || '').split(',')[0].trim()
  if (q) {
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&country=GB`).then(r => r.json())
      const g = r.results?.[0]
      if (g) return { lat: g.latitude, lon: g.longitude, label: g.name }
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

const dayLabel = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

export default function WeatherPanel({ rally }) {
  const storeKey = `wx:${rally?.id || 'rg'}`
  const [state, setState] = useState(null)
  const [status, setStatus] = useState('loading')

  const startDate = rally?.date || null
  const endDate = rally?.end_date || startDate

  useEffect(() => {
    let cancelled = false
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
        setState(next); setStatus('ready')
        try { localStorage.setItem(storeKey, JSON.stringify(next)) } catch { /* ignore */ }
      } catch {
        if (!cancelled && !cached) setStatus('none')
      }
    }
    run()
    return () => { cancelled = true }
  }, [storeKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'loading' || status === 'none' || !state) return null // keep the event page clean if unavailable

  const cur = state.data.current
  const d = state.data.daily
  const [curLabel, curIcon] = wmo(cur?.weather_code)
  const inRally = (iso) => startDate && iso >= startDate && iso <= (endDate || startDate)

  return (
    <section className="mb-6 bg-white rounded-2xl border border-black/10 p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-gray-400 text-[11px] uppercase tracking-widest font-medium">Weather · {state.place}</p>
        <a href="https://weather.metoffice.gov.uk/" target="_blank" rel="noopener noreferrer"
          className="text-xs text-gray-400 hover:text-red-500 no-underline">Met Office →</a>
      </div>

      {cur && (
        <div className="flex items-center gap-4 mb-4">
          <div className="text-5xl leading-none">{curIcon}</div>
          <div className="flex-1">
            <p className="text-gray-900 text-3xl font-semibold leading-tight">{Math.round(cur.temperature_2m)}°C</p>
            <p className="text-gray-500 text-sm">{curLabel}{cur.apparent_temperature != null ? ` · feels ${Math.round(cur.apparent_temperature)}°` : ''}</p>
          </div>
          <div className="text-right text-xs text-gray-500 space-y-1">
            <p>💨 {Math.round(cur.wind_speed_10m)} mph</p>
            <p>🌧️ {cur.precipitation ?? 0} mm</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {d.time.slice(0, 6).map((iso, i) => {
          const [, icon] = wmo(d.weather_code[i])
          const rain = d.precipitation_probability_max?.[i]
          const hl = inRally(iso)
          return (
            <div key={iso} className={`rounded-xl border px-3 py-2.5 text-center ${hl ? 'bg-sky-50 border-sky-300' : 'bg-gray-50 border-black/5'}`}>
              <p className="text-gray-500 text-[11px] font-medium">{i === 0 ? 'Today' : dayLabel(iso)}</p>
              <p className="text-2xl my-0.5">{icon}</p>
              <p className="text-gray-900 text-sm font-semibold">{Math.round(d.temperature_2m_max[i])}° <span className="text-gray-400 font-normal">{Math.round(d.temperature_2m_min[i])}°</span></p>
              {rain != null && <p className="text-sky-600 text-[11px] font-medium">{rain}% 🌧️</p>}
            </div>
          )
        })}
      </div>
      <p className="text-gray-300 text-[11px] text-center mt-3">Forecast by Open-Meteo (UK Met Office model)</p>
    </section>
  )
}
