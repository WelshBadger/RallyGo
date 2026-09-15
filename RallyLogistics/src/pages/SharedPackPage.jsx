import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import WeatherPanel from '../components/WeatherPanel'

// Warm the offline cache with file URLs so documents open with no signal later.
function prefetchFiles(urls) {
  const seen = new Set()
  urls.filter(Boolean).forEach(u => {
    if (typeof u !== 'string' || seen.has(u)) return
    seen.add(u)
    fetch(u, { mode: 'cors' }).catch(() => {})
  })
}
// Open a stored file offline-safely: fetch (from SW cache when offline) and open as a blob URL.
function openFile(url) {
  const w = window.open('', '_blank')
  fetch(url)
    .then(r => r.blob())
    .then(b => { const o = URL.createObjectURL(b); if (w) w.location = o; else window.location.href = o })
    .catch(() => { if (w) w.location = url })
}

// Full-screen zoomable image viewer (pinch, double-tap, drag-to-pan, +/− buttons).
// Needed because the app viewport disables native pinch-zoom (user-scalable=no).
function ImageLightbox({ src, onClose }) {
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const g = useRef({ mode: null, startDist: 0, startScale: 1, startX: 0, startY: 0, startTx: 0, startTy: 0, lastTap: 0 })
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
  function onTouchStart(e) {
    const t = e.touches
    if (t.length === 2) { g.current.mode = 'pinch'; g.current.startDist = dist(t); g.current.startScale = scale }
    else if (t.length === 1) {
      const now = Date.now()
      if (now - g.current.lastTap < 300) { if (scale > 1) { setScale(1); setTx(0); setTy(0) } else setScale(2.5); g.current.lastTap = 0; return }
      g.current.lastTap = now
      g.current.mode = 'pan'; g.current.startX = t[0].clientX; g.current.startY = t[0].clientY; g.current.startTx = tx; g.current.startTy = ty
    }
  }
  function onTouchMove(e) {
    const t = e.touches
    if (g.current.mode === 'pinch' && t.length === 2) { e.preventDefault(); setScale(clamp(g.current.startScale * (dist(t) / g.current.startDist), 1, 6)) }
    else if (g.current.mode === 'pan' && t.length === 1 && scale > 1) { e.preventDefault(); setTx(g.current.startTx + (t[0].clientX - g.current.startX)); setTy(g.current.startTy + (t[0].clientY - g.current.startY)) }
  }
  function reset() { setScale(1); setTx(0); setTy(0) }
  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center overflow-hidden" onClick={() => { if (scale === 1) onClose() }}>
      <img src={src} alt="" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onClick={(e) => e.stopPropagation()}
        style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, touchAction: 'none', transition: g.current.mode ? 'none' : 'transform 0.15s' }}
        className="max-w-full max-h-full object-contain select-none" draggable={false} />
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setScale(s => clamp(s - 0.5, 1, 6))} className="w-11 h-11 rounded-full bg-white/15 text-white text-xl flex items-center justify-center">−</button>
        <button onClick={reset} className="px-4 h-11 rounded-full bg-white/15 text-white text-sm">Reset</button>
        <button onClick={() => setScale(s => clamp(s + 0.5, 1, 6))} className="w-11 h-11 rounded-full bg-white/15 text-white text-xl flex items-center justify-center">+</button>
      </div>
      <button onClick={onClose} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center text-lg">✕</button>
    </div>
  )
}

const SECTIONS = [
  {
    id: 'results', label: 'Results', color: '#eab308', desc: 'Live timing & results', fullWidth: true,
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7"><path fillRule="evenodd" d="M10 1a9 9 0 100 18A9 9 0 0010 1zM5.904 9.458a1 1 0 011.414 0L9 11.14V5a1 1 0 112 0v6.14l1.682-1.682a1 1 0 111.414 1.414l-3.389 3.389a1 1 0 01-1.414 0L5.904 10.872a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
  },
  {
    id: 'entry-list', label: 'Entry List', color: '#06b6d4', desc: 'All competitors',
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/></svg>
  },
  {
    id: 'team', label: 'Team', color: '#3b82f6', desc: 'Mechanics & crew contacts',
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM17.5 17c.28-.32.5-.7.5-1.13C18 13.75 14.42 12 10 12S2 13.75 2 15.87c0 .43.22.81.5 1.13h15z"/></svg>
  },
  {
    id: 'schedule', label: 'Event Schedule', color: '#8b5cf6', desc: 'Day-by-day programme',
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/></svg>
  },
  {
    id: 'rally-schedule', label: 'Rally Schedule', color: '#f97316', desc: 'Road sections & timing',
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7"><path fillRule="evenodd" d="M12 1.586l-4 4v12.828l4-4V1.586zM3.707 3.293A1 1 0 002 4v10a1 1 0 00.293.707L6 18.414V5.586L3.707 3.293zM17.707 5.293L14 1.586v12.828l2.293 2.293A1 1 0 0018 16V6a1 1 0 00-.293-.707z" clipRule="evenodd"/></svg>
  },
  {
    id: 'documents', label: 'Documents', color: '#6366f1', desc: 'Regs, finals & permits',
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/></svg>
  },
  {
    id: 'stages', label: 'Stages', color: '#10b981', desc: 'Stage notes & tyre call',
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7"><path fillRule="evenodd" d="M12 1.586l-4 4v12.828l4-4V1.586zM3.707 3.293A1 1 0 002 4v10a1 1 0 00.293.707L6 18.414V5.586L3.707 3.293zM17.707 5.293L14 1.586v12.828l2.293 2.293A1 1 0 0018 16V6a1 1 0 00-.293-.707z" clipRule="evenodd"/></svg>
  },
  {
    id: 'pre-event', label: 'Pre-event', color: '#f59e0b', desc: 'Sign-on, scrutineering & noise',
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/><path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9.707 5.707a1 1 0 00-1.414-1.414L9 12.586l-1.293-1.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
  },
  {
    id: 'locations', label: 'Locations', color: '#06b6d4', desc: 'Service park, hotel & more',
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/></svg>
  },
  {
    id: 'fuel', label: 'Fuel', color: '#f97316', desc: 'Fuel plan per stage',
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd"/></svg>
  },
  {
    id: 'recce', label: 'Recce', color: '#ec4899', desc: 'Notes from reconnaissance',
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/></svg>
  },
  {
    id: 'car-setup', label: 'Car set-up', color: '#a78bfa', desc: 'Setup sheet & changes during rally',
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/></svg>
  },
  {
    id: 'weather', label: 'Weather', color: '#38bdf8', desc: 'Forecast at the rally',
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7"><path d="M5.5 16a4.5 4.5 0 01-.5-8.973 5 5 0 019.716-1.278A4 4 0 0114.5 16h-9z"/><path d="M13.5 3.5a.75.75 0 011.28-.53l.7.7a.75.75 0 11-1.06 1.06l-.7-.7a.75.75 0 01-.22-.53zM17 7.25a.75.75 0 010 1.5h-1a.75.75 0 010-1.5h1z"/></svg>
  },
]

function fmt(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function SharedPackPage() {
  const { shareCode } = useParams()
  const [pack, setPack] = useState(null)
  const [rally, setRally] = useState(null)
  const [rallyDocs, setRallyDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState(null)

  // Offline: pre-download every file in this pack while there's signal
  useEffect(() => {
    if (!rally && !pack) return
    const urls = []
    const push = arr => (arr || []).forEach(m => urls.push(typeof m === 'string' ? m : m?.url))
    push(rally?.stage_maps); push(rally?.rally_schedule_files)
    urls.push(rally?.route_overview_url, rally?.roadbook_pdf_url, rally?.regulations_pdf_url, rally?.final_instructions_url, rally?.logo_url)
    Object.values(rally?.stage_images || {}).forEach(v => push(v))
    push(pack?.stage_maps); push(pack?.rally_schedule_files); push(pack?.setup_sheet_urls)
    urls.push(pack?.rally_schedule_image_url)
    rallyDocs.forEach(d => urls.push(d.file_url || d.url))
    prefetchFiles(urls)
  }, [rally, pack, rallyDocs])

  // Offline: open Supabase storage files from cache via blob URL
  useEffect(() => {
    function onClick(e) {
      const a = e.target.closest && e.target.closest('a[href]')
      if (!a) return
      const href = a.getAttribute('href') || ''
      if (/supabase\.co\/storage\//.test(href)) { e.preventDefault(); openFile(href) }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  useEffect(() => {
    async function load() {
      const { data: p } = await supabase.from('logistics_packs').select('*').eq('share_code', shareCode).maybeSingle()
      if (!p) { setLoading(false); return }
      if (p.rally_id) {
        const [{ data: r }, { data: docs }] = await Promise.all([
          supabase.from('rallies').select('*').eq('id', p.rally_id).single(),
          supabase.from('rally_documents').select('*').eq('rally_id', p.rally_id).order('created_at', { ascending: true }),
        ])
        setRally(r)
        setRallyDocs(docs || [])
      } else if (p.calendar_event_id) {
        // Calendar-only pack: basic event info, no full rally details
        const { data: cal } = await supabase.from('calendar_events').select('*').eq('id', p.calendar_event_id).single()
        setRally(cal ? { ...cal, id: null } : null)
        setRallyDocs([])
      } else if (p.custom_name) {
        // Crew-added custom rally: info lives on the pack itself
        setRally({ id: null, name: p.custom_name, date: p.custom_date, end_date: p.custom_end_date, location: p.custom_location })
        setRallyDocs([])
      }
      setPack(p)
      setLoading(false)
    }
    load()
  }, [shareCode])

  if (loading) return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
      <div className="h-20 bg-white/5 rounded-2xl animate-pulse" />
      <div className="h-64 bg-white/5 rounded-xl animate-pulse" />
    </div>
  )
  if (!pack || !rally) return <div className="text-center py-16 text-white/30">Pack not found.</div>

  const fi = rally.final_instructions_data || {}
  const regs = rally.regulations_data || {}
  const stages = regs.stages?.length > 0
    ? regs.stages
    : (regs.stageCount > 0
        ? Array.from({ length: parseInt(regs.stageCount, 10) || 0 }, (_, i) => ({ number: i + 1, name: `SS${i + 1}`, distance: '' }))
        : (pack?.fuel_schedule?.filter(f => f.stage != null && f.id !== 'start' && !String(f.id || '').startsWith('refuel'))
            .map(f => ({ number: f.stage, name: f.name, distance: f.distance })) || []))
  const carNumber = pack.car_number || ''

  return (
    <main className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs text-white/25 bg-white/5 px-2 py-0.5 rounded-full">Team view · read-only</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-start gap-3 min-w-0">
            {rally.logo_url && (
              <img src={rally.logo_url} alt="" className="w-12 h-12 rounded-xl object-contain bg-white/5 border border-white/10 flex-shrink-0" />
            )}
            <div className="min-w-0">
              {rally.series && <p className="text-white/30 text-xs mb-1">{rally.series}</p>}
              <h1 className="text-xl font-semibold text-white">{rally.name}</h1>
              <p className="text-white/40 text-sm mt-0.5">{fmt(rally.date)}{rally.end_date && rally.end_date !== rally.date ? ` – ${fmt(rally.end_date)}` : ''}{rally.location && ` · ${rally.location}`}</p>
            </div>
          </div>
          {carNumber && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-cyan-500/12 border-cyan-500/30 text-cyan-400 text-sm font-medium flex-shrink-0">
              <span className="text-white/40 text-[10px] font-normal">Car</span><span className="font-bold">#{carNumber}</span>
            </div>
          )}
        </div>
      </div>

      {/* Tile grid — home dashboard */}
      {!tab && (
        <div className="grid grid-cols-2 gap-3">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setTab(s.id)}
              style={{ background: s.color + '18', borderColor: s.color + '45' }}
              className={`border rounded-2xl p-5 text-left flex transition-all hover:scale-[1.02] active:scale-[0.98] ${
                s.fullWidth
                  ? 'col-span-2 flex-row items-center gap-5 min-h-[90px]'
                  : 'flex-col justify-between min-h-[140px]'
              }`}
            >
              <div style={{ color: s.color }} className={s.fullWidth ? 'flex-shrink-0' : ''}>{s.icon}</div>
              <div className={s.fullWidth ? 'flex-1' : ''}>
                <p className={`text-white font-semibold leading-tight ${s.fullWidth ? 'text-xl' : 'text-base'}`}>{s.label}</p>
                <p className="text-white/40 text-xs mt-1 leading-snug">{s.desc}</p>
              </div>
              {s.fullWidth && (
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5 flex-shrink-0" style={{ color: s.color + 'aa' }}>
                  <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.75a.75.75 0 010-1.5h7.44L8.22 4.03a.75.75 0 010-1.06z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
          {rally.sportity_url && (
            <a
              href={rally.sportity_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ background: '#E24B4A18', borderColor: '#E24B4A45' }}
              className="col-span-2 border rounded-2xl p-5 text-left flex flex-row items-center gap-5 min-h-[90px] transition-all hover:scale-[1.02] active:scale-[0.98] no-underline"
            >
              <div className="flex-shrink-0" style={{ color: '#E24B4A' }}>
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7">
                  <path fillRule="evenodd" d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h.28l1.771 5.316A1 1 0 008 18h1a1 1 0 001-1v-4.382l6.553 3.276A1 1 0 0018 15V3z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-white font-semibold leading-tight text-xl">Live Bulletins</p>
                <p className="text-white/40 text-xs mt-1 leading-snug">Official bulletins via Sportity</p>
              </div>
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5 flex-shrink-0" style={{ color: '#E24B4Aaa' }}>
                <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.75a.75.75 0 010-1.5h7.44L8.22 4.03a.75.75 0 010-1.06z" clipRule="evenodd" />
              </svg>
            </a>
          )}
        </div>
      )}

      {/* Section view */}
      {tab && (
        <>
          <button
            onClick={() => setTab(null)}
            className="w-full flex items-center gap-3 px-4 py-4 mb-5 bg-white/10 hover:bg-white/15 border border-white/20 hover:border-white/35 rounded-2xl transition-all text-left active:scale-[0.98]"
          >
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" viewBox="0 0 16 16" fill="currentColor">
                <path fillRule="evenodd" d="M7.78 12.53a.75.75 0 01-1.06 0L2.47 8.28a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 1.06L4.81 7h7.44a.75.75 0 010 1.5H4.81l2.97 2.97a.75.75 0 010 1.06z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className="text-white/50 text-xs font-medium">Back to overview</p>
              <p className="text-white font-semibold text-base leading-tight">{rally.name}</p>
            </div>
          </button>
          {(() => {
            const s = SECTIONS.find(x => x.id === tab)
            return s ? (
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: s.color + '20', color: s.color }}>
                  <div className="w-5 h-5 [&>svg]:w-5 [&>svg]:h-5">{s.icon}</div>
                </div>
                <h2 className="text-white font-semibold text-lg">{s.label}</h2>
              </div>
            ) : null
          })()}
          {tab === 'results'       && <SharedResults url={pack.results_url} />}
          {tab === 'entry-list'    && <SharedEntryList entries={rally.entry_list_data || []} carNumber={carNumber} />}
          {tab === 'team'          && <SharedTeam members={pack.team_members || []} />}
          {tab === 'schedule'      && <SharedSchedule pack={pack} fi={fi} />}
          {tab === 'rally-schedule'&& <SharedRallySchedule rows={pack.rally_schedule || []} carNumber={carNumber} imageUrl={pack.rally_schedule_image_url} orgFiles={rally?.rally_schedule_files || []} crewFiles={pack.rally_schedule_files || []} />}
          {tab === 'documents'     && <SharedDocuments rally={rally} docs={rallyDocs} />}
          {tab === 'stages'        && <SharedStages pack={pack} stages={stages} rally={rally} />}
          {tab === 'pre-event'     && <SharedPreEvent fi={fi} />}
          {tab === 'locations'     && <SharedLocations locations={pack.locations || {}} />}
          {tab === 'fuel'          && <SharedFuel pack={pack} />}
          {tab === 'recce'         && <SharedRecce notes={pack.recce_notes || {}} stages={stages} />}
          {tab === 'car-setup'     && <SharedCarSetup images={pack.setup_sheet_urls || []} changes={pack.setup_changes || ''} />}
          {tab === 'weather'       && <WeatherPanel rally={rally} />}
        </>
      )}
    </main>
  )
}

// ─── Results ─────────────────────────────────────────────────────────────────

function SharedResults({ url }) {
  const [iframeError, setIframeError] = useState(false)
  if (!url) return <p className="text-white/30 text-sm text-center py-16 bg-rl-card border border-white/8 rounded-xl">No results link set yet.</p>
  return (
    <div className="space-y-3">
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="flex items-center justify-between bg-rl-card border border-white/10 rounded-xl px-4 py-3 no-underline hover:border-white/20 transition-all">
        <span className="text-white text-sm font-medium truncate">Open results in new tab</span>
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-white/30 flex-shrink-0">
          <path fillRule="evenodd" d="M4.22 11.78a.75.75 0 010-1.06L9.44 5.5H5.75a.75.75 0 010-1.5h5.5a.75.75 0 01.75.75v5.5a.75.75 0 01-1.5 0V6.56l-5.22 5.22a.75.75 0 01-1.06 0z" clipRule="evenodd"/>
        </svg>
      </a>
      {!iframeError && (
        <div className="bg-rl-card border border-white/10 rounded-xl overflow-hidden">
          <iframe src={url} title="Results" className="w-full h-[70vh] bg-white" onError={() => setIframeError(true)} />
        </div>
      )}
    </div>
  )
}

// ─── Entry List ──────────────────────────────────────────────────────────────

function SharedEntryList({ entries, carNumber }) {
  const [search, setSearch] = useState('')

  const filtered = entries.filter(e => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      String(e.car).toLowerCase().includes(q) ||
      e.driver?.toLowerCase().includes(q) ||
      e.codriver?.toLowerCase().includes(q) ||
      e.vehicle?.toLowerCase().includes(q) ||
      e.class?.toLowerCase().includes(q)
    )
  })

  if (entries.length === 0) {
    return (
      <div className="text-center py-16 bg-rl-card border border-white/8 rounded-xl">
        <p className="text-white/30 text-sm">Entry list will appear here once the organiser uploads it.</p>
      </div>
    )
  }

  const myEntry = carNumber ? entries.find(e => String(e.car) === String(carNumber)) : null

  return (
    <div className="space-y-4">
      {myEntry && (
        <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-4">
          <p className="text-cyan-400 text-[11px] uppercase tracking-widest font-semibold mb-2">Our entry</p>
          <div className="flex items-center gap-4">
            <span className="text-cyan-400 font-bold text-3xl leading-none">#{myEntry.car}</span>
            <div>
              <p className="text-white font-semibold">{myEntry.driver}</p>
              {myEntry.codriver && <p className="text-white/60 text-sm">{myEntry.codriver}</p>}
              <p className="text-white/40 text-xs mt-0.5">{myEntry.vehicle}{myEntry.class ? ` · ${myEntry.class}` : ''}</p>
            </div>
          </div>
        </div>
      )}

      <div className="relative">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search driver, car #, vehicle…"
          className="rl-input w-full pl-9 text-sm"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/>
        </svg>
      </div>

      <p className="text-white/25 text-xs">{filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}</p>

      <div className="bg-rl-card border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
        {filtered.map((e, i) => {
          const isUs = carNumber && String(e.car) === String(carNumber)
          return (
            <div key={i} className={`px-4 py-3 flex items-center gap-3 ${isUs ? 'bg-cyan-500/8' : ''}`}>
              <span className={`font-bold text-sm w-8 text-center flex-shrink-0 tabular-nums ${isUs ? 'text-cyan-400' : 'text-rl-accent'}`}>
                {e.car}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-white text-sm font-medium truncate">{e.driver}</p>
                  {isUs && <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">Us</span>}
                </div>
                {e.codriver && <p className="text-white/50 text-xs truncate">{e.codriver}</p>}
              </div>
              <div className="text-right flex-shrink-0 max-w-[35%]">
                {e.vehicle && <p className="text-white/55 text-xs leading-tight truncate">{e.vehicle}</p>}
                {e.class && <span className="text-[10px] bg-white/8 text-white/45 px-1.5 py-0.5 rounded font-mono mt-0.5 inline-block">{e.class}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Documents ───────────────────────────────────────────────────────────────

function SharedDocuments({ rally, docs }) {
  const regsUrl = rally?.regulations_pdf_url
  const fiUrl = rally?.final_instructions_pdf_url
  const roadbookUrl = rally?.roadbook_pdf_url
  const hasAnything = regsUrl || fiUrl || roadbookUrl || docs?.length > 0

  if (!hasAnything) {
    return (
      <div className="text-center py-16 bg-rl-card border border-white/8 rounded-xl">
        <p className="text-white/30 text-sm">Documents will appear here once the organiser uploads them.</p>
      </div>
    )
  }

  function docLabel(doc) {
    const map = { 'pre-event': 'Pre-event', 'route': 'Route', 'bulletins': 'Bulletin', 'documents': 'Document' }
    return map[doc.section] || doc.section || 'Document'
  }

  const DocIcon = () => (
    <div className="w-9 h-9 rounded-lg bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-indigo-400">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/>
      </svg>
    </div>
  )
  const OpenIcon = () => (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-white/25 group-hover:text-white/50 flex-shrink-0">
      <path fillRule="evenodd" d="M4.22 11.78a.75.75 0 010-1.06L9.44 5.5H5.75a.75.75 0 010-1.5h5.5a.75.75 0 01.75.75v5.5a.75.75 0 01-1.5 0V6.56l-5.22 5.22a.75.75 0 01-1.06 0z" clipRule="evenodd"/>
    </svg>
  )

  return (
    <div className="space-y-3">
      {regsUrl && (
        <a href={regsUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-4 bg-rl-card border border-white/10 rounded-xl px-4 py-3.5 no-underline hover:border-white/20 transition-all group">
          <DocIcon />
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium text-sm">Regulations</p>
            <p className="text-white/35 text-xs">PDF</p>
          </div>
          <OpenIcon />
        </a>
      )}
      {fiUrl && (
        <a href={fiUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-4 bg-rl-card border border-white/10 rounded-xl px-4 py-3.5 no-underline hover:border-white/20 transition-all group">
          <DocIcon />
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium text-sm">Final Instructions</p>
            <p className="text-white/35 text-xs">PDF</p>
          </div>
          <OpenIcon />
        </a>
      )}
      {roadbookUrl && (
        <a href={roadbookUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-4 bg-rl-card border border-white/10 rounded-xl px-4 py-3.5 no-underline hover:border-white/20 transition-all group">
          <DocIcon />
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium text-sm">Roadbook</p>
            <p className="text-white/35 text-xs">PDF</p>
          </div>
          <OpenIcon />
        </a>
      )}
      {docs?.map((doc, i) => (
        <a key={i} href={doc.url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-4 bg-rl-card border border-white/10 rounded-xl px-4 py-3.5 no-underline hover:border-white/20 transition-all group">
          <DocIcon />
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium text-sm truncate">{doc.title || doc.filename || 'Document'}</p>
            <p className="text-white/35 text-xs">{docLabel(doc)}</p>
          </div>
          <OpenIcon />
        </a>
      ))}
    </div>
  )
}

// ─── Team ────────────────────────────────────────────────────────────────────

function SharedTeam({ members }) {
  if (!members.length) return <p className="text-white/30 text-sm">No team members added yet.</p>
  return (
    <div className="space-y-2">
      {members.map((m, i) => {
        const tel = m.phone ? m.phone.replace(/\s+/g, '') : ''
        return (
          <div key={i} className="bg-rl-card border border-white/10 rounded-xl px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-sm">{m.name || '—'}</p>
                {m.role && <p className="text-white/50 text-xs">{m.role}</p>}
                {m.notes && <p className="text-white/35 text-xs mt-0.5">{m.notes}</p>}
              </div>
            </div>
            {m.phone && (
              <div className="flex items-center gap-2 mt-3">
                <a href={`tel:${tel}`} className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-green-500/12 text-green-600 border border-green-500/25 no-underline hover:bg-green-500/20 transition-colors">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/>
                  </svg>
                  Call
                </a>
                <a href={`sms:${tel}`} className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-blue-500/12 text-blue-600 border border-blue-500/25 no-underline hover:bg-blue-500/20 transition-colors">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7z" clipRule="evenodd"/>
                  </svg>
                  Message
                </a>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Event Schedule ──────────────────────────────────────────────────────────

function planSortKey(s) {
  return `${s.date || '9999-99-99'} ${s.time || '99:99'}`
}
function fmtPlanDate(d) {
  if (!d) return 'No date yet'
  const dt = new Date(`${d}T00:00:00`)
  if (Number.isNaN(dt.getTime())) return d
  return dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
}

function SharedSchedule({ pack, fi }) {
  const [view, setView] = useState(null)
  const schedule = fi?.schedule || []
  const steps = Array.isArray(pack.team_plan) ? pack.team_plan : []
  const doneCount = steps.filter(s => s.done).length

  if (!schedule.length && !pack.schedule_notes && !steps.length) {
    return <p className="text-white/30 text-sm">No schedule available yet.</p>
  }

  const back = (
    <button onClick={() => setView(null)}
      className="flex items-center gap-2 text-white/50 hover:text-white text-xs font-medium transition-colors">
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
        <path fillRule="evenodd" d="M7.78 12.53a.75.75 0 01-1.06 0L2.47 8.28a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 1.06L4.81 7h7.44a.75.75 0 010 1.5H4.81l2.97 2.97a.75.75 0 010 1.06z" clipRule="evenodd" />
      </svg>
      Event schedule
    </button>
  )

  if (view === 'official') {
    return (
      <div className="space-y-4">
        {back}
        {schedule.length > 0 && (
          <div className="bg-rl-card border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
            {schedule.map((item, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-white/35 text-xs">{item.day}</span>
                  {item.time && <span className="text-rl-accent font-mono text-xs">{item.time}</span>}
                </div>
                <p className="text-white text-sm mt-0.5">{item.event}</p>
              </div>
            ))}
          </div>
        )}
        {pack.schedule_notes && (
          <div className="bg-rl-card border border-white/10 rounded-xl p-4">
            <p className="text-white/40 text-xs uppercase tracking-wide mb-2">Schedule notes</p>
            <pre className="text-white/70 text-sm whitespace-pre-wrap font-sans">{pack.schedule_notes}</pre>
          </div>
        )}
      </div>
    )
  }

  if (view === 'team') {
    const sorted = [...steps].sort((a, b) => planSortKey(a).localeCompare(planSortKey(b)))
    const groups = []
    sorted.forEach(s => {
      const last = groups[groups.length - 1]
      if (last && last.date === (s.date || '')) last.items.push(s)
      else groups.push({ date: s.date || '', items: [s] })
    })
    return (
      <div className="space-y-4">
        {back}
        {sorted.length === 0
          ? <p className="text-white/30 text-sm">No team actions planned yet.</p>
          : groups.map(g => (
            <div key={g.date || 'undated'}>
              <p className="text-white/40 text-xs font-medium mb-2 px-0.5">{fmtPlanDate(g.date)}</p>
              <div className="space-y-2">
                {g.items.map(s => (
                  <div key={s.id} className={`bg-rl-card border border-white/10 rounded-xl px-4 py-3 ${s.done ? 'opacity-60' : ''}`}>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-rl-accent font-mono text-xs">{s.time || '--:--'}</span>
                      <span className={`text-white text-sm font-medium ${s.done ? 'line-through' : ''}`}>{s.label}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      {s.who
                        ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/12 text-blue-400 border border-blue-500/25">{s.who}</span>
                        : <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-white/35 border border-white/10">Unassigned</span>}
                      {s.done && <span className="text-[11px] text-green-500">Done</span>}
                    </div>
                    {s.notes && <p className="text-white/45 text-xs mt-1">{s.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <button onClick={() => setView('official')}
        className="text-left bg-rl-card border border-white/10 hover:border-white/25 rounded-2xl p-4 transition-all active:scale-[0.98]">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: '#8b5cf620', color: '#8b5cf6' }}>
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M6 2a1 1 0 011 1v1h6V3a1 1 0 112 0v1h1a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2h1V3a1 1 0 011-1zM4 8v8h12V8H4z" clipRule="evenodd"/>
          </svg>
        </div>
        <p className="text-white font-semibold text-sm leading-tight">Official event schedule</p>
        <p className="text-white/45 text-xs mt-1 line-clamp-2">{schedule.length ? `${schedule.length} items` : 'From the organiser'}</p>
      </button>

      <button onClick={() => setView('team')}
        className="text-left bg-rl-card border border-white/10 hover:border-white/25 rounded-2xl p-4 transition-all active:scale-[0.98]">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: '#10b98120', color: '#10b981' }}>
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M6.267 3.455a3.07 3.07 0 001.745-.723 3.07 3.07 0 013.976 0 3.07 3.07 0 001.745.723 3.07 3.07 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.07 3.07 0 010 3.976 3.07 3.07 0 00-.723 1.745 3.07 3.07 0 01-2.812 2.812 3.07 3.07 0 00-1.745.723 3.07 3.07 0 01-3.976 0 3.07 3.07 0 00-1.745-.723 3.07 3.07 0 01-2.812-2.812 3.07 3.07 0 00-.723-1.745 3.07 3.07 0 010-3.976 3.07 3.07 0 00.723-1.745 3.07 3.07 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
          </svg>
        </div>
        <p className="text-white font-semibold text-sm leading-tight">Team logistics</p>
        <p className="text-white/45 text-xs mt-1 line-clamp-2">{steps.length ? `${doneCount}/${steps.length} done` : 'Step-by-step plan'}</p>
      </button>
    </div>
  )
}

// ─── Stages ──────────────────────────────────────────────────────────────────

function SharedStages({ pack, stages, rally }) {
  const notes = pack.stage_notes || {}
  const [lightbox, setLightbox] = useState(null)
  const routeOverview = rally?.route_overview_url
  const stageImages = rally?.stage_images || {}
  const stageMaps = rally?.stage_maps || []
  const crewMaps = pack?.stage_maps || []
  if (!stages.length && !routeOverview && stageMaps.length === 0 && crewMaps.length === 0) return <p className="text-white/30 text-sm">No stage info yet.</p>
  return (
    <div className="space-y-2">
      {routeOverview && (
        <div className="space-y-2 mb-2">
          <p className="text-white/50 text-xs uppercase tracking-widest font-semibold">Route overview</p>
          <button onClick={() => setLightbox(routeOverview)} className="w-full">
            <img src={routeOverview} alt="Route overview" className="w-full rounded-xl border border-white/10 object-cover" />
          </button>
        </div>
      )}
      {stageMaps.length > 0 && (
        <div className="space-y-2 mb-2">
          <p className="text-white/50 text-xs uppercase tracking-widest font-semibold">Stage maps & route</p>
          {stageMaps.map(m => (
            m.type === 'image' ? (
              <button key={m.id} onClick={() => setLightbox(m.url)} className="w-full text-left">
                <div className="bg-rl-card border border-white/10 rounded-xl overflow-hidden">
                  <img src={m.url} alt={m.label} className="w-full object-cover" />
                  <p className="text-white text-sm font-medium px-3 py-2">{m.label}</p>
                </div>
              </button>
            ) : (
              <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 bg-rl-card border border-white/10 rounded-xl px-4 py-3 no-underline hover:border-white/20 transition-all">
                <div className="w-9 h-9 rounded-lg bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-indigo-400"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{m.label}</p>
                  <p className="text-white/35 text-xs">PDF · tap to open</p>
                </div>
              </a>
            )
          ))}
        </div>
      )}
      {crewMaps.filter(m => !m.stage).length > 0 && (
        <div className="space-y-2 mb-2">
          <p className="text-white/50 text-xs uppercase tracking-widest font-semibold">Crew maps</p>
          {crewMaps.filter(m => !m.stage).map(m => (
            m.type === 'image' ? (
              <button key={m.id} onClick={() => setLightbox(m.url)} className="w-full text-left">
                <div className="bg-rl-card border border-white/10 rounded-xl overflow-hidden">
                  <img src={m.url} alt={m.label} className="w-full object-cover" />
                  <p className="text-white text-sm font-medium px-3 py-2">{m.label}</p>
                </div>
              </button>
            ) : (
              <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 bg-rl-card border border-white/10 rounded-xl px-4 py-3 no-underline hover:border-white/20 transition-all">
                <div className="w-9 h-9 rounded-lg bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-indigo-400"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/></svg>
                </div>
                <div className="flex-1 min-w-0"><p className="text-white text-sm font-medium truncate">{m.label}</p><p className="text-white/35 text-xs">PDF · tap to open</p></div>
              </a>
            )
          ))}
        </div>
      )}
      {stages.map(s => {
        const imgs = stageImages[s.number] || stageImages[String(s.number)] || []
        const myMaps = crewMaps.filter(m => String(m.stage) === String(s.number))
        return (
          <div key={s.number} className="bg-rl-card border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-rl-accent font-bold text-base w-10 text-center">SS{s.number}</span>
              <div><p className="text-white font-medium text-sm">{s.name}</p>{s.distance && <p className="text-white/30 text-xs">{s.distance}</p>}</div>
            </div>
            {imgs.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {imgs.map((url, i) => (
                  <button key={i} onClick={() => setLightbox(url)} className="w-full">
                    <img src={url} alt={`SS${s.number} map ${i + 1}`} className="w-full aspect-square object-cover rounded-lg border border-white/10" />
                  </button>
                ))}
              </div>
            )}
            {myMaps.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {myMaps.map(m => (
                  m.type === 'image' ? (
                    <button key={m.id} onClick={() => setLightbox(m.url)} className="w-full">
                      <img src={m.url} alt={m.label} className="w-full rounded-lg border border-white/10 object-cover" />
                    </button>
                  ) : (
                    <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 no-underline">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-indigo-400 flex-shrink-0"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"/></svg>
                      <span className="text-white text-xs font-medium truncate">{m.label}</span>
                    </a>
                  )
                ))}
              </div>
            )}
            {notes[s.number] && <p className="text-white/60 text-sm bg-white/3 rounded-lg px-3 py-2 mt-1">{notes[s.number]}</p>}
          </div>
        )
      })}
      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}

// ─── Pre-event ───────────────────────────────────────────────────────────────

function SharedPreEvent({ fi }) {
  const noiseLimit = fi?.noiseLimit
  const signingOn = fi?.signingOn || []
  const scrutineering = fi?.scrutineering || []
  if (!fi || Object.keys(fi).length === 0) return <p className="text-white/30 text-sm">Pre-event information not yet available.</p>
  return (
    <div className="space-y-5">
      {noiseLimit && (
        <div className="bg-rl-card border border-rl-accent/25 rounded-xl p-5">
          <p className="text-rl-accent text-[11px] uppercase tracking-widest font-semibold mb-1">Noise limit</p>
          <p className="text-white text-3xl font-bold">{noiseLimit}</p>
        </div>
      )}
      {signingOn.length > 0 && (
        <div>
          <h3 className="text-white/50 text-xs uppercase tracking-wide mb-2">Signing on</h3>
          <div className="bg-rl-card border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
            {signingOn.map((row, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white text-sm">{row.carRange || row.cars || '-'}</span>
                  <span className="text-rl-accent font-mono text-sm flex-shrink-0">{row.time || '-'}</span>
                </div>
                {row.location && <p className="text-white/50 text-xs mt-0.5">{row.location}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
      {scrutineering.length > 0 && (
        <div>
          <h3 className="text-white/50 text-xs uppercase tracking-wide mb-2">Scrutineering</h3>
          <div className="bg-rl-card border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
            {scrutineering.map((row, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white text-sm">{row.carRange || row.cars || '-'}</span>
                  <span className="text-rl-accent font-mono text-sm flex-shrink-0">{row.time || '-'}</span>
                </div>
                {row.location && <p className="text-white/50 text-xs mt-0.5">{row.location}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Rally Schedule ──────────────────────────────────────────────────────────

function addMinutesToTime(time, mins) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((time || '').trim())
  if (!m || !mins) return null
  const total = ((parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + mins) % 1440 + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function SharedRallySchedule({ rows, carNumber, imageUrl, orgFiles = [], crewFiles = [] }) {
  const [lightbox, setLightbox] = useState(false)
  const [orgLb, setOrgLb] = useState(null)
  const carNum = parseInt(carNumber, 10)
  const ourOffset = !isNaN(carNum) && carNum > 0 ? carNum - 1 : null

  if (!rows.length && !imageUrl && orgFiles.length === 0 && crewFiles.length === 0) return <p className="text-white/30 text-sm text-center py-16 bg-rl-card border border-white/8 rounded-xl">No rally schedule yet.</p>

  return (
    <div className="space-y-2">
      {orgFiles.length > 0 && (
        <div className="space-y-2 mb-2">
          <p className="text-white/50 text-xs uppercase tracking-widest font-semibold">Official schedule</p>
          {orgFiles.map(m => (
            m.type === 'image' ? (
              <button key={m.id} onClick={() => setOrgLb(m.url)} className="w-full text-left">
                <div className="bg-rl-card border border-white/10 rounded-xl overflow-hidden">
                  <img src={m.url} alt={m.label} className="w-full object-cover" />
                  <p className="text-white text-sm font-medium px-3 py-2">{m.label}</p>
                </div>
              </button>
            ) : (
              <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 bg-rl-card border border-white/10 rounded-xl px-4 py-3 no-underline hover:border-white/20 transition-all">
                <div className="w-9 h-9 rounded-lg bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-indigo-400"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{m.label}</p>
                  <p className="text-white/35 text-xs">PDF · tap to open</p>
                </div>
              </a>
            )
          ))}
        </div>
      )}
      {orgLb && <ImageLightbox src={orgLb} onClose={() => setOrgLb(null)} />}
      {imageUrl && (
        <div className="mb-2">
          {/\.pdf(\?|$)/i.test(imageUrl) ? (
            <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 bg-rl-card border border-white/10 rounded-xl px-4 py-3 no-underline hover:border-white/20 transition-all">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-indigo-400 flex-shrink-0"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"/></svg>
              <span className="text-white text-sm font-medium">Schedule PDF · tap to open</span>
            </a>
          ) : (
            <button onClick={() => setLightbox(true)} className="w-full">
              <img src={imageUrl} alt="Rally schedule" className="w-full rounded-xl border border-white/10" />
            </button>
          )}
        </div>
      )}
      {lightbox && imageUrl && !/\.pdf(\?|$)/i.test(imageUrl) && (
        <ImageLightbox src={imageUrl} onClose={() => setLightbox(false)} />
      )}
      {crewFiles.length > 0 && (
        <div className="space-y-2 mb-2">
          {crewFiles.map(m => (
            m.type === 'image' ? (
              <button key={m.id} onClick={() => setOrgLb(m.url)} className="w-full text-left">
                <div className="bg-rl-card border border-white/10 rounded-xl overflow-hidden">
                  <img src={m.url} alt={m.label} className="w-full object-cover" />
                  <p className="text-white text-sm font-medium px-3 py-2">{m.label}</p>
                </div>
              </button>
            ) : (
              <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 bg-rl-card border border-white/10 rounded-xl px-4 py-3 no-underline hover:border-white/20 transition-all">
                <div className="w-9 h-9 rounded-lg bg-indigo-500/15 flex items-center justify-center flex-shrink-0"><svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-indigo-400"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"/></svg></div>
                <div className="flex-1 min-w-0"><p className="text-white text-sm font-medium truncate">{m.label}</p><p className="text-white/35 text-xs">PDF · tap to open</p></div>
              </a>
            )
          ))}
        </div>
      )}
      {ourOffset !== null && rows.length > 0 && (
        <p className="text-white/30 text-xs mb-1">"Us" estimates car #{carNum} at 1-min intervals (+{ourOffset} min after first car)</p>
      )}
      {rows.map((r, i) => {
        const ourTime = ourOffset !== null ? addMinutesToTime(r.firstCar, ourOffset) : null
        return (
          <div key={r.id || i} className="bg-rl-card border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between gap-3 mb-1">
              <span className="text-rl-accent font-bold text-sm">{r.control || '—'}</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                {r.firstCar && <span className="text-white/50 text-xs font-mono">1st: {r.firstCar}</span>}
                {ourTime && <span className="text-cyan-400 text-xs font-mono bg-cyan-500/10 border border-cyan-500/25 rounded-lg px-2 py-0.5">Us: {ourTime}</span>}
              </div>
            </div>
            <div className="text-xs space-y-0.5">
              {r.location && <p className="text-white/70">{r.location}{r.distance ? ` · ${r.distance} mi` : ''}</p>}
              {r.notes && <p className="text-white/40">{r.notes}</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Fuel ────────────────────────────────────────────────────────────────────

function SharedFuel({ pack }) {
  const rows = pack?.fuel_schedule || []
  const start = rows.find(r => r.id === 'start')
  const refuels = rows.filter(r => r.id !== 'start')
  const gaugeTotal = rows.reduce((s, r) => s + (parseFloat(r.fuel) || 0), 0)
  const reserveL = parseFloat(pack?.fuel_reserve) || 0
  const refuelCount = refuels.filter(r => (parseFloat(r.fuel) || 0) > 0).length
  const projectedTotal = gaugeTotal - reserveL * refuelCount

  if (!rows.length) return <p className="text-white/30 text-sm">No fuel plan yet.</p>

  const Card = ({ label, r, gauge }) => (
    <div className="bg-rl-card border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-white font-medium text-sm">{label}</p>
        {r.fuel && <span className="text-rl-accent font-bold">{parseFloat(r.fuel).toFixed(1)} L</span>}
      </div>
      <div className="space-y-1 text-xs">
        {gauge && r.fuel && <p className="text-white/35">Litres showing on gauge</p>}
        {r.location && <p className="text-white/60">📍 {r.location}</p>}
        {r.notes && <p className="text-white/40">{r.notes}</p>}
      </div>
    </div>
  )

  return (
    <div className="space-y-3">
      {reserveL > 0 && (
        <div className="bg-rl-card border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-white/60 text-sm">Reserve in tank</span>
          <span className="text-white font-medium text-sm">{reserveL.toFixed(1)} L</span>
        </div>
      )}
      {gaugeTotal > 0 && (
        <div className="bg-rl-accent/10 border border-rl-accent/25 rounded-xl px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-white/60 text-sm">Total projected fuel</span>
            <span className="text-rl-accent font-bold text-xl">{projectedTotal.toFixed(1)} L</span>
          </div>
          {reserveL > 0 && refuelCount > 0 && (
            <p className="text-white/30 text-xs mt-1 text-right">{gaugeTotal.toFixed(1)} L on gauges − {refuelCount} × {reserveL.toFixed(1)} L reserve</p>
          )}
        </div>
      )}
      {start && <Card label="Fuel at start" r={start} />}
      {refuels.map((r, i) => <Card key={r.id || i} label={r.label || `Refuel ${i + 1}`} r={r} gauge />)}
    </div>
  )
}

// ─── Recce ───────────────────────────────────────────────────────────────────

function SharedRecce({ notes, stages }) {
  if (!stages.length) {
    return notes.general ? <pre className="text-white/60 text-sm whitespace-pre-wrap font-sans">{notes.general}</pre> : <p className="text-white/30 text-sm">No recce notes yet.</p>
  }
  return (
    <div className="space-y-2">
      {stages.map(s => (
        <div key={s.number} className="bg-rl-card border border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-rl-accent font-bold">SS{s.number}</span>
            <span className="text-white text-sm">{s.name}</span>
            {s.distance && <span className="text-white/30 text-xs">{s.distance}</span>}
          </div>
          {notes[s.number] ? <p className="text-white/60 text-sm">{notes[s.number]}</p> : <p className="text-white/20 text-xs italic">No notes</p>}
        </div>
      ))}
    </div>
  )
}

// ─── Locations ───────────────────────────────────────────────────────────────

const LOCATION_META = [
  { key: 'hotel',       label: 'Accommodation',         color: '#f59e0b' },
  { key: 'hq',          label: 'HQ / start',            color: '#06b6d4' },
  { key: 'servicepark', label: 'Service park',          color: '#10b981' },
  { key: 'refuel',      label: 'Refuel',                color: '#f97316' },
  { key: 'noise',       label: 'Noise / scrutineering', color: '#a78bfa' },
  { key: 'trailerpark', label: 'Trailer park',          color: '#6366f1' },
  { key: 'hospital',    label: 'Nearest hospital',      color: '#ef4444' },
]

const PIN_META = {
  postcode: { label: 'Postcode', short: 'Map' },
  w3w:      { label: '///what3words', short: '///w3w' },
  apple:    { label: 'Apple Maps', short: 'Maps' },
}
const PIN_KEYS = ['postcode', 'w3w', 'apple']

function pinUrl(type, value) {
  if (!value) return null
  if (type === 'postcode') return `https://maps.apple.com/?q=${encodeURIComponent(value)}`
  if (type === 'w3w') return `https://what3words.com/${value.replace(/^\/\/\//, '')}`
  return value
}

// Fold legacy { pinType, pin } into the new postcode/w3w/apple shape
function migrateEntry(entry) {
  if (!entry) return {}
  if (entry.pinType && entry.pin && !entry[entry.pinType]) {
    return { ...entry, [entry.pinType]: entry.pin }
  }
  return entry
}

function occupantNames(str) {
  return String(str || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean)
}

function entryHasDetail(e) {
  const x = migrateEntry(e)
  return !!(x.text || x.address || x.phone || x.link || x.ref || x.arrive || x.depart || x.notes
    || PIN_KEYS.some(p => x[p]) || (Array.isArray(x.rooms) && x.rooms.length))
}

function entrySummary(e) {
  const x = migrateEntry(e)
  return x.text || (x.address || '').split('\n').filter(Boolean)[0] || x.postcode || x.w3w || ''
}

function MapPinIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/>
    </svg>
  )
}

function BedIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M2 5a1 1 0 012 0v5h12V8a3 3 0 00-3-3h-3a1 1 0 100 2h3a1 1 0 011 1v2H4V5z"/>
      <path d="M2 11h16a1 1 0 011 1v4a1 1 0 11-2 0v-3H3v3a1 1 0 11-2 0v-4a1 1 0 011-1z"/>
      <path d="M6.5 6.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/>
    </svg>
  )
}

function ReadRow({ label, value }) {
  if (!value) return null
  return (
    <div>
      <p className="text-white/35 text-[10px] uppercase tracking-wide">{label}</p>
      <p className="text-white/80 text-sm whitespace-pre-line">{value}</p>
    </div>
  )
}

// ─── Location maps (shared by the pack + shared views) ───────────────────────
// A tiny slippy-map thumbnail built from plain tile images — no map library, and
// the tiles land in the service worker's FILE_CACHE so they still draw offline.
const MAP_TILE = (z, x, y) => `https://a.basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`

function lonLatToTile(lat, lon, z) {
  const n = 2 ** z
  const latR = lat * Math.PI / 180
  return {
    n,
    x: (lon + 180) / 360 * n,
    y: (1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2 * n,
  }
}

function bgOffset(px) {
  const v = Math.round(px)
  return v < 0 ? `calc(50% - ${Math.abs(v)}px)` : `calc(50% + ${v}px)`
}

function MiniMap({ lat, lon, zoom = 15, halfW = 220, halfH = 70, className = '', showPin = true }) {
  if (typeof lat !== 'number' || typeof lon !== 'number' || Number.isNaN(lat) || Number.isNaN(lon)) return null
  const { x, y, n } = lonLatToTile(lat, lon, zoom)
  const images = [], positions = []
  for (let ty = Math.floor(y - halfH / 256); ty <= Math.floor(y + halfH / 256); ty++) {
    if (ty < 0 || ty >= n) continue
    for (let tx = Math.floor(x - halfW / 256); tx <= Math.floor(x + halfW / 256); tx++) {
      const wx = ((tx % n) + n) % n
      images.push(`url("${MAP_TILE(zoom, wx, ty)}")`)
      positions.push(`${bgOffset(tx * 256 - x * 256)} ${bgOffset(ty * 256 - y * 256)}`)
    }
  }
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        backgroundColor: '#e9e6df',
        backgroundImage: images.join(','),
        backgroundPosition: positions.join(','),
        backgroundSize: '256px 256px',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {showPin && (
        <svg viewBox="0 0 20 20" fill="#e11d48"
          className="absolute w-6 h-6 drop-shadow-md"
          style={{ left: '50%', top: '50%', transform: 'translate(-50%, -92%)' }}>
          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/>
        </svg>
      )}
      <span className="absolute bottom-0 right-0 px-1 text-[8px] leading-[10px] text-black/45 bg-white/65 rounded-tl">© OSM · CARTO</span>
    </div>
  )
}

// What should show on this location's tile: an uploaded diagram, a map, or nothing.
function tilePicture(entry) {
  const e = migrateEntry(entry)
  const mode = e.pic || (e.image_url ? 'image' : (e.coords ? 'map' : 'none'))
  if (mode === 'image' && e.image_url) return { mode: 'image', url: e.image_url }
  if (mode === 'map' && e.coords) return { mode: 'map', coords: e.coords }
  return { mode: 'none' }
}

function SharedLocationDetail({ loc, onBack }) {
  const e = loc.entry
  const rooms = Array.isArray(e.rooms) ? e.rooms : []
  const people = rooms.reduce((n, r) => n + occupantNames(r.occupants).length, 0)
  const firstPin = PIN_KEYS.find(p => e[p])
  const pic = tilePicture(e)

  return (
    <div className="space-y-3">
      <button onClick={onBack}
        className="flex items-center gap-2 text-white/50 hover:text-white text-xs font-medium transition-colors">
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
          <path fillRule="evenodd" d="M7.78 12.53a.75.75 0 01-1.06 0L2.47 8.28a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 1.06L4.81 7h7.44a.75.75 0 010 1.5H4.81l2.97 2.97a.75.75 0 010 1.06z" clipRule="evenodd" />
        </svg>
        All locations
      </button>

      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: loc.color + '20', color: loc.color }}>
          <MapPinIcon className="w-5 h-5" />
        </div>
        <h3 className="text-white font-semibold text-lg">{loc.label}</h3>
      </div>

      {pic.mode === 'map' && (
        <div className="rounded-xl overflow-hidden border border-white/10">
          <MiniMap lat={pic.coords.lat} lon={pic.coords.lon} zoom={15} halfW={340} halfH={90} className="w-full h-44" />
        </div>
      )}
      {pic.mode === 'image' && (
        <div className="rounded-xl overflow-hidden border border-white/10">
          <img src={pic.url} alt="" className="w-full h-44 object-cover bg-white/5" />
        </div>
      )}

      {firstPin && (
        <a href={pinUrl(firstPin, e[firstPin])} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-cyan-500/12 text-cyan-400 border border-cyan-500/25 hover:bg-cyan-500/20 transition-colors no-underline text-sm font-medium">
          <MapPinIcon className="w-4 h-4" />
          Open in maps
        </a>
      )}

      <div className="bg-rl-card border border-white/10 rounded-xl p-4 space-y-3">
        <ReadRow label="Name" value={e.text} />
        <ReadRow label="Address" value={e.address} />
        {PIN_KEYS.filter(p => e[p]).map(p => (
          <div key={p} className="flex items-center justify-between gap-3">
            <span className="text-white/70 text-xs truncate"><span className="text-white/30">{PIN_META[p].label}: </span>{e[p]}</span>
            <a href={pinUrl(p, e[p])} target="_blank" rel="noopener noreferrer"
              className="flex-shrink-0 text-xs px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 no-underline hover:bg-cyan-500/20 transition-colors">
              {PIN_META[p].short} →
            </a>
          </div>
        ))}
      </div>

      {(e.phone || e.ref || e.arrive || e.depart || e.link) && (
        <div className="bg-rl-card border border-white/10 rounded-xl p-4 space-y-3">
          <p className="text-white font-medium text-sm">Details</p>
          <div className="grid grid-cols-2 gap-3">
            <ReadRow label="Phone" value={e.phone} />
            <ReadRow label="Booking ref" value={e.ref} />
            <ReadRow label="Check-in / opens" value={e.arrive} />
            <ReadRow label="Check-out / closes" value={e.depart} />
          </div>
          <div className="flex flex-wrap gap-2">
            {e.phone && (
              <a href={`tel:${e.phone.replace(/\s+/g, '')}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-green-500/12 text-green-600 border border-green-500/25 no-underline hover:bg-green-500/20 transition-colors">
                Call
              </a>
            )}
            {e.link && (
              <a href={e.link} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-blue-500/12 text-blue-600 border border-blue-500/25 no-underline hover:bg-blue-500/20 transition-colors">
                Open link
              </a>
            )}
          </div>
        </div>
      )}

      {e.notes && (
        <div className="bg-rl-card border border-white/10 rounded-xl p-4">
          <p className="text-white font-medium text-sm mb-1.5">Notes</p>
          <p className="text-white/70 text-sm whitespace-pre-line">{e.notes}</p>
        </div>
      )}

      {rooms.length > 0 && (
        <div className="bg-rl-card border border-white/10 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <BedIcon className="w-4 h-4 text-amber-400" />
            <div>
              <p className="text-white font-medium text-sm">Rooming list</p>
              <p className="text-white/35 text-xs">{rooms.length} room{rooms.length === 1 ? '' : 's'} · {people} {people === 1 ? 'person' : 'people'}</p>
            </div>
          </div>
          {rooms.map((r, i) => (
            <div key={r.id || i} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5">
              <p className="text-white text-sm font-medium">{r.room || `Room ${i + 1}`}</p>
              {r.occupants && <p className="text-white/70 text-xs mt-0.5">{occupantNames(r.occupants).join(' · ')}</p>}
              {r.notes && <p className="text-white/40 text-xs mt-1">{r.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SharedLocations({ locations }) {
  const [open, setOpen] = useState(null)
  const customList = Array.isArray(locations._custom) ? locations._custom : []

  const all = [
    ...LOCATION_META.map(f => ({ ...f, entry: migrateEntry(locations[f.key]) })),
    ...customList.map(c => ({
      key: c.id, label: c.label || 'Location', color: c.color || '#94a3b8', entry: migrateEntry(c),
    })),
  ].filter(l => entryHasDetail(l.entry))

  if (all.length === 0 && !locations.notes) return <p className="text-white/30 text-sm">No locations added yet.</p>

  const openLoc = all.find(l => l.key === open) || null
  if (openLoc) return <SharedLocationDetail loc={openLoc} onBack={() => setOpen(null)} />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {all.map(l => {
          const rooms = Array.isArray(l.entry.rooms) ? l.entry.rooms.length : 0
          const pic = tilePicture(l.entry)
          return (
            <button key={l.key} onClick={() => setOpen(l.key)}
              className="text-left bg-rl-card border border-white/10 hover:border-white/25 rounded-2xl overflow-hidden transition-all active:scale-[0.98]">
              {pic.mode !== 'none' && (
                <div className="relative">
                  {pic.mode === 'map'
                    ? <MiniMap lat={pic.coords.lat} lon={pic.coords.lon} zoom={15} halfW={190} halfH={55} className="w-full h-24" />
                    : <img src={pic.url} alt="" className="w-full h-24 object-cover bg-white/5" />}
                  <div className="absolute top-2 left-2 w-7 h-7 rounded-lg flex items-center justify-center backdrop-blur-sm"
                    style={{ background: l.color + 'cc', color: '#fff' }}>
                    <MapPinIcon className="w-4 h-4" />
                  </div>
                </div>
              )}
              <div className="p-4">
                {pic.mode === 'none' && (
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                    style={{ background: l.color + '20', color: l.color }}>
                    <MapPinIcon className="w-5 h-5" />
                  </div>
                )}
                <p className="text-white font-semibold text-sm leading-tight">{l.label}</p>
                <p className="text-white/45 text-xs mt-1 line-clamp-2">{entrySummary(l.entry) || 'Details added'}</p>
                {rooms > 0 && (
                  <span className="inline-flex items-center gap-1 mt-2 text-[11px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    <BedIcon className="w-3 h-3" />
                    {rooms} room{rooms === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {locations.notes && (
        <div className="bg-rl-card border border-white/10 rounded-xl px-4 py-3.5">
          <p className="text-white/40 text-xs mb-1">Notes</p>
          <p className="text-white/70 text-sm whitespace-pre-line">{locations.notes}</p>
        </div>
      )}
    </div>
  )
}


// ─── Car set-up ──────────────────────────────────────────────────────────────

function SharedCarSetup({ images, changes }) {
  const [lightbox, setLightbox] = useState(null)
  const isPdf = (url) => /\.pdf(\?|$)/i.test(url)
  if (!images.length && !changes) return <p className="text-white/30 text-sm">No setup info yet.</p>
  return (
    <div className="space-y-5">
      {images.length > 0 && (
        <div className="space-y-2">
          <p className="text-white/50 text-xs uppercase tracking-widest font-semibold">Setup sheet</p>
          <div className="grid grid-cols-2 gap-3">
            {images.map((url, i) => (
              isPdf(url) ? (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                  className="w-full aspect-[3/4] rounded-xl border border-white/10 bg-white/5 flex flex-col items-center justify-center gap-2 text-white/60 hover:text-violet-300 no-underline">
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-8 h-8">
                    <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z" />
                  </svg>
                  <span className="text-xs">PDF {i + 1}</span>
                </a>
              ) : (
                <button key={i} onClick={() => setLightbox(url)} className="w-full">
                  <img src={url} alt={`Setup sheet ${i + 1}`}
                    className="w-full aspect-[3/4] object-cover rounded-xl border border-white/10" />
                </button>
              )
            ))}
          </div>
        </div>
      )}
      {changes && (
        <div className="space-y-2">
          <p className="text-white/50 text-xs uppercase tracking-widest font-semibold">Changes during rally</p>
          <div className="bg-rl-card border border-white/10 rounded-xl px-4 py-3.5">
            <pre className="text-white/70 text-sm whitespace-pre-wrap font-sans">{changes}</pre>
          </div>
        </div>
      )}
      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}
