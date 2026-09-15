import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import WeatherPanel from '../components/WeatherPanel'

// Re-encode any image (incl. iOS HEIC) to a right-sized JPEG so photo-library
// uploads don't fail on format/size. Falls back to the original if decode fails.
function reencodeImage(file, maxDim = 2400, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (Math.max(width, height) > maxDim) {
        const s = maxDim / Math.max(width, height)
        width = Math.round(width * s); height = Math.round(height * s)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      URL.revokeObjectURL(url)
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('encode failed')),
        'image/jpeg', quality
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')) }
    img.src = url
  })
}

// ── Offline write-queue ──────────────────────────────────────────────────────
// Edits made with no signal are applied locally, stashed here (survives app close),
// and pushed to Supabase automatically when the connection returns.
const pendingKey = (id) => `packPending:${id}`
function readPending(id) { try { return JSON.parse(localStorage.getItem(pendingKey(id)) || 'null') } catch { return null } }
function writePending(id, patch) { try { localStorage.setItem(pendingKey(id), JSON.stringify(patch)) } catch { /* ignore */ } }
function clearPending(id) { try { localStorage.removeItem(pendingKey(id)) } catch { /* ignore */ } }

// Warm the offline cache with a list of file URLs (images / PDFs) so that once a pack
// has been opened with signal, every document opens later with none.
function prefetchFiles(urls) {
  const seen = new Set()
  urls.filter(Boolean).forEach(u => {
    if (typeof u !== 'string' || seen.has(u)) return
    seen.add(u)
    fetch(u, { mode: 'cors' }).catch(() => {})
  })
}

// Open a stored file so it works offline: fetch it (served from the SW cache when there's
// no signal) and open it as a blob URL. Opening the tab synchronously first keeps iOS
// Safari's popup-blocker happy (it blocks window.open after an await).
function openFile(url) {
  const w = window.open('', '_blank')
  fetch(url)
    .then(r => r.blob())
    .then(b => { const o = URL.createObjectURL(b); if (w) w.location = o; else window.location.href = o })
    .catch(() => { if (w) w.location = url })
}

// Full-screen zoomable image viewer. Works even though the app viewport disables
// native pinch-zoom (user-scalable=no) — handles pinch, double-tap, and drag-to-pan itself.
// One back control used everywhere — sticky, high-contrast, thumb-sized.
function BackBar({ label, sublabel, onClick, to }) {
  const inner = (
    <>
      <span className="w-8 h-8 rounded-lg bg-white/12 flex items-center justify-center flex-shrink-0">
        <svg className="w-4.5 h-4.5 text-white" style={{ width: '1.125rem', height: '1.125rem' }} viewBox="0 0 16 16" fill="currentColor">
          <path fillRule="evenodd" d="M7.78 12.53a.75.75 0 01-1.06 0L2.47 8.28a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 1.06L4.81 7h7.44a.75.75 0 010 1.5H4.81l2.97 2.97a.75.75 0 010 1.06z" clipRule="evenodd" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-white font-semibold text-sm leading-tight truncate">{label}</span>
        {sublabel && <span className="block text-white/40 text-[11px] leading-tight truncate mt-0.5">{sublabel}</span>}
      </span>
    </>
  )
  const cls = 'sticky top-2 z-30 mb-4 w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-rl-card/95 backdrop-blur border border-white/15 hover:border-white/35 text-left transition-all active:scale-[0.99] shadow-lg shadow-black/25 no-underline'
  return to
    ? <Link to={to} className={cls}>{inner}</Link>
    : <button onClick={onClick} className={cls}>{inner}</button>
}

function ImageLightbox({ src, onClose }) {
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const g = useRef({ mode: null, startDist: 0, startScale: 1, startX: 0, startY: 0, startTx: 0, startTy: 0, lastTap: 0 })

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)

  function onTouchStart(e) {
    const t = e.touches
    if (t.length === 2) {
      g.current.mode = 'pinch'; g.current.startDist = dist(t); g.current.startScale = scale
    } else if (t.length === 1) {
      const now = Date.now()
      if (now - g.current.lastTap < 300) {           // double-tap toggles zoom
        if (scale > 1) { setScale(1); setTx(0); setTy(0) } else setScale(2.5)
        g.current.lastTap = 0; return
      }
      g.current.lastTap = now
      g.current.mode = 'pan'; g.current.startX = t[0].clientX; g.current.startY = t[0].clientY
      g.current.startTx = tx; g.current.startTy = ty
    }
  }
  function onTouchMove(e) {
    const t = e.touches
    if (g.current.mode === 'pinch' && t.length === 2) {
      e.preventDefault()
      setScale(clamp(g.current.startScale * (dist(t) / g.current.startDist), 1, 6))
    } else if (g.current.mode === 'pan' && t.length === 1 && scale > 1) {
      e.preventDefault()
      setTx(g.current.startTx + (t[0].clientX - g.current.startX))
      setTy(g.current.startTy + (t[0].clientY - g.current.startY))
    }
  }
  function reset() { setScale(1); setTx(0); setTy(0) }

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center overflow-hidden"
      onClick={() => { if (scale === 1) onClose() }}>
      <img
        src={src} alt=""
        onTouchStart={onTouchStart} onTouchMove={onTouchMove}
        onClick={(e) => e.stopPropagation()}
        style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, touchAction: 'none', transition: g.current.mode ? 'none' : 'transform 0.15s' }}
        className="max-w-full max-h-full object-contain select-none"
        draggable={false}
      />
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
    id: 'team-chat', label: 'Team Chat', color: '#22c55e', desc: 'Live chat with your whole team', fullWidth: true,
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7"><path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd"/></svg>
  },
  {
    id: 'results', label: 'Results', color: '#eab308', desc: 'Live timing & results — tap to load', fullWidth: true,
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
    id: 'team-map', label: 'Live team map', color: '#22c55e', desc: 'Where everyone is right now',
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7"><path fillRule="evenodd" d="M12 1.586l-4 4v12.828l4-4V1.586zM3.707 3.293A1 1 0 002 4v10a1 1 0 00.293.707L6 18.414V5.586L3.707 3.293zM17.707 5.293L14 1.586v12.828l2.293 2.293A1 1 0 0018 16V6a1 1 0 00-.293-.707z" clipRule="evenodd"/></svg>
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
  {
    id: 'tracking', label: 'Live Tracking', color: '#f43f5e', desc: 'Follow the cars on the map', external: 'tracking_url',
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7"><path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clipRule="evenodd"/></svg>
  },
  {
    id: 'videos', label: 'Live Videos', color: '#a855f7', desc: 'Stage rally live feed', external: 'video_feed_url',
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7"><path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z"/></svg>
  },
  {
    id: 'media', label: 'Media & Socials', color: '#ec4899', desc: 'Find photos & clips of your car',
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd"/></svg>
  },
]

const VAPID_PUBLIC_KEY = 'BIcwQ-AgPS8rQeybSdJEYAohASdl7C3vx9ls5N5BWx0qC_2Av_gx1k-USjFEeZmjeM-KYGua2tKWqIYNWvPWZc8'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

function fmt(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function toStr(val) {
  if (!val) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'object') {
    return [val.location, val.openTime, val.notes, val.address]
      .filter(Boolean).join(' · ')
  }
  return String(val)
}

export default function PackPage() {
  const { rallyId, calId, packId, teamPackId } = useParams()
  const isCal = !!calId          // calendar-only event (no full RallyGo rally yet)
  const isCustom = !!packId       // crew-added rally, not on the calendar; private to this pack
  const isMember = !!teamPackId   // opening a pack shared with me by another crew (by pack id)
  const { user } = useAuth()
  const [rally, setRally] = useState(null)
  const [pack, setPack] = useState(null)
  const [myRole, setMyRole] = useState('owner') // owner | admin | editor | viewer
  const canEdit = myRole === 'owner' || myRole === 'admin' || myRole === 'editor'
  const canManageTeam = myRole === 'owner' || myRole === 'admin'
  const [tab, setTab] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [shareUrl, setShareUrl] = useState(null)
  const [schedView, setSchedView] = useState(null) // deep-link into Event Schedule's two tiles
  const [carNumber, setCarNumber] = useState('')
  const [editingCarNum, setEditingCarNum] = useState(false)
  const [carNumInput, setCarNumInput] = useState('')
  const [rallyDocs, setRallyDocs] = useState([])
  const [notifStatus, setNotifStatus] = useState('unsupported')

  // ── Offline: pre-download every file in this pack while there's signal ──
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

  // ── Offline: open Supabase storage files (PDFs/docs) from cache via blob URL,
  //    so they work with no signal (a cross-origin new-tab nav can't hit our SW) ──
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

  // Push notification support check + current subscription state
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  useEffect(() => {
    if (isCal || isCustom || isMember) return  // chat/push need a full rally you own
    if (!user || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    if (isIOS && !isStandalone) return
    async function checkSub() {
      const permission = Notification.permission
      if (permission !== 'granted') { setNotifStatus(permission); return }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (!sub) { setNotifStatus('default'); return }
      const { data } = await supabase
        .from('push_subscriptions')
        .select('id')
        .eq('endpoint', sub.endpoint)
        .eq('rally_id', rallyId)
        .eq('app', 'logistics')
        .maybeSingle()
      setNotifStatus(data ? 'granted' : 'default')
    }
    checkSub()
  }, [user, rallyId])

  async function subscribeForPush() {
    if (!user) return
    setNotifStatus('subscribing')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setNotifStatus(permission); return }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
      const { endpoint, keys } = sub.toJSON()
      await supabase.from('push_subscriptions').upsert({
        user_id: user.id,
        rally_id: rallyId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        app: 'logistics',
      }, { onConflict: 'endpoint,rally_id,app' })
      setNotifStatus('granted')
      toast.success('Notifications on — you\'ll get team chat alerts')
    } catch {
      setNotifStatus('default')
      toast.error('Could not enable notifications')
    }
  }

  async function unsubscribeFromPush() {
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        const { endpoint } = sub.toJSON()
        await supabase.from('push_subscriptions').delete()
          .eq('endpoint', endpoint).eq('rally_id', rallyId).eq('app', 'logistics')
      }
      setNotifStatus('default')
      toast.success('Notifications off')
    } catch {
      setNotifStatus('default')
    }
  }

  useEffect(() => {
    if (!user) return
    async function load() {
      let r, p, docs = []
      if (isMember) {
        // A pack shared with me by another crew — load it by id (RLS permits members),
        // derive the rally from whatever the pack points at, and work out my role.
        const { data: pk } = await supabase.from('logistics_packs').select('*').eq('id', teamPackId).maybeSingle()
        p = pk
        if (pk) {
          if (pk.user_id === user.id) setMyRole('owner')
          else {
            const { data: mem } = await supabase.from('pack_members').select('role').eq('pack_id', pk.id).eq('user_id', user.id).maybeSingle()
            setMyRole(mem?.role || 'viewer')
          }
          if (pk.rally_id) {
            const [{ data: ral }, { data: dd }] = await Promise.all([
              supabase.from('rallies').select('*').eq('id', pk.rally_id).maybeSingle(),
              supabase.from('rally_documents').select('*').eq('rally_id', pk.rally_id).order('created_at', { ascending: true }),
            ])
            r = ral; docs = dd || []
          } else if (pk.calendar_event_id) {
            const { data: cal } = await supabase.from('calendar_events').select('*').eq('id', pk.calendar_event_id).maybeSingle()
            r = cal ? { ...cal, id: null, _calendarOnly: true } : null
          } else {
            r = { id: null, name: pk.custom_name || 'Rally', date: pk.custom_date, end_date: pk.custom_end_date, location: pk.custom_location, _calendarOnly: true }
          }
        }
        setRallyDocs(docs || [])
        setRally(r)
        setPack(pk || null)
        if (pk?.car_number) setCarNumber(pk.car_number)
        setLoading(false)
        return
      }
      if (isCustom) {
        // Crew-added rally, not on the calendar. The pack already exists; rally info lives on it.
        const { data: pk } = await supabase.from('logistics_packs').select('*').eq('id', packId).eq('user_id', user.id).maybeSingle()
        p = pk
        r = pk ? { id: null, name: pk.custom_name || 'My rally', date: pk.custom_date, end_date: pk.custom_end_date, location: pk.custom_location, _calendarOnly: true } : null
      } else if (isCal) {
        // Calendar-only event: build a basic rally from the calendar entry, no full details yet.
        const [{ data: cal }, { data: pk }] = await Promise.all([
          supabase.from('calendar_events').select('*').eq('id', calId).single(),
          supabase.from('logistics_packs').select('*').eq('calendar_event_id', calId).eq('user_id', user.id).maybeSingle(),
        ])
        r = cal ? { ...cal, id: null, _calendarOnly: true } : null
        p = pk
      } else {
        const res = await Promise.all([
          supabase.from('rallies').select('*').eq('id', rallyId).single(),
          supabase.from('logistics_packs').select('*').eq('rally_id', rallyId).eq('user_id', user.id).maybeSingle(),
          supabase.from('rally_documents').select('*').eq('rally_id', rallyId).order('created_at', { ascending: true }),
        ])
        r = res[0].data; p = res[1].data; docs = res[2].data || []
      }
      setRallyDocs(docs || [])
      setRally(r)

      // Build stage list from extracted data, falling back to placeholders from stageCount
      function buildStages(regsData) {
        const stages = regsData?.stages || []
        if (stages.length > 0) return stages
        if (regsData?.stageCount > 0) {
          return Array.from({ length: regsData.stageCount }, (_, i) => ({
            number: i + 1, name: `SS${i + 1}`, distance: '',
          }))
        }
        return []
      }

      if (p) {
        // If pack exists but has an empty fuel schedule and the rally now has stage data, backfill it
        if ((!p.fuel_schedule || p.fuel_schedule.length === 0)) {
          const stages = buildStages(r?.regulations_data)
          if (stages.length > 0) {
            const updates = {
              fuel_schedule: stages.map(s => ({ stage: s.number, name: s.name, distance: s.distance, fuel: '', notes: '' })),
              recce_notes: Object.fromEntries(stages.map(s => [s.number, ''])),
              stage_notes: Object.fromEntries(stages.map(s => [s.number, ''])),
            }
            const { data: updated } = await supabase.from('logistics_packs').update(updates).eq('id', p.id).select().single()
            setPack(updated || p)
          } else {
            setPack(p)
          }
        } else {
          setPack(p)
        }
      } else {
        const stages = buildStages(r?.regulations_data)
        const newPack = {
          ...(isCal ? { calendar_event_id: calId, rally_id: null } : { rally_id: rallyId }),
          user_id: user.id,
          team_members: [],
          fuel_schedule: stages.map(s => ({ stage: s.number, name: s.name, distance: s.distance, fuel: '', notes: '' })),
          recce_notes: Object.fromEntries(stages.map(s => [s.number, ''])),
          stage_notes: Object.fromEntries(stages.map(s => [s.number, ''])),
          schedule_notes: '',
        }
        const { data: created } = await supabase.from('logistics_packs').insert(newPack).select().single()
        setPack(created)
      }
      if (p?.car_number) setCarNumber(p.car_number)
      setLoading(false)
    }
    load()
  }, [rallyId, calId, packId, teamPackId, user.id])

  const save = useCallback(async (updates) => {
    if (!pack?.id) return
    if (!canEdit) { toast('View-only access — ask an admin for edit rights', { icon: '🔒', duration: 3000 }); return }
    const id = pack.id
    // 1) apply locally straight away so the UI reflects the edit even with no signal
    setPack(p => ({ ...p, ...updates }))
    // 2) stash the accumulated unsynced changes on the device
    const pending = { ...(readPending(id) || {}), ...updates }
    writePending(id, pending)
    setSaving(true)
    try {
      const { data, error } = await supabase.from('logistics_packs')
        .update({ ...pending, updated_at: new Date().toISOString() })
        .eq('id', id).select().single()
      if (error) throw error
      clearPending(id)
      setPack(data)
      toast.success('Saved')
    } catch {
      toast('Saved on this device — will sync when back online', { icon: '📶', duration: 3000 })
    } finally {
      setSaving(false)
    }
  }, [pack?.id, canEdit])

  // Push any queued offline edits to the server
  const flushPending = useCallback(async () => {
    const id = pack?.id
    if (!id || !navigator.onLine) return
    const pending = readPending(id)
    if (!pending) return
    try {
      const { data, error } = await supabase.from('logistics_packs')
        .update({ ...pending, updated_at: new Date().toISOString() })
        .eq('id', id).select().single()
      if (error) throw error
      clearPending(id)
      setPack(p => ({ ...(data || p), ...(data ? {} : pending) }))
      toast.success('Offline changes synced')
    } catch { /* still offline — try again next time */ }
  }, [pack?.id])

  // On load: re-apply any unsynced offline edits over the fetched pack, then try to sync
  useEffect(() => {
    if (!pack?.id) return
    const pending = readPending(pack.id)
    if (pending) setPack(p => ({ ...p, ...pending }))
    if (navigator.onLine) flushPending()
  }, [pack?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync automatically the moment the connection comes back
  useEffect(() => {
    function onOnline() { flushPending() }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [flushPending])

  async function saveCarNumber(num) {
    if (!pack?.id) return
    const val = num.trim() || null
    setCarNumber(val || '')
    setEditingCarNum(false)
    save({ car_number: val })
  }

  function copyShareLink() {
    setShareUrl({
      join: `${window.location.origin}/join/${pack.share_code}`,
      view: `${window.location.origin}/shared/${pack.share_code}`,
    })
  }

  function copyLink(url, label) {
    navigator.clipboard.writeText(url).then(() => toast.success(`${label} link copied`))
  }

  if (loading) return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
      <div className="h-20 bg-white/5 rounded-2xl animate-pulse" />
      <div className="h-12 bg-white/5 rounded-xl animate-pulse" />
      <div className="h-64 bg-white/5 rounded-xl animate-pulse" />
    </div>
  )

  if (!rally) return <div className="text-center py-16 text-white/30">Rally not found.</div>

  const fi = rally.final_instructions_data || {}
  const regs = rally.regulations_data || {}
  // Stage list, in priority order:
  //  1. Detailed stages from extracted regs
  //  2. Placeholder SS1..SSN from the stage count
  //  3. Legacy: stage rows saved on the pack's fuel_schedule (old format only)
  const stages = regs.stages?.length > 0
    ? regs.stages
    : (regs.stageCount > 0
        ? Array.from({ length: parseInt(regs.stageCount, 10) || 0 }, (_, i) => ({ number: i + 1, name: `SS${i + 1}`, distance: '' }))
        : (pack?.fuel_schedule?.filter(f => f.stage != null && f.id !== 'start' && !String(f.id || '').startsWith('refuel'))
            .map(f => ({ number: f.stage, name: f.name, distance: f.distance })) || []))

  return (
    <main className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6">
<BackBar label="All events" to="/" />
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
          <div className="flex flex-row flex-wrap items-center sm:flex-col sm:items-end gap-2 flex-shrink-0">
            {/* Your rights on this pack — always visible, including inside a section */}
            {isMember && <RoleChip role={myRole} />}
            {/* Car number badge */}
            {editingCarNum ? (
              <div className="flex items-center gap-1.5">
                <input
                  value={carNumInput}
                  onChange={e => setCarNumInput(e.target.value)}
                  placeholder="#"
                  className="rl-input text-sm w-16 text-center font-bold"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveCarNumber(carNumInput)
                    if (e.key === 'Escape') setEditingCarNum(false)
                  }}
                />
                <button onClick={() => saveCarNumber(carNumInput)} className="rl-btn-primary text-xs px-2.5 py-1.5">✓</button>
                <button onClick={() => setEditingCarNum(false)} className="text-white/30 hover:text-white/60 text-xs px-1">✕</button>
              </div>
            ) : (
              <button
                onClick={() => { setCarNumInput(carNumber); setEditingCarNum(true) }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-medium transition-all ${
                  carNumber
                    ? 'bg-cyan-500/12 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20'
                    : 'bg-white/7 border-white/12 text-white/35 hover:bg-white/12 hover:text-white/60'
                }`}
              >
                {carNumber ? (
                  <><span className="text-white/40 text-[10px] font-normal">Car</span><span className="font-bold">#{carNumber}</span></>
                ) : (
                  <span className="text-xs">Set car #</span>
                )}
              </button>
            )}
            <div className="flex items-center gap-2">
              {saving && <span className="text-white/25 text-xs">Saving…</span>}
              {notifStatus !== 'unsupported' && (
                <button
                  onClick={notifStatus === 'granted' ? unsubscribeFromPush : subscribeForPush}
                  disabled={notifStatus === 'subscribing'}
                  title={notifStatus === 'granted' ? 'Notifications on — tap to turn off' : 'Turn on team chat notifications'}
                  className={`rl-btn-ghost text-xs gap-1.5 ${notifStatus === 'granted' ? 'text-green-400' : ''}`}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 16a2 2 0 001.985-1.75c.017-.137-.097-.25-.235-.25h-3.5c-.138 0-.252.113-.235.25A2 2 0 008 16zM3 5a5 5 0 0110 0v2.947c0 .05.015.098.042.139l1.703 2.555A1.519 1.519 0 0113.482 13H2.518a1.516 1.516 0 01-1.263-2.36l1.703-2.554A.255.255 0 003 7.947V5z" />
                  </svg>
                  {notifStatus === 'granted' ? 'Alerts on' : notifStatus === 'subscribing' ? '…' : 'Alerts'}
                </button>
              )}
              <button onClick={copyShareLink} className="rl-btn-ghost text-xs gap-1.5">
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <path fillRule="evenodd" d="M11.5 2.5a1 1 0 100 2 1 1 0 000-2zM4.5 7a1 1 0 100 2 1 1 0 000-2zm7 5a1 1 0 100 2 1 1 0 000-2zM9 3.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM5.5 11a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM12.5 13.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                </svg>
                Share
              </button>
            </div>
          </div>
        </div>
        {shareUrl && (
          <div className="mt-3 bg-rl-card border border-white/10 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-white text-xs font-medium">Share this pack</p>
              <button onClick={() => setShareUrl(null)} className="text-white/30 hover:text-white text-xs">✕</button>
            </div>
            {[
              { key: 'join', label: 'Full access', hint: 'No account needed — they type a name and go straight in as an editor', url: shareUrl.join },
              { key: 'view', label: 'Read-only', hint: 'A look at everything, no sign-in and no changes', url: shareUrl.view },
            ].map(row => (
              <button key={row.key} onClick={() => copyLink(row.url, row.label)}
                className="w-full text-left bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-2.5 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-white text-xs font-medium">{row.label}</p>
                  <span className="text-rl-accent text-[11px] font-semibold flex-shrink-0">Copy</span>
                </div>
                <p className="text-white/35 text-[11px] mt-0.5">{row.hint}</p>
                <p className="text-white/25 text-[10px] truncate mt-1">{row.url}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* What's next on the team plan — pinned above everything on the pack home page */}
      {!tab && (
        <div className="mb-4">
          <PlanNextUp pack={pack} onOpen={() => { setSchedView('team'); setTab('schedule') }} />
        </div>
      )}

      {/* Live running result */}
      {!tab && <div className="mb-4"><LiveResultBanner resultsUrl={pack?.results_url} carNumber={pack?.car_number} /></div>}

      {/* Shared-pack role banner */}
      {!tab && isMember && (
        <div className={`mb-4 rounded-xl px-4 py-3 border ${canEdit ? 'bg-rl-accent/10 border-rl-accent/25' : 'bg-white/5 border-white/10'}`}>
          <div className="flex items-center gap-2.5">
            <RoleChip role={myRole} />
            <p className="text-white/70 text-xs flex-1">
              {myRole === 'admin' && 'You have admin rights on this pack — you can edit everything and manage who has access, in Team \u2192 People with access.'}
              {myRole === 'editor' && 'You can view and edit every tile on this pack, but not manage the team.'}
              {myRole === 'viewer' && 'View-only access. Ask an admin to switch on your edit or admin rights.'}
              {myRole === 'owner' && 'This is your pack.'}
            </p>
          </div>
        </div>
      )}

      {/* Calendar-only note */}
      {!tab && isCal && (
        <div className="mb-4 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
          <p className="text-white/60 text-xs">This event is on the RallyGo calendar but the organiser hasn't published full details yet. You can start planning your own pack now — entry list, documents, stages and team chat will appear automatically once it's published.</p>
        </div>
      )}
      {!tab && isCustom && (
        <div className="mb-4 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
          <p className="text-white/60 text-xs">Your own rally — private to you. Plan fuel, team, locations and schedule here. (Entry list, documents and team chat are only available for events published on RallyGo.)</p>
        </div>
      )}

      {/* Tile grid — home dashboard */}
      {!tab && (
        <div className="grid grid-cols-2 gap-3">
          {SECTIONS.filter(s => {
            if ((isCal || isCustom || isMember) && s.id === 'team-chat') return false
            if (s.external) return !!rally?.[s.external]  // link-out tiles only show when the organiser set the link
            return true
          }).map(s => (
            <button
              key={s.id}
              onClick={() => s.external ? window.open(rally[s.external], '_blank', 'noopener') : setTab(s.id)}
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
<BackBar label="Back to overview" sublabel={rally.name} onClick={() => { setTab(null); setSchedView(null) }} />
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
          {tab === 'team-chat'     && <TeamChatTab rallyId={rallyId} user={user} rallyName={rally?.name} />}
          {tab === 'results'       && <ResultsTab pack={pack} onSave={save} />}
          {tab === 'entry-list'    && <EntryListTab entries={rally?.entry_list_data || []} carNumber={carNumber} />}
          {tab === 'team'          && <TeamTab pack={pack} onSave={save} canManageTeam={canManageTeam} me={user} myRole={myRole} />}
          {tab === 'schedule'      && <ScheduleTab pack={pack} rally={rally} fi={fi} regs={regs} onSave={save} initialView={schedView} />}
          {tab === 'rally-schedule'&& <RallyScheduleTab pack={pack} rally={rally} onSave={save} carNumber={carNumber} />}
          {tab === 'documents'     && <DocumentsTab rally={rally} docs={rallyDocs} />}
          {tab === 'stages'        && <StagesTab pack={pack} stages={stages} rally={rally} onSave={save} />}
          {tab === 'pre-event'     && <PreEventTab fi={fi} rally={rally} />}
          {tab === 'locations'     && <LocationsTab pack={pack} fi={fi} rally={rally} onSave={save} />}
          {tab === 'team-map'      && <TeamMapTab pack={pack} me={user} />}
          {tab === 'fuel'          && <FuelTab pack={pack} onSave={save} />}
          {tab === 'recce'         && <RecceTab pack={pack} stages={stages} rally={rally} onSave={save} />}
          {tab === 'car-setup'     && <CarSetupTab pack={pack} rally={rally} onSave={save} />}
          {tab === 'weather'       && <WeatherPanel rally={rally} />}
          {tab === 'media'         && <MediaTab rally={rally} pack={pack} onSave={save} canEdit={canEdit} canManageTeam={canManageTeam} />}
        </>
      )}
    </main>
  )
}

// ─── Results Tab ─────────────────────────────────────────────────────────────

function ResultsTab({ pack, onSave }) {
  const [url, setUrl] = useState(pack?.results_url || '')
  const [liveUrl, setLiveUrl] = useState(pack?.results_url || '')
  const [editing, setEditing] = useState(!pack?.results_url)

  function loadUrl() {
    const trimmed = url.trim()
    if (!trimmed) return
    onSave({ results_url: trimmed })
    setLiveUrl(trimmed)
    setEditing(false)
  }

  return (
    <div className="space-y-4">
      {/* Live running position, parsed from the results page */}
      <LiveResultBanner resultsUrl={liveUrl} carNumber={pack?.car_number} />

      {liveUrl && !editing && (
        <a href={liveUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-3 w-full px-4 py-4 rounded-2xl bg-rl-accent/12 border border-rl-accent/30 hover:bg-rl-accent/20 transition-all active:scale-[0.99] no-underline">
          <span className="w-10 h-10 rounded-xl bg-rl-accent/20 flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-rl-accent">
              <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"/>
              <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"/>
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-white font-semibold text-base leading-tight">Open full results</span>
            <span className="block text-white/45 text-xs mt-0.5">Opens in your browser, outside the app</span>
          </span>
        </a>
      )}

      {/* URL bar */}
      <div className="bg-rl-card border border-white/10 rounded-xl p-4">
        {editing ? (
          <div className="space-y-3">
            <p className="text-white/40 text-sm">Paste the live results or timing URL for this event</p>
            <div className="flex gap-2">
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && loadUrl()}
                placeholder="https://www.rallies.info/res?e=708&r=o&i=300"
                className="rl-input flex-1 text-sm"
                autoFocus
              />
              <button onClick={loadUrl} disabled={!url.trim()} className="rl-btn-primary text-sm px-4">Save</button>
            </div>
            <p className="text-white/25 text-[11px]">
              With a rallies.info link and your car number set, your running position shows at the top of the pack too.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-rl-accent animate-pulse flex-shrink-0" />
            <p className="text-white/50 text-xs truncate flex-1">{liveUrl}</p>
            <button onClick={() => setEditing(true)} className="text-white/30 hover:text-white/70 text-xs transition-colors flex-shrink-0">Change</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Team Tab ───────────────────────────────────────────────────────────────

function ordinal(n) {
  const v = parseInt(n, 10)
  if (isNaN(v)) return String(n ?? '')
  const s = ['th', 'st', 'nd', 'rd'], m = v % 100
  return v + (s[(m - 20) % 10] || s[m] || s[0])
}

// Live running result at the top of the Team tab. Reads the crew's rallies.info
// results link (pasted in the Results tab) + car number, and refreshes automatically.
function LiveResultBanner({ resultsUrl, carNumber }) {
  const isRallies = /rallies\.info\/res\?[^]*\be=\d+/i.test(resultsUrl || '')
  const key = `res:${resultsUrl}:${carNumber}`
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    if (!isRallies || !carNumber) return
    let cancel = false, timer
    try { const c = JSON.parse(localStorage.getItem(key) || 'null'); if (c) { setData(c); setStatus('ready') } } catch { /* ignore */ }
    async function poll() {
      try {
        const { data: j, error } = await supabase.functions.invoke('rallies-results', { body: { url: resultsUrl, car: String(carNumber) } })
        if (cancel) return
        if (!error && j?.found) {
          setData(j); setStatus('ready')
          try { localStorage.setItem(key, JSON.stringify(j)) } catch { /* ignore */ }
        } else if (!j?.found) {
          setStatus(s => (s === 'ready' ? 'ready' : 'notfound'))
        }
      } catch { setStatus(s => (s === 'ready' ? 'ready' : 'offline')) }
    }
    poll()
    timer = setInterval(poll, 90000) // rallies.info refreshes ~every 5 min
    return () => { cancel = true; clearInterval(timer) }
  }, [resultsUrl, carNumber]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isRallies) return null
  if (!carNumber) return (
    <div className="bg-rl-card border border-white/10 rounded-xl px-4 py-3">
      <p className="text-white/40 text-xs">Set your car number (top of the pack) to see your live running position here.</p>
    </div>
  )
  if (status === 'loading' && !data) return (
    <div className="bg-rl-card border border-white/10 rounded-xl px-4 py-3"><p className="text-white/40 text-xs">Loading live result…</p></div>
  )
  if (status === 'notfound' && !data) return (
    <div className="bg-rl-card border border-white/10 rounded-xl px-4 py-3"><p className="text-white/40 text-xs">Car {carNumber} isn't showing in the results yet.</p></div>
  )
  if (!data) return null

  return (
    <div className="rounded-2xl border border-rl-accent/30 bg-gradient-to-br from-rl-accent/15 to-rl-card p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-white/50 text-[11px] uppercase tracking-widest font-semibold">Live result</span>
        <span className="flex items-center gap-1.5 text-[11px] text-white/40">
          <span className={`w-1.5 h-1.5 rounded-full ${data.final ? 'bg-white/40' : 'bg-green-500 animate-pulse'}`} />
          {data.final ? 'Final' : 'Live'}
        </span>
      </div>
      <div className="flex items-end gap-3">
        <p className="text-white text-4xl font-bold leading-none">{ordinal(data.oaPos)}</p>
        <div className="pb-0.5">
          <p className="text-white text-sm font-medium">Car {data.car} · overall</p>
          <p className="text-white/50 text-xs">{data.final ? 'Final classification' : `after ${data.stageLabel || 'latest stage'}`}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="bg-white/5 rounded-lg py-2">
          <p className="text-white text-sm font-semibold">{data.clsPos || '—'}</p>
          <p className="text-white/35 text-[10px] uppercase tracking-wide">in class{data.cls ? ` ${data.cls}` : ''}</p>
        </div>
        <div className="bg-white/5 rounded-lg py-2">
          <p className="text-white text-sm font-semibold">{data.total || '—'}</p>
          <p className="text-white/35 text-[10px] uppercase tracking-wide">total time</p>
        </div>
        <div className="bg-white/5 rounded-lg py-2">
          <p className="text-white text-sm font-semibold">{data.diffLeader || '—'}</p>
          <p className="text-white/35 text-[10px] uppercase tracking-wide">off lead</p>
        </div>
      </div>
      {data.crew && <p className="text-white/40 text-xs mt-2 text-center">{data.crew}</p>}
    </div>
  )
}

// Media & socials search hub — one-tap searches of each platform for the competitor,
// with rally-specific query building so it isn't just a generic name search.
function MediaTab({ rally, pack, onSave, canEdit, canManageTeam }) {
  const car = pack?.car_number || ''
  const carPhoto = pack?.car_photo_url || ''
  const [uploading, setUploading] = useState(false)

  // ── Post a photo to socials (native share sheet) ──
  const [socialTags, setSocialTags] = useState(pack?.social_tags || '')
  const [tagsDirty, setTagsDirty] = useState(false)
  const [shareFile, setShareFile] = useState(null)     // { file, url }
  const [caption, setCaption] = useState('')

  function saveTags() { onSave?.({ social_tags: socialTags }); setTagsDirty(false); toast.success('Post tags saved') }

  async function pickSharePhoto(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    let out = file
    try { const b = await reencodeImage(file); out = new File([b], 'rally.jpg', { type: 'image/jpeg' }) } catch { /* keep original */ }
    setShareFile({ file: out, url: URL.createObjectURL(out) })
    setCaption((pack?.social_tags || '').trim())
  }

  async function doShare() {
    const text = caption.trim()
    try { await navigator.clipboard.writeText(text) } catch { /* ignore */ }
    const f = shareFile?.file
    try {
      if (f && navigator.canShare && navigator.canShare({ files: [f] })) {
        await navigator.share({ files: [f], text, title: rally?.name || 'Rally' })
      } else if (navigator.share) {
        await navigator.share({ text, title: rally?.name || 'Rally' })
        toast('Caption copied. Photo can\'t be auto-attached here — add it in the app.', { icon: '📋', duration: 4000 })
      } else {
        // Desktop fallback: download the photo + caption already copied
        if (f) { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = 'rally.jpg'; a.click() }
        toast('Caption copied & photo downloaded — post them from your social app.', { icon: '📋', duration: 5000 })
      }
      setShareFile(null)
    } catch { /* user cancelled the share sheet — no-op */ }
  }

  async function uploadCarPhoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      let body = file, ext = 'jpg', contentType = 'image/jpeg'
      try { body = await reencodeImage(file) } catch { body = file; ext = (file.name.split('.').pop() || 'jpg'); contentType = file.type || 'image/jpeg' }
      const path = `car-photos/${pack.id}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('rally-docs').upload(path, body, { contentType, upsert: true })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('rally-docs').getPublicUrl(path)
      onSave?.({ car_photo_url: publicUrl })
      toast.success('Car photo saved')
    } catch (err) { toast.error(`Upload failed: ${err.message || ''}`) }
    finally { setUploading(false); e.target.value = '' }
  }
  const entry = (rally?.entry_list_data || []).find(e => String(e.car) === String(car)) || {}
  const driver = (entry.driver || '').trim()
  const codriver = (entry.codriver || '').trim()
  const rallyName = (rally?.name || rally?.custom_name || '').trim()
  const year = String(rally?.date || rally?.custom_date || '').slice(0, 4)
  const rallyShort = rallyName.replace(/\brally\b/ig, '').replace(/\s+/g, ' ').trim() // "Grampian"
  const hashtag = rallyName.replace(/[^A-Za-z0-9]/g, '')                              // "GrampianRally"
  const ctx = [rallyShort, 'rally', year].filter(Boolean).join(' ')                  // "Grampian rally 2026"

  const subj = driver ? `"${driver}"` : (car ? `car ${car}` : '')
  const defaultTerm = [subj || rallyName, ctx].filter(Boolean).join(' ').trim() || rallyName

  const presets = [
    driver && { label: 'Driver', term: [`"${driver}"`, ctx].filter(Boolean).join(' ') },
    codriver && { label: 'Co-driver', term: [`"${codriver}"`, ctx].filter(Boolean).join(' ') },
    car && { label: `Car ${car}`, term: [`car ${car}`, ctx].filter(Boolean).join(' ') },
    hashtag && { label: `#${hashtag}`, term: `#${hashtag}` },
    (driver || car) && { label: 'Onboard video', term: [subj, rallyShort, 'onboard'].filter(Boolean).join(' ') },
  ].filter(Boolean)

  const [terms, setTerms] = useState(defaultTerm)
  const q = encodeURIComponent(terms.trim())

  // Each button goes to that platform's OWN search (not a general Google search).
  const platforms = [
    { name: 'Photos (Google)', color: '#4285F4', url: `https://www.google.com/search?tbm=isch&q=${q}` },
    { name: 'YouTube', color: '#FF0000', url: `https://www.youtube.com/results?search_query=${q}` },
    { name: 'X / Twitter', color: '#1DA1F2', url: `https://x.com/search?q=${q}&src=typed_query&f=live` },
    { name: 'Instagram', color: '#E1306C', url: `https://www.instagram.com/explore/search/keyword/?q=${q}` },
    { name: 'Facebook', color: '#1877F2', url: `https://www.facebook.com/search/top?q=${q}` },
    { name: 'TikTok', color: '#000000', url: `https://www.tiktok.com/search?q=${q}` },
    { name: 'News (Google)', color: '#5f6368', url: `https://www.google.com/search?tbm=nws&q=${q}` },
    { name: 'Web (Google)', color: '#34A853', url: `https://www.google.com/search?q=${q}` },
  ]

  const open = (u) => window.open(u, '_blank', 'noopener')

  const imgEnc = encodeURIComponent(carPhoto)
  const visualSearches = carPhoto ? [
    { name: 'Google Lens', color: '#4285F4', url: `https://lens.google.com/uploadbyurl?url=${imgEnc}` },
    { name: 'Yandex (best)', color: '#FF0000', url: `https://yandex.com/images/search?rpt=imageview&url=${imgEnc}` },
    { name: 'TinEye', color: '#c0392b', url: `https://tineye.com/search?url=${imgEnc}` },
    { name: 'Bing Visual', color: '#0078D4', url: `https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:${imgEnc}` },
  ] : []

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-white font-medium">Media &amp; socials</h2>
        <p className="text-white/35 text-xs mt-0.5">Post your own photos, or find what others have shared of the car.</p>
      </div>

      {/* ── POST A PHOTO (native share sheet) ── */}
      <div className="rounded-2xl border border-rl-accent/25 bg-gradient-to-br from-rl-accent/10 to-rl-card p-4 space-y-3">
        <div>
          <p className="text-white text-sm font-semibold">Post a photo</p>
          <p className="text-white/40 text-xs mt-0.5">Pick a photo — the caption &amp; hashtags are ready — then choose where to share it.</p>
        </div>

        {canManageTeam && (
          <div className="space-y-1.5">
            <label className="text-white/45 text-[11px] uppercase tracking-wide">Preset caption &amp; hashtags (admin — set before the rally)</label>
            <textarea value={socialTags} onChange={e => { setSocialTags(e.target.value); setTagsDirty(true) }} rows={3}
              placeholder="#GrampianRally #BRC @grampianforestrally @yoursponsor 📸 Car 46" className="rl-textarea text-sm w-full" />
            {tagsDirty && <button onClick={saveTags} className="rl-btn-primary text-xs">Save preset</button>}
          </div>
        )}

        <label className="rl-btn-primary w-full justify-center cursor-pointer">
          Choose a photo to post
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={pickSharePhoto} />
        </label>
        {!pack?.social_tags && !canManageTeam && (
          <p className="text-white/30 text-[11px]">No preset tags yet — ask your team admin to add the rally hashtags.</p>
        )}
      </div>

      {/* Share composer */}
      {shareFile && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShareFile(null)}>
          <div className="bg-rl-card border border-white/15 rounded-2xl w-full max-w-sm p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <p className="text-white font-medium text-sm">Share to socials</p>
            <img src={shareFile.url} alt="" className="w-full max-h-64 object-contain rounded-xl border border-white/10 bg-black/30" />
            <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={4} className="rl-textarea text-sm w-full" placeholder="Add a caption + hashtags…" />
            <div className="flex gap-2">
              <button onClick={() => setShareFile(null)} className="rl-btn-ghost flex-1 justify-center text-sm">Cancel</button>
              <button onClick={doShare} className="rl-btn-primary flex-1 justify-center text-sm">Share…</button>
            </div>
            <p className="text-white/30 text-[11px] text-center">Opens your phone's share sheet — pick Instagram, X, Facebook, WhatsApp… The caption is also copied so you can paste it if a app needs it.</p>
          </div>
        </div>
      )}

      <div className="pt-1"><p className="text-white/45 text-[11px] uppercase tracking-widest font-semibold">Find photos of the car</p></div>

      {(driver || codriver || car) && (
        <div className="bg-rl-card border border-white/10 rounded-xl px-4 py-3">
          <p className="text-white text-sm font-medium">{car ? `Car ${car}` : ''}{driver ? `${car ? ' · ' : ''}${driver}` : ''}{codriver ? ` / ${codriver}` : ''}</p>
          {rallyName && <p className="text-white/35 text-xs">{rallyName}{year ? ` · ${year}` : ''}</p>}
        </div>
      )}

      {/* Reference car photo → reverse / visual image search */}
      <div className="bg-rl-card border border-white/10 rounded-xl p-4 space-y-3">
        <div>
          <p className="text-white text-sm font-medium">Find by car photo</p>
          <p className="text-white/35 text-xs mt-0.5">Upload one clear photo of the car, then let Google Lens or Yandex find visually similar shots across the web.</p>
        </div>
        {carPhoto ? (
          <>
            <div className="flex items-center gap-3">
              <img src={carPhoto} alt="Reference car" className="w-20 h-20 object-cover rounded-lg border border-white/10" />
              {canEdit && (
                <label className="text-xs text-rl-accent hover:text-white cursor-pointer">
                  {uploading ? 'Uploading…' : 'Replace photo'}
                  <input type="file" accept="image/*" className="hidden" onChange={uploadCarPhoto} disabled={uploading} />
                </label>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {visualSearches.map(v => (
                <button key={v.name} onClick={() => open(v.url)}
                  className="flex items-center gap-2.5 bg-white/5 border border-white/10 rounded-xl px-4 py-3 hover:border-white/25 transition-all">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: v.color }} />
                  <span className="text-white text-sm font-medium flex-1 text-left">{v.name}</span>
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-white/25"><path fillRule="evenodd" d="M4.22 11.78a.75.75 0 010-1.06L9.44 5.5H5.75a.75.75 0 010-1.5h5.5a.75.75 0 01.75.75v5.5a.75.75 0 01-1.5 0V6.56l-5.22 5.22a.75.75 0 01-1.06 0z" clipRule="evenodd"/></svg>
                </button>
              ))}
            </div>
            <p className="text-white/25 text-[11px]">Visual search finds cars that look alike — pair it with the car number to confirm it's yours. It can't see inside Instagram/TikTok, only the open web.</p>
          </>
        ) : canEdit ? (
          <label className="w-full flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-white/15 rounded-xl py-6 cursor-pointer text-white/40 hover:border-rl-accent/40 hover:text-rl-accent transition-all">
            <svg className="w-6 h-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd"/></svg>
            <span className="text-sm font-medium">{uploading ? 'Uploading…' : 'Upload a car photo'}</span>
            <input type="file" accept="image/*" className="hidden" onChange={uploadCarPhoto} disabled={uploading} />
          </label>
        ) : (
          <p className="text-white/30 text-xs">No reference photo yet — an editor can add one.</p>
        )}
      </div>

      <div className="space-y-2">
        {presets.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {presets.map((p, i) => (
              <button key={i} onClick={() => setTerms(p.term)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${terms === p.term ? 'bg-rl-accent/15 border-rl-accent/40 text-rl-accent' : 'bg-white/5 border-white/10 text-white/60 hover:border-white/25'}`}>
                {p.label}
              </button>
            ))}
          </div>
        )}
        <label className="text-white/50 text-xs uppercase tracking-wide block pt-1">Search text (edit if you like)</label>
        <input value={terms} onChange={e => setTerms(e.target.value)} placeholder="e.g. &quot;Stephen Waugh&quot; Grampian rally 2026" className="rl-input text-sm w-full" />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {platforms.map(p => (
          <button key={p.name} onClick={() => open(p.url)} disabled={!terms.trim()}
            className="flex items-center gap-2.5 bg-rl-card border border-white/10 rounded-xl px-4 py-3 hover:border-white/25 transition-all disabled:opacity-40">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.color }} />
            <span className="text-white text-sm font-medium flex-1 text-left">{p.name}</span>
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-white/25"><path fillRule="evenodd" d="M4.22 11.78a.75.75 0 010-1.06L9.44 5.5H5.75a.75.75 0 010-1.5h5.5a.75.75 0 01.75.75v5.5a.75.75 0 01-1.5 0V6.56l-5.22 5.22a.75.75 0 01-1.06 0z" clipRule="evenodd"/></svg>
          </button>
        ))}
      </div>

      <p className="text-white/25 text-[11px]">Tip: the rally hashtag (#{hashtag || 'RallyName'}) often surfaces the most photos on X, Instagram and TikTok — tap that chip above, then a social platform.</p>
    </div>
  )
}

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', editor: 'Editor', viewer: 'View only' }
const ROLE_BLURB = {
  owner: 'Created this pack — full control',
  admin: 'Can edit everything and manage who has access',
  editor: 'Can edit every tile, but not manage the team',
  viewer: 'Can look, but not change anything',
}

function ShieldIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M10 1.5l6.5 2.6v4.4c0 4.06-2.72 7.85-6.5 9-3.78-1.15-6.5-4.94-6.5-9V4.1L10 1.5zm3.06 6.3a.9.9 0 10-1.32-1.2L9.2 9.35 8.2 8.3a.9.9 0 10-1.3 1.24l1.66 1.75a.9.9 0 001.31-.02l3.19-3.47z" clipRule="evenodd"/>
    </svg>
  )
}

// One consistent, always-visible badge for "what can this person do"
function RoleChip({ role, className = '' }) {
  const c = role === 'owner' ? 'bg-purple-500/15 text-purple-400 border-purple-500/30'
    : role === 'admin' ? 'bg-rl-accent/15 text-rl-accent border-rl-accent/35'
      : role === 'editor' ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
        : 'bg-white/5 text-white/50 border-white/15'
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${c} ${className}`}>
      {(role === 'admin' || role === 'owner') && <ShieldIcon className="w-3 h-3" />}
      {ROLE_LABEL[role] || role}
    </span>
  )
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button" role="switch" aria-checked={!!checked} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-rl-accent' : 'bg-white/15'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <span
        className="inline-block rounded-full bg-white shadow transition-transform"
        style={{ height: '1.125rem', width: '1.125rem', transform: checked ? 'translateX(1.4375rem)' : 'translateX(0.1875rem)' }}
      />
    </button>
  )
}

// Manage who has a login + role on this pack. Everyone is added as a normal
// member first; admin rights are then switched on per person, right on their tile.
function PackAccessManager({ packId, ownerId, canManage, me, myRole }) {
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  async function loadMembers() {
    const { data: mems } = await supabase.from('pack_members').select('id,user_id,role').eq('pack_id', packId)
    const ids = [...new Set([...(mems || []).map(m => m.user_id), ownerId].filter(Boolean))]
    let profs = []
    if (ids.length) {
      const { data } = await supabase.from('profiles').select('id,full_name,email').in('id', ids)
      profs = data || []
    }
    const nameOf = id => {
      const pr = profs.find(p => p.id === id) || {}
      return { name: pr.full_name || pr.email || 'Member', email: pr.email }
    }
    const memberRows = (mems || [])
      .filter(m => m.user_id !== ownerId)
      .map(m => ({ ...m, ...nameOf(m.user_id) }))
    const ownerRow = ownerId
      ? { id: 'owner-row', user_id: ownerId, role: 'owner', isOwner: true, ...nameOf(ownerId) }
      : null
    setRows(ownerRow ? [ownerRow, ...memberRows] : memberRows)
  }
  useEffect(() => { loadMembers() }, [packId, ownerId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!canManage) return
    const term = q.trim().replace(/[,()*%]/g, ' ').trim()
    if (term.length < 2) { setResults([]); return }
    let active = true
    const t = setTimeout(async () => {
      const { data } = await supabase.from('profiles')
        .select('id,full_name,email')
        .or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
        .limit(8)
      if (!active) return
      const taken = new Set(rows.map(r => r.user_id))
      setResults((data || []).filter(p => p.id !== me?.id && !taken.has(p.id)))
    }, 300)
    return () => { active = false; clearTimeout(t) }
  }, [q, canManage, rows, me?.id])

  async function addMember(p) {
    // Everyone joins as a normal member (can edit) — admin is switched on afterwards.
    const { error } = await supabase.from('pack_members').insert({ pack_id: packId, user_id: p.id, role: 'editor', added_by: me?.id })
    if (error) { toast.error(error.message); return }
    setQ(''); setResults([])
    toast.success(`${p.full_name || p.email} added to the team`)
    loadMembers()
  }
  async function changeRole(row, role) {
    const { error } = await supabase.from('pack_members').update({ role }).eq('id', row.id)
    if (error) { toast.error(error.message); return }
    setRows(rs => rs.map(r => r.id === row.id ? { ...r, role } : r))
    if (role === 'admin') toast.success(`${row.name} now has admin rights`)
    else if (role === 'viewer') toast(`${row.name} is now view-only`, { icon: '👀' })
    else toast.success(`${row.name} can edit`)
  }
  // Guests join with whatever name they typed — let them put it right themselves
  async function saveMyName() {
    const n = nameDraft.trim()
    if (!n) { toast.error('Give yourself a name the crew will recognise'); return }
    const { error } = await supabase.from('profiles').update({ full_name: n }).eq('id', me?.id)
    if (error) { toast.error(error.message); return }
    setRenaming(false)
    toast.success('Name updated')
    loadMembers()
  }

  async function removeMember(row) {
    const { error } = await supabase.from('pack_members').delete().eq('id', row.id)
    if (error) { toast.error(error.message); return }
    setRows(rs => rs.filter(r => r.id !== row.id))
    toast.success('Removed')
  }

  const adminCount = rows.filter(r => r.role === 'admin' || r.role === 'owner').length

  return (
    <div className="space-y-3">
      {/* Your own rights, stated plainly */}
      {myRole && (
        <div className={`rounded-xl px-4 py-3 border flex items-center gap-3 ${
          myRole === 'admin' || myRole === 'owner' ? 'bg-rl-accent/10 border-rl-accent/30'
            : myRole === 'editor' ? 'bg-blue-500/10 border-blue-500/25' : 'bg-white/5 border-white/10'
        }`}>
          <div className="flex-1 min-w-0">
            <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1">Your access</p>
            <div className="flex items-center gap-2 flex-wrap">
              <RoleChip role={myRole} />
              <span className="text-white/55 text-xs">{ROLE_BLURB[myRole]}</span>
            </div>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-white font-medium">People with access</h2>
        <p className="text-white/35 text-xs mt-0.5">
          {canManage
            ? 'Add your crew first — then switch on admin rights for anyone who needs to manage the team.'
            : 'Crew who can open this pack.'}
        </p>
      </div>

      {canManage && (
        <div className="bg-rl-card border border-white/10 rounded-xl p-3.5 space-y-3">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Type a name or email…" className="rl-input text-sm w-full" />

          {results.length > 0 && (
            <div className="border border-white/10 rounded-lg divide-y divide-white/5 overflow-hidden">
              {results.map(p => (
                <button key={p.id} onClick={() => addMember(p)} className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/5 text-left">
                  <div className="min-w-0">
                    <p className="text-white text-sm truncate">{p.full_name || '—'}</p>
                    <p className="text-white/35 text-xs truncate">{p.email}</p>
                  </div>
                  <span className="text-rl-accent text-xs font-semibold flex-shrink-0 ml-2">+ Add to team</span>
                </button>
              ))}
            </div>
          )}
          {q.trim().length >= 2 && results.length === 0 && (
            <p className="text-white/30 text-xs">No matching accounts. They need a Rally Logistics account first — share the app link so they can register.</p>
          )}
          <p className="text-white/25 text-[11px]">New people join as normal members who can edit. Admin rights are a switch on their tile below.</p>
        </div>
      )}

      {rows.length > 0 ? (
        <div className="space-y-2">
          {rows.map(row => {
            const isMe = row.user_id === me?.id
            const isAdmin = row.role === 'admin'
            const highlight = isAdmin || row.isOwner
            return (
              <div key={row.id}
                className={`rounded-xl px-4 py-3 border transition-colors ${highlight ? 'bg-rl-accent/[0.07] border-rl-accent/30' : 'bg-rl-card border-white/10'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white text-sm font-medium truncate">{row.name}{isMe ? ' (you)' : ''}</p>
                      <RoleChip role={row.role} />
                    </div>
                    {row.email && <p className="text-white/35 text-xs truncate mt-0.5">{row.email}</p>}
                    {isMe && (renaming ? (
                      <div className="flex gap-2 mt-2">
                        <input value={nameDraft} onChange={e => setNameDraft(e.target.value)} autoFocus
                          placeholder="Your name" className="rl-input text-sm flex-1"
                          onKeyDown={e => { if (e.key === 'Enter') saveMyName(); if (e.key === 'Escape') setRenaming(false) }} />
                        <button onClick={saveMyName} className="rl-btn-primary text-xs">Save</button>
                        <button onClick={() => setRenaming(false)} className="rl-btn-ghost text-xs">Cancel</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setNameDraft(/^(guest|member)$/i.test(row.name || '') ? '' : (row.name || '')); setRenaming(true) }}
                        className="text-rl-accent/70 hover:text-rl-accent text-[11px] mt-1">
                        {/^(guest|member)$/i.test(row.name || '') ? 'Add your name' : 'Change my name'}
                      </button>
                    ))}
                  </div>
                  {!row.isOwner && (canManage || isMe) && (
                    <button onClick={() => removeMember(row)} className="text-red-400/50 hover:text-red-400 text-xs flex-shrink-0">
                      {isMe ? 'Leave' : 'Remove'}
                    </button>
                  )}
                </div>

                {row.isOwner ? (
                  <p className="text-white/30 text-[11px] mt-2">{ROLE_BLURB.owner}</p>
                ) : canManage ? (
                  <div className="mt-3 pt-3 border-t border-white/8 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-white text-xs font-medium flex items-center gap-1.5">
                          <ShieldIcon className={`w-3.5 h-3.5 ${isAdmin ? 'text-rl-accent' : 'text-white/25'}`} />
                          Admin rights
                        </p>
                        <p className="text-white/35 text-[11px] mt-0.5">Add or remove people and change their rights</p>
                      </div>
                      <Toggle checked={isAdmin} onChange={on => changeRole(row, on ? 'admin' : 'editor')} />
                    </div>
                    {!isAdmin && (
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-white text-xs font-medium">Can edit the pack</p>
                          <p className="text-white/35 text-[11px] mt-0.5">Off = view only</p>
                        </div>
                        <Toggle checked={row.role === 'editor'} onChange={on => changeRole(row, on ? 'editor' : 'viewer')} />
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-white/30 text-[11px] mt-2">{ROLE_BLURB[row.role]}</p>
                )}
              </div>
            )
          })}
          {canManage && (
            <p className="text-white/25 text-[11px] px-0.5">
              {adminCount} {adminCount === 1 ? 'person has' : 'people have'} admin rights on this pack.
            </p>
          )}
        </div>
      ) : (
        <p className="text-white/30 text-xs">No one else has access yet.{canManage ? ' Search above to add your crew.' : ''}</p>
      )}
    </div>
  )
}


function TeamTab({ pack, onSave, canManageTeam, me, myRole }) {
  const [members, setMembers] = useState(pack?.team_members || [])
  const [dirty, setDirty] = useState(false)

  function addMember() {
    setMembers(m => [...m, { name: '', role: '', phone: '', notes: '' }])
    setDirty(true)
  }

  function update(i, field, val) {
    setMembers(m => m.map((x, idx) => idx === i ? { ...x, [field]: val } : x))
    setDirty(true)
  }

  function remove(i) {
    setMembers(m => m.filter((_, idx) => idx !== i))
    setDirty(true)
  }

  return (
    <div className="space-y-4">
      {/* People with app access (real logins + roles) */}
      {pack?.id && <PackAccessManager packId={pack.id} ownerId={pack.user_id} canManage={canManageTeam} me={me} myRole={myRole} />}

      <div className="flex items-center justify-between pt-2">
        <div>
          <h2 className="text-white font-medium">Contacts</h2>
          <p className="text-white/35 text-xs mt-0.5">Names, roles and numbers — tap to call or message</p>
        </div>
        <button onClick={addMember} className="rl-btn-primary text-xs">+ Add contact</button>
      </div>

      {members.length === 0 ? (
        <div className="text-center py-12 bg-rl-card border border-white/8 rounded-xl">
          <p className="text-white/30 text-sm mb-3">No team members yet</p>
          <button onClick={addMember} className="rl-btn-ghost text-xs">Add first member</button>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((m, i) => (
            <div key={i} className="bg-rl-card border border-white/10 rounded-xl p-4">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-white/35 text-[10px] uppercase tracking-wide mb-1 block">Name</label>
                  <input value={m.name} onChange={e => update(i, 'name', e.target.value)}
                    placeholder="Full name" className="rl-input text-sm" />
                </div>
                <div>
                  <label className="text-white/35 text-[10px] uppercase tracking-wide mb-1 block">Role</label>
                  <input value={m.role} onChange={e => update(i, 'role', e.target.value)}
                    placeholder="e.g. Lead mechanic" className="rl-input text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/35 text-[10px] uppercase tracking-wide mb-1 block">Phone</label>
                  <input value={m.phone} onChange={e => update(i, 'phone', e.target.value)}
                    placeholder="+44 7700 900000" className="rl-input text-sm" type="tel" />
                </div>
                <div>
                  <label className="text-white/35 text-[10px] uppercase tracking-wide mb-1 block">Notes</label>
                  <input value={m.notes} onChange={e => update(i, 'notes', e.target.value)}
                    placeholder="e.g. Arrives Friday evening" className="rl-input text-sm" />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                {m.phone ? (
                  <div className="flex items-center gap-2">
                    <a href={`tel:${m.phone.replace(/\s+/g, '')}`}
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-green-500/12 text-green-600 border border-green-500/25 hover:bg-green-500/20 transition-colors no-underline">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/>
                      </svg>
                      Call{m.name ? ` ${m.name.split(' ')[0]}` : ''}
                    </a>
                    <a href={`sms:${m.phone.replace(/\s+/g, '')}`}
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-blue-500/12 text-blue-600 border border-blue-500/25 hover:bg-blue-500/20 transition-colors no-underline">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                        <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7z" clipRule="evenodd"/>
                      </svg>
                      Message
                    </a>
                  </div>
                ) : <span />}
                <button onClick={() => remove(i)} className="text-red-400/50 hover:text-red-400 text-xs transition-colors">Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {dirty && (
        <button onClick={() => { onSave({ team_members: members }); setDirty(false) }}
          className="rl-btn-primary w-full justify-center">
          Save team
        </button>
      )}
    </div>
  )
}

// ─── Schedule Tab ────────────────────────────────────────────────────────────

function ScheduleTab({ pack, rally, fi, regs, onSave, initialView }) {
  const [view, setView] = useState(initialView || null) // null | 'official' | 'team'

  // Prefer FI schedule; fall back to regs schedule (common on BRC events with no separate FI yet)
  const schedule = fi?.schedule?.length > 0 ? fi.schedule : (regs?.schedule || [])
  const scheduleSource = fi?.schedule?.length > 0 ? 'Final Instructions' : 'Regulations'
  const steps = Array.isArray(pack?.team_plan) ? pack.team_plan : []
  const doneCount = steps.filter(s => s.done).length

  if (view) {
    return (
      <div className="space-y-4">
<BackBar label="Event schedule" sublabel={view === 'official' ? 'Official schedule' : 'Team logistics'} onClick={() => setView(null)} />
        {view === 'official'
          ? <OfficialSchedule pack={pack} schedule={schedule} source={scheduleSource} onSave={onSave} />
          : <TeamLogistics pack={pack} rally={rally} onSave={onSave} />}
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
        <p className="text-white/45 text-xs mt-1 line-clamp-2">
          {schedule.length ? `${schedule.length} items from the ${scheduleSource}` : 'Published by the organiser'}
        </p>
      </button>

      <button onClick={() => setView('team')}
        className="text-left bg-rl-card border border-white/10 hover:border-white/25 rounded-2xl p-4 transition-all active:scale-[0.98]">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: '#10b98120', color: '#10b981' }}>
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M6.267 3.455a3.07 3.07 0 001.745-.723 3.07 3.07 0 013.976 0 3.07 3.07 0 001.745.723 3.07 3.07 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.07 3.07 0 010 3.976 3.07 3.07 0 00-.723 1.745 3.07 3.07 0 01-2.812 2.812 3.07 3.07 0 00-1.745.723 3.07 3.07 0 01-3.976 0 3.07 3.07 0 00-1.745-.723 3.07 3.07 0 01-2.812-2.812 3.07 3.07 0 00-.723-1.745 3.07 3.07 0 010-3.976 3.07 3.07 0 00.723-1.745 3.07 3.07 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
          </svg>
        </div>
        <p className="text-white font-semibold text-sm leading-tight">Team logistics</p>
        <p className="text-white/45 text-xs mt-1 line-clamp-2">
          {steps.length ? `${doneCount}/${steps.length} done` : 'Your step-by-step plan'}
        </p>
      </button>
    </div>
  )
}

function OfficialSchedule({ pack, schedule, source, onSave }) {
  const [notes, setNotes] = useState(pack?.schedule_notes || '')
  const [dirty, setDirty] = useState(false)

  return (
    <div className="space-y-6">
      {schedule.length > 0 ? (
        <div>
          <h2 className="text-white font-medium mb-3">Official schedule <span className="text-white/25 text-xs font-normal ml-1">from {source}</span></h2>
          <div className="bg-rl-card border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
            {schedule.map((item, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-white/35 text-xs">{toStr(item.day)}</span>
                  {toStr(item.time) && <span className="text-rl-accent font-mono text-xs">{toStr(item.time)}</span>}
                </div>
                <p className="text-white text-sm mt-0.5">{toStr(item.event)}</p>
                {item.location && <p className="text-white/35 text-xs mt-0.5">{toStr(item.location)}</p>}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-white/30 text-sm">The organiser hasn't published a schedule yet.</p>
      )}

      <div>
        <h2 className="text-white font-medium mb-2">Schedule notes</h2>
        <p className="text-white/35 text-xs mb-3">Free-text notes against the official programme</p>
        <textarea value={notes} onChange={e => { setNotes(e.target.value); setDirty(true) }}
          rows={8} placeholder={"Friday\n14:00 – Load van\n16:00 – All crew arrive\n18:00 – Signing on (car 3)"}
          className="rl-textarea" />
        {dirty && (
          <button onClick={() => { onSave({ schedule_notes: notes }); setDirty(false) }}
            className="rl-btn-primary mt-3">Save notes</button>
        )}
      </div>
    </div>
  )
}

// ─── Team logistics: the crew's own step-by-step plan ────────────────────────

const PLAN_PRESETS = [
  'Load van', 'Depart from home', 'Travel to event', 'Arrive at rally',
  'Signing on', 'Scrutineering', 'Noise test', 'Recce',
  'Arrive at service park', 'Set up service area', 'Refuel car', 'Tyre change',
  'Service', 'Parc fermé', 'Travel to hotel', 'Check in to hotel',
  'Team meal', 'Prize giving', 'Pack up', 'Depart for home',
]

const UNASSIGNED = ''
const WHOLE_TEAM = 'Whole team'

const LEAD_OPTIONS = [
  { v: 0, label: 'No alarm' },
  { v: 15, label: '15 min before' },
  { v: 30, label: '30 min before' },
  { v: 60, label: '1 hour before' },
  { v: 120, label: '2 hours before' },
  { v: 180, label: '3 hours before' },
  { v: 720, label: '12 hours before' },
]
const DEFAULT_LEAD = 60

function planSortKey(s) {
  return `${s.date || '9999-99-99'} ${s.time || '99:99'}`
}

function planDueAt(s) {
  if (!s.date) return null
  const d = new Date(`${s.date}T${s.time || '00:00'}:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function fmtPlanDate(d) {
  if (!d) return 'No date yet'
  const dt = new Date(`${d}T00:00:00`)
  if (Number.isNaN(dt.getTime())) return d
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((dt - today) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
}

// How a step's assignee is encoded in the <select>
function whoValue(s) {
  if (s.whoUserId) return `u:${s.whoUserId}`
  if (s.who === WHOLE_TEAM) return 'team'
  if (s.who) return `n:${s.who}`
  return ''
}
function applyWho(val, appPeople) {
  if (!val) return { who: UNASSIGNED, whoUserId: null }
  if (val === 'team') return { who: WHOLE_TEAM, whoUserId: null }
  if (val.startsWith('u:')) {
    const id = val.slice(2)
    const p = (appPeople || []).find(x => x.user_id === id)
    return { who: p?.name || 'Member', whoUserId: id }
  }
  return { who: val.slice(2), whoUserId: null }
}

// The crew who actually have the app — only these can be sent an alarm
function usePackAppPeople(pack) {
  const [people, setPeople] = useState([])
  useEffect(() => {
    if (!pack?.id) return
    let live = true
    ;(async () => {
      const { data: mems } = await supabase.from('pack_members').select('user_id').eq('pack_id', pack.id)
      const ids = [...new Set([...(mems || []).map(m => m.user_id), pack.user_id].filter(Boolean))]
      if (!ids.length) return
      const { data: profs } = await supabase.from('profiles').select('id,full_name,email').in('id', ids)
      if (!live) return
      setPeople((profs || []).map(p => ({ user_id: p.id, name: p.full_name || p.email || 'Member' })))
    })()
    return () => { live = false }
  }, [pack?.id, pack?.user_id])
  return people
}

function WhoSelect({ value, onChange, appPeople, contacts, className = 'rl-input text-sm w-full' }) {
  const contactOnly = (contacts || []).filter(n => n && !(appPeople || []).some(p => p.name.toLowerCase() === n.toLowerCase()))
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={className}>
      <option value="">Unassigned</option>
      <option value="team">{WHOLE_TEAM}</option>
      {(appPeople || []).length > 0 && (
        <optgroup label="Has the app — can be alarmed">
          {appPeople.map(p => <option key={p.user_id} value={`u:${p.user_id}`}>{p.name}</option>)}
        </optgroup>
      )}
      {contactOnly.length > 0 && (
        <optgroup label="Contacts — no alarm">
          {contactOnly.map(n => <option key={n} value={`n:${n}`}>{n}</option>)}
        </optgroup>
      )}
    </select>
  )
}

function TeamLogistics({ pack, rally, onSave }) {
  const [steps, setSteps] = useState(() => Array.isArray(pack?.team_plan) ? pack.team_plan : [])
  const [dirty, setDirty] = useState(false)
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState({ label: '', date: rally?.date || '', time: '', who: '', lead: DEFAULT_LEAD })

  const appPeople = usePackAppPeople(pack)
  const contacts = (pack?.team_members || []).map(m => m.name).filter(Boolean)
  const sorted = [...steps].sort((a, b) => planSortKey(a).localeCompare(planSortKey(b)))

  function commit(next) {
    setSteps(next)
    setDirty(true)
  }
  function addStep(label) {
    const text = (label ?? draft.label).trim()
    if (!text) { toast.error('Give the action a name'); return }
    const who = applyWho(draft.who, appPeople)
    commit([...steps, {
      id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: text,
      date: draft.date || rally?.date || '',
      time: draft.time || '',
      ...who,
      lead: draft.lead ?? DEFAULT_LEAD,
      notes: '',
      done: false,
    }])
    setDraft(d => ({ ...d, label: '', time: '' }))
  }
  function update(id, field, val) {
    commit(steps.map(s => s.id === id ? { ...s, [field]: val } : s))
  }
  function patch(id, obj) {
    commit(steps.map(s => s.id === id ? { ...s, ...obj } : s))
  }
  function remove(id) {
    commit(steps.filter(s => s.id !== id))
    setEditing(null)
  }
  function save(next) {
    onSave({ team_plan: next || steps })
    setDirty(false)
  }

  const groups = []
  sorted.forEach(s => {
    const key = s.date || ''
    const last = groups[groups.length - 1]
    if (last && last.date === key) last.items.push(s)
    else groups.push({ date: key, items: [s] })
  })

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-white font-medium">Team logistics</h2>
          <p className="text-white/35 text-xs mt-0.5">Every action, in order, with who's doing it</p>
        </div>
        {dirty && <button onClick={() => save()} className="rl-btn-primary text-xs flex-shrink-0">Save</button>}
      </div>

      {/* Add a step */}
      <div className="bg-rl-card border border-white/10 rounded-xl p-4 space-y-3">
        <p className="text-white font-medium text-sm">Add an action</p>
        <input value={draft.label} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') addStep() }}
          placeholder="e.g. Refuel car at Shell, Penrith" className="rl-input text-sm w-full" />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-white/35 text-[10px] uppercase tracking-wide mb-1">Date</p>
            <input type="date" value={draft.date} onChange={e => setDraft(d => ({ ...d, date: e.target.value }))} className="rl-input text-sm w-full" />
          </div>
          <div>
            <p className="text-white/35 text-[10px] uppercase tracking-wide mb-1">Time</p>
            <input type="time" value={draft.time} onChange={e => setDraft(d => ({ ...d, time: e.target.value }))} className="rl-input text-sm w-full" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-white/35 text-[10px] uppercase tracking-wide mb-1">Who</p>
            <WhoSelect value={draft.who} onChange={v => setDraft(d => ({ ...d, who: v }))} appPeople={appPeople} contacts={contacts} />
          </div>
          <div>
            <p className="text-white/35 text-[10px] uppercase tracking-wide mb-1">Alarm</p>
            <select value={draft.lead} onChange={e => setDraft(d => ({ ...d, lead: Number(e.target.value) }))} className="rl-input text-sm w-full">
              {LEAD_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <button onClick={() => addStep()} className="rl-btn-primary w-full justify-center text-sm">+ Add action</button>

        <div>
          <p className="text-white/35 text-[10px] uppercase tracking-wide mb-1.5">Or tap a common one</p>
          <div className="flex flex-wrap gap-1.5">
            {PLAN_PRESETS.map(p => (
              <button key={p} onClick={() => addStep(p)}
                className="text-[11px] px-2 py-1 rounded-md bg-white/5 text-white/55 border border-white/10 hover:bg-white/10 hover:text-white transition-colors">
                + {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* The plan */}
      {steps.length === 0 ? (
        <div className="text-center py-10 bg-rl-card border border-white/8 rounded-xl">
          <p className="text-white/30 text-sm">No actions yet — add the first one above.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(g => (
            <div key={g.date || 'undated'}>
              <p className="text-white/40 text-xs font-medium mb-2 px-0.5">{fmtPlanDate(g.date)}</p>
              <div className="space-y-2">
                {g.items.map(s => {
                  const alarmOn = (s.lead ?? DEFAULT_LEAD) > 0 && !!s.whoUserId && !!s.time && !s.done
                  return (
                    <div key={s.id} className={`bg-rl-card border rounded-xl transition-colors ${s.done ? 'border-white/8 opacity-60' : 'border-white/10'}`}>
                      <div className="flex items-start gap-3 px-4 py-3">
                        <button onClick={() => update(s.id, 'done', !s.done)}
                          className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${s.done ? 'bg-green-500/80 border-green-500' : 'border-white/25 hover:border-white/50'}`}>
                          {s.done && (
                            <svg viewBox="0 0 20 20" fill="white" className="w-3.5 h-3.5">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                            </svg>
                          )}
                        </button>
                        <button onClick={() => setEditing(editing === s.id ? null : s.id)} className="flex-1 min-w-0 text-left">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-rl-accent font-mono text-xs">{s.time || '--:--'}</span>
                            <span className={`text-white text-sm font-medium ${s.done ? 'line-through' : ''}`}>{s.label}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap mt-1">
                            {s.who
                              ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/12 text-blue-400 border border-blue-500/25">{s.who}</span>
                              : <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-white/35 border border-white/10">Unassigned</span>}
                            {alarmOn && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-amber-500">
                                <BellIcon className="w-3 h-3" />
                                {LEAD_OPTIONS.find(o => o.v === (s.lead ?? DEFAULT_LEAD))?.label || 'Alarm'}
                              </span>
                            )}
                            {s.notes && <span className="text-white/40 text-xs truncate">{s.notes}</span>}
                          </div>
                        </button>
                      </div>

                      {editing === s.id && (
                        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-white/8">
                          <LocField label="Action" value={s.label} onChange={v => update(s.id, 'label', v)} placeholder="What happens" />
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="text-white/35 text-[10px] uppercase tracking-wide mb-1">Date</p>
                              <input type="date" value={s.date || ''} onChange={e => update(s.id, 'date', e.target.value)} className="rl-input text-sm w-full" />
                            </div>
                            <div>
                              <p className="text-white/35 text-[10px] uppercase tracking-wide mb-1">Time</p>
                              <input type="time" value={s.time || ''} onChange={e => update(s.id, 'time', e.target.value)} className="rl-input text-sm w-full" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="text-white/35 text-[10px] uppercase tracking-wide mb-1">Who</p>
                              <WhoSelect value={whoValue(s)} onChange={v => patch(s.id, applyWho(v, appPeople))} appPeople={appPeople} contacts={contacts} />
                            </div>
                            <div>
                              <p className="text-white/35 text-[10px] uppercase tracking-wide mb-1">Alarm</p>
                              <select value={s.lead ?? DEFAULT_LEAD} onChange={e => update(s.id, 'lead', Number(e.target.value))} className="rl-input text-sm w-full">
                                {LEAD_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                              </select>
                            </div>
                          </div>
                          {(s.lead ?? DEFAULT_LEAD) > 0 && (!s.whoUserId || !s.time) && (
                            <p className="text-amber-500/70 text-[11px]">
                              {!s.time
                                ? 'Set a time and this alarm will fire.'
                                : 'Only someone with the app can be alarmed — pick them under "Has the app".'}
                            </p>
                          )}
                          <LocField label="Notes" value={s.notes} onChange={v => update(s.id, 'notes', v)} placeholder="e.g. 40 litres, bring the funnel" />
                          <div className="flex items-center justify-between">
                            <button onClick={() => setEditing(null)} className="rl-btn-ghost text-xs">Done editing</button>
                            <button onClick={() => remove(s.id)} className="text-red-400/60 hover:text-red-400 text-xs">Remove action</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {dirty && (
        <button onClick={() => save()} className="rl-btn-primary w-full justify-center sticky bottom-4">Save team logistics</button>
      )}
    </div>
  )
}

function BellIcon({ className }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M8 16a2 2 0 001.985-1.75c.017-.137-.097-.25-.235-.25h-3.5c-.138 0-.252.113-.235.25A2 2 0 008 16zM3 5a5 5 0 0110 0v2.947c0 .05.015.098.042.139l1.703 2.555A1.519 1.519 0 0113.482 13H2.518a1.516 1.516 0 01-1.263-2.36l1.703-2.554A.255.255 0 003 7.947V5z" />
    </svg>
  )
}

// What's coming next, pinned to the top of the pack home page.
function PlanNextUp({ pack, onOpen }) {
  const steps = Array.isArray(pack?.team_plan) ? pack.team_plan : []
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 60000)
    return () => clearInterval(t)
  }, [])
  if (!steps.length) return null

  const now = Date.now()
  const open = steps.filter(s => !s.done)
  const upcoming = open
    .filter(s => { const d = planDueAt(s); return d && d.getTime() >= now - 30 * 60000 })
    .sort((a, b) => planSortKey(a).localeCompare(planSortKey(b)))
  const shown = (upcoming.length ? upcoming : open.sort((a, b) => planSortKey(a).localeCompare(planSortKey(b)))).slice(0, 4)
  if (!shown.length) return null

  const doneCount = steps.filter(s => s.done).length

  function countdown(s) {
    const d = planDueAt(s)
    if (!d) return null
    const mins = Math.round((d.getTime() - now) / 60000)
    if (mins < -30) return null
    if (mins < 0) return 'now'
    if (mins < 60) return `in ${mins} min`
    const h = Math.floor(mins / 60)
    if (h < 24) return `in ${h}h ${mins % 60 ? `${mins % 60}m` : ''}`.trim()
    return `in ${Math.round(h / 24)}d`
  }

  return (
    <button onClick={onOpen}
      className="w-full text-left bg-rl-card border border-white/12 hover:border-white/25 rounded-2xl overflow-hidden transition-all active:scale-[0.99]">
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: '#10b98120', color: '#10b981' }}>
            <BellIcon className="w-3.5 h-3.5" />
          </span>
          <p className="text-white font-semibold text-sm">Next up</p>
        </div>
        <span className="text-white/35 text-[11px]">{doneCount}/{steps.length} done</span>
      </div>
      <div className="divide-y divide-white/5">
        {shown.map(s => {
          const c = countdown(s)
          return (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="w-14 flex-shrink-0">
                <p className="text-rl-accent font-mono text-xs leading-tight">{s.time || '--:--'}</p>
                <p className="text-white/30 text-[10px] leading-tight">{fmtPlanDate(s.date)}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm leading-tight truncate">{s.label}</p>
                {s.who && <p className="text-white/40 text-[11px] leading-tight mt-0.5 truncate">{s.who}</p>}
              </div>
              {c && (
                <span className={`text-[11px] font-medium flex-shrink-0 ${c === 'now' ? 'text-amber-500' : 'text-white/35'}`}>{c}</span>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-white/25 text-[11px] px-4 py-2">Tap for the full team plan</p>
    </button>
  )
}

// ─── Live team map ───────────────────────────────────────────────────────────
// Positions are written by whoever has the pack open and sharing. The table and
// the upsert shape are deliberately source-agnostic, so a Capacitor background
// geolocation plugin can feed the exact same rows later with no rework here.

const POS_STALE_MS = 15 * 60 * 1000
const SHARE_KEY = packId => `rlShareLoc:${packId}`

function useLeaflet() {
  const [ready, setReady] = useState(() => !!window.L)
  useEffect(() => {
    if (window.L) { setReady(true); return }
    if (!document.getElementById('leaflet-css')) {
      const css = document.createElement('link')
      css.id = 'leaflet-css'
      css.rel = 'stylesheet'
      css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css'
      document.head.appendChild(css)
    }
    let s = document.getElementById('leaflet-js')
    if (!s) {
      s = document.createElement('script')
      s.id = 'leaflet-js'
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js'
      document.head.appendChild(s)
    }
    const done = () => setReady(!!window.L)
    s.addEventListener('load', done)
    return () => s.removeEventListener('load', done)
  }, [])
  return ready
}

function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}
function personColour(id) {
  const palette = ['#06b6d4', '#10b981', '#f59e0b', '#a78bfa', '#ec4899', '#6366f1', '#f97316', '#14b8a6']
  let h = 0
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return palette[h % palette.length]
}
function ago(ts) {
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function TeamMapTab({ pack, me }) {
  const packId = pack?.id
  const leafletReady = useLeaflet()
  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})
  const watchRef = useRef(null)
  const lastSent = useRef(0)

  const [positions, setPositions] = useState([])
  const [names, setNames] = useState({})
  const [sharing, setSharing] = useState(() => {
    try { return localStorage.getItem(SHARE_KEY(packId)) === '1' } catch { return false }
  })
  const [geoError, setGeoError] = useState(null)
  const [fitted, setFitted] = useState(false)

  // Who's who
  useEffect(() => {
    if (!packId) return
    let live = true
    ;(async () => {
      const { data: mems } = await supabase.from('pack_members').select('user_id').eq('pack_id', packId)
      const ids = [...new Set([...(mems || []).map(m => m.user_id), pack.user_id].filter(Boolean))]
      if (!ids.length) return
      const { data: profs } = await supabase.from('profiles').select('id,full_name,email').in('id', ids)
      if (!live) return
      const map = {}
      ;(profs || []).forEach(p => { map[p.id] = p.full_name || p.email || 'Member' })
      setNames(map)
    })()
    return () => { live = false }
  }, [packId, pack?.user_id])

  // Poll everyone's positions
  useEffect(() => {
    if (!packId) return
    let live = true
    async function poll() {
      const { data, error } = await supabase.from('team_positions').select('*').eq('pack_id', packId)
      if (!live || error) return
      setPositions(data || [])
    }
    poll()
    const t = setInterval(poll, 15000)
    return () => { live = false; clearInterval(t) }
  }, [packId])

  // Share my own position while the toggle is on and this page is open
  useEffect(() => {
    if (!sharing || !packId || !me?.id) return
    if (!navigator.geolocation) { setGeoError('This device has no location support'); return }
    setGeoError(null)

    async function push(pos) {
      const now = Date.now()
      if (now - lastSent.current < 15000) return
      lastSent.current = now
      const c = pos.coords
      const row = {
        pack_id: packId,
        user_id: me.id,
        lat: c.latitude,
        lon: c.longitude,
        accuracy: c.accuracy ?? null,
        heading: Number.isFinite(c.heading) ? c.heading : null,
        speed: Number.isFinite(c.speed) ? c.speed : null,
        source: 'web',
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('team_positions').upsert(row, { onConflict: 'pack_id,user_id' })
      if (error) setGeoError(error.message)
      else setPositions(p => [...p.filter(x => x.user_id !== me.id), row])
    }

    watchRef.current = navigator.geolocation.watchPosition(
      push,
      err => setGeoError(err.code === 1 ? 'Location permission was declined' : err.message),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    )
    return () => {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current)
      watchRef.current = null
    }
  }, [sharing, packId, me?.id])

  function toggleShare(on) {
    setSharing(on)
    try { localStorage.setItem(SHARE_KEY(packId), on ? '1' : '0') } catch { /* private mode */ }
    if (!on && packId && me?.id) {
      supabase.from('team_positions').delete().eq('pack_id', packId).eq('user_id', me.id)
      setPositions(p => p.filter(x => x.user_id !== me.id))
    }
  }

  // Build the map once Leaflet is in
  useEffect(() => {
    if (!leafletReady || !mapEl.current || mapRef.current) return
    const L = window.L
    const map = L.map(mapEl.current, { zoomControl: true, attributionControl: true }).setView([54.5, -3], 6)
    L.tileLayer('https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(map)
    mapRef.current = map
    setTimeout(() => map.invalidateSize(), 60)
  }, [leafletReady])

  // Keep markers in step with the positions
  useEffect(() => {
    const map = mapRef.current
    if (!map || !window.L) return
    const L = window.L
    const seen = new Set()

    positions.forEach(p => {
      seen.add(p.user_id)
      const name = names[p.user_id] || 'Crew'
      const stale = Date.now() - new Date(p.updated_at).getTime() > POS_STALE_MS
      const colour = personColour(p.user_id)
      const html = `<div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-6px)">
        <div style="width:34px;height:34px;border-radius:50%;background:${colour};opacity:${stale ? 0.45 : 1};
          color:#fff;font:600 12px/34px system-ui;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.35);
          border:2px solid #fff">${initials(name)}</div>
        <div style="margin-top:2px;padding:1px 5px;border-radius:5px;background:rgba(255,255,255,.9);
          color:#111;font:500 10px/14px system-ui;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.2)">
          ${name.split(' ')[0]}${stale ? ' ·' : ''}</div>
      </div>`
      const icon = L.divIcon({ html, className: '', iconSize: [34, 50], iconAnchor: [17, 25] })
      const existing = markersRef.current[p.user_id]
      if (existing) {
        existing.setLatLng([p.lat, p.lon])
        existing.setIcon(icon)
      } else {
        markersRef.current[p.user_id] = L.marker([p.lat, p.lon], { icon }).addTo(map)
      }
      markersRef.current[p.user_id].bindPopup(
        `<strong>${name}</strong><br>${ago(p.updated_at)}${p.accuracy ? `<br>±${Math.round(p.accuracy)}m` : ''}`
      )
    })

    Object.keys(markersRef.current).forEach(id => {
      if (!seen.has(id)) { map.removeLayer(markersRef.current[id]); delete markersRef.current[id] }
    })

    if (!fitted && positions.length) {
      const bounds = L.latLngBounds(positions.map(p => [p.lat, p.lon]))
      map.fitBounds(bounds.pad(0.35), { maxZoom: 14 })
      setFitted(true)
    }
  }, [positions, names, fitted])

  function recentre() {
    const map = mapRef.current
    if (!map || !window.L || !positions.length) return
    map.fitBounds(window.L.latLngBounds(positions.map(p => [p.lat, p.lon])).pad(0.35), { maxZoom: 14 })
  }

  const live = positions.filter(p => Date.now() - new Date(p.updated_at).getTime() <= POS_STALE_MS)

  return (
    <div className="space-y-4">
      <div className="bg-rl-card border border-white/10 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-white font-medium text-sm">Share my location</p>
            <p className="text-white/35 text-[11px] mt-0.5">
              The crew can see where you are while the pack is open on your phone
            </p>
          </div>
          <Toggle checked={sharing} onChange={toggleShare} />
        </div>
        {sharing && (
          <p className="text-white/30 text-[11px]">
            Phones stop reporting when the screen locks or you switch apps — your pin stays put at your last position and
            greys out after 15 minutes.
          </p>
        )}
        {geoError && <p className="text-amber-500/80 text-[11px]">{geoError}</p>}
      </div>

      <div className="rounded-xl overflow-hidden border border-white/10 relative" style={{ height: '60vh', minHeight: '340px' }}>
        <div ref={mapEl} className="w-full h-full" />
        {!leafletReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-rl-card">
            <div className="w-6 h-6 border-2 border-white/10 border-t-rl-accent rounded-full animate-spin" />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-white/40 text-xs">
          {live.length ? `${live.length} ${live.length === 1 ? 'person' : 'people'} sharing now` : 'Nobody is sharing yet'}
          {positions.length > live.length && ` · ${positions.length - live.length} stale`}
        </p>
        {positions.length > 0 && <button onClick={recentre} className="rl-btn-ghost text-xs">Fit everyone</button>}
      </div>

      {positions.length > 0 && (
        <div className="space-y-2">
          {[...positions].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).map(p => (
            <div key={p.user_id} className="flex items-center gap-3 bg-rl-card border border-white/10 rounded-xl px-4 py-2.5">
              <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0"
                style={{ background: personColour(p.user_id) }}>
                {initials(names[p.user_id] || '?')}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm truncate">{names[p.user_id] || 'Crew'}{p.user_id === me?.id ? ' (you)' : ''}</p>
                <p className="text-white/35 text-[11px]">{ago(p.updated_at)}{p.source === 'native' ? ' · background' : ''}</p>
              </div>
              <button onClick={() => { const m = markersRef.current[p.user_id]; if (m && mapRef.current) { mapRef.current.setView(m.getLatLng(), 15); m.openPopup() } }}
                className="text-rl-accent text-xs flex-shrink-0">Show</button>
            </div>
          ))}
        </div>
      )}

      <p className="text-white/20 text-[11px]">
        Only people with access to this pack can see these positions, and only while someone chooses to share.
        Turning the switch off deletes your position straight away.
      </p>
    </div>
  )
}

// ─── Stages Tab ──────────────────────────────────────────────────────────────

function StagesTab({ pack, stages, rally, onSave }) {
  const [stageNotes, setStageNotes] = useState(pack?.stage_notes || {})
  const [dirty, setDirty] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [crewUploading, setCrewUploading] = useState(null) // the stage key currently uploading

  const routeOverview = rally?.route_overview_url
  const stageImages = rally?.stage_images || {}
  const stageMaps = rally?.stage_maps || []
  const crewMaps = pack?.stage_maps || []

  function update(num, val) {
    setStageNotes(n => ({ ...n, [num]: val }))
    setDirty(true)
  }

  // stageKey = the SS number the map belongs to, or 'general' for maps not tied to a stage
  async function uploadCrewMap(stageKey, e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setCrewUploading(stageKey)
    const added = []
    for (const file of files) {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
      const isImg = file.type.startsWith('image/') || !isPdf
      if (!isPdf && !isImg) { toast.error('Please choose an image or a PDF'); continue }
      try {
        let body = file, ext = 'jpg', contentType = 'image/jpeg'
        if (isPdf) { body = file; ext = 'pdf'; contentType = 'application/pdf' }
        else { try { body = await reencodeImage(file) } catch { body = file; ext = (file.name.split('.').pop() || 'jpg'); contentType = file.type || 'image/jpeg' } }
        const path = `crew-stage-maps/${pack.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const { error } = await supabase.storage.from('rally-docs').upload(path, body, { contentType, upsert: true })
        if (error) throw error
        const { data: { publicUrl } } = supabase.storage.from('rally-docs').getPublicUrl(path)
        added.push({ id: Date.now() + Math.floor(Math.random() * 1000), stage: stageKey === 'general' ? null : stageKey, label: file.name.replace(/\.[^.]+$/, ''), url: publicUrl, type: isPdf ? 'pdf' : 'image' })
      } catch (err) {
        toast.error(`Upload failed: ${err.message || file.name}`)
      }
    }
    e.target.value = ''
    setCrewUploading(null)
    if (!added.length) return
    onSave({ stage_maps: [...crewMaps, ...added] })
    toast.success(added.length > 1 ? `${added.length} maps added` : 'Map added')
  }

  function removeCrewMap(id) {
    onSave({ stage_maps: crewMaps.filter(m => m.id !== id) })
  }

  // Preview-tile renderer for a crew map: image thumbnail (or PDF icon) with title below
  function crewMapRow(m) {
    return (
      <div key={m.id} className="relative group bg-rl-card border border-white/10 rounded-xl overflow-hidden">
        {m.type === 'image' ? (
          <button onClick={() => setLightbox(m.url)} className="block w-full">
            <img src={m.url} alt={m.label} className="w-full h-32 object-cover" />
          </button>
        ) : (
          <a href={m.url} target="_blank" rel="noopener noreferrer" className="flex h-32 flex-col items-center justify-center gap-1.5 bg-indigo-500/10 no-underline">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-8 h-8 text-indigo-400"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/></svg>
            <span className="text-indigo-300 text-[11px]">PDF · tap to open</span>
          </a>
        )}
        <div className="flex items-center gap-2 px-3 py-2">
          <p className="text-white text-xs font-medium flex-1 min-w-0 truncate">{m.label}</p>
          <button onClick={() => removeCrewMap(m.id)} className="text-[11px] text-red-400/60 hover:text-red-400 flex-shrink-0">Remove</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-medium">Stage notes</h2>
          <p className="text-white/35 text-xs mt-0.5">Stage maps from the organiser — add your own crew notes per stage</p>
        </div>
        {dirty && (
          <button onClick={() => { onSave({ stage_notes: stageNotes }); setDirty(false) }}
            className="rl-btn-primary text-xs">Save notes</button>
        )}
      </div>

      {/* Route overview map (legacy single slot) */}
      {routeOverview && (
        <div className="space-y-2">
          <p className="text-white/50 text-xs uppercase tracking-widest font-semibold">Route overview</p>
          <button onClick={() => setLightbox(routeOverview)} className="w-full">
            <img src={routeOverview} alt="Route overview"
              className="w-full rounded-xl border border-white/10 object-cover" />
          </button>
        </div>
      )}

      {/* Stage maps & route — labelled list from the organiser */}
      {stageMaps.length > 0 && (
        <div className="space-y-2">
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
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-white/25 flex-shrink-0"><path fillRule="evenodd" d="M4.22 11.78a.75.75 0 010-1.06L9.44 5.5H5.75a.75.75 0 010-1.5h5.5a.75.75 0 01.75.75v5.5a.75.75 0 01-1.5 0V6.56l-5.22 5.22a.75.75 0 01-1.06 0z" clipRule="evenodd"/></svg>
              </a>
            )
          ))}
        </div>
      )}

      {/* General crew maps (only when there are no stages, e.g. custom/calendar packs) */}
      {stages.length === 0 && (
        <div className="space-y-2">
          <p className="text-white/50 text-xs uppercase tracking-widest font-semibold">Your maps</p>
          {crewMaps.filter(m => !m.stage).length > 0 && (
            <div className="grid grid-cols-2 gap-2">{crewMaps.filter(m => !m.stage).map(crewMapRow)}</div>
          )}
          <label className="rl-btn-ghost text-xs cursor-pointer justify-center py-2.5 inline-flex">
            {crewUploading === 'general' ? 'Uploading…' : '+ Add your own map / PDF'}
            <input type="file" accept="image/*,application/pdf" multiple onChange={e => uploadCrewMap('general', e)} className="hidden" disabled={crewUploading === 'general'} />
          </label>
        </div>
      )}

      <div className="space-y-2">
        {stages.map(s => {
          const imgs = stageImages[s.number] || stageImages[String(s.number)] || []
          const myMaps = crewMaps.filter(m => String(m.stage) === String(s.number))
          return (
            <div key={s.number} className="bg-rl-card border border-white/10 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-rl-accent font-bold text-lg w-10 text-center">SS{s.number}</span>
                <div className="flex-1">
                  <p className="text-white font-medium text-sm">{s.name}</p>
                  {s.distance && <p className="text-white/35 text-xs">{s.distance}</p>}
                </div>
              </div>
              {imgs.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {imgs.map((url, i) => (
                    <button key={i} onClick={() => setLightbox(url)} className="w-full">
                      <img src={url} alt={`SS${s.number} map ${i + 1}`}
                        className="w-full aspect-square object-cover rounded-lg border border-white/10" />
                    </button>
                  ))}
                </div>
              )}
              {/* Crew's own maps for this stage + add option, above the notes */}
              {myMaps.length > 0 && <div className="grid grid-cols-2 gap-2 mb-2">{myMaps.map(crewMapRow)}</div>}
              <label className="text-xs text-rl-accent hover:text-white cursor-pointer inline-flex items-center gap-1.5 mb-3">
                {crewUploading === s.number ? 'Uploading…' : '+ Add map / PDF'}
                <input type="file" accept="image/*,application/pdf" multiple onChange={e => uploadCrewMap(s.number, e)} className="hidden" disabled={crewUploading === s.number} />
              </label>
              <textarea value={stageNotes[s.number] || ''} onChange={e => update(s.number, e.target.value)}
                placeholder="Crew notes, hazards, tyre strategy…"
                rows={2} className="rl-textarea text-xs" />
            </div>
          )
        })}
      </div>

      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}

// ─── Pre-Event Tab ───────────────────────────────────────────────────────────

function PreEventTab({ fi, rally }) {
  const regs = rally?.regulations_data || {}
  const noiseLimit = fi?.noiseLimit
  const noiseTesting = fi?.noiseTesting
  const signingOn = fi?.signingOn || []
  const scrutineering = fi?.scrutineering || []
  const rawServiceArea = fi?.serviceArea || regs?.serviceArea
  const serviceAreaLocation = typeof rawServiceArea === 'object'
    ? [rawServiceArea.location, rawServiceArea.openTime].filter(Boolean).join(' · ')
    : toStr(rawServiceArea)
  const serviceAreaNotes = typeof rawServiceArea === 'object' ? rawServiceArea.notes : null
  const importantNotes = fi?.importantNotes || []
  const hasFiData = fi && Object.keys(fi).length > 0

  // Even without FI, show what we have from regulations
  const hasAnyData = noiseLimit || noiseTesting || rawServiceArea || signingOn.length > 0
    || scrutineering.length > 0 || regs?.rallyHQ || regs?.clerkOfCourse

  if (!hasAnyData) {
    return (
      <div className="text-center py-16 bg-rl-card border border-white/8 rounded-xl">
        <p className="text-white/30 text-sm">Pre-event information will appear here once the organiser uploads the Final Instructions on RallyGo.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {(noiseLimit || noiseTesting) && (
        <div className="bg-rl-card border border-rl-accent/25 rounded-xl p-5">
          <p className="text-rl-accent text-[11px] uppercase tracking-widest font-semibold mb-1">Noise limit</p>
          {noiseLimit
            ? <p className="text-white text-3xl font-bold">{toStr(noiseLimit)}</p>
            : noiseTesting?.limit && <p className="text-white text-3xl font-bold">{toStr(noiseTesting.limit)}</p>
          }
          {noiseTesting && (noiseTesting.times || noiseTesting.location) && (
            <div className="mt-2 space-y-0.5">
              {noiseTesting.times && <p className="text-white/50 text-sm">{noiseTesting.times}</p>}
              {noiseTesting.location && <p className="text-white/35 text-xs">{noiseTesting.location}</p>}
            </div>
          )}
        </div>
      )}

      {/* Key info from regulations when no FI yet */}
      {!hasFiData && (regs.rallyHQ || regs.clerkOfCourse || regs.totalStageDistance) && (
        <div className="bg-rl-card border border-white/10 rounded-xl p-4 grid grid-cols-2 gap-4">
          {regs.rallyHQ && (
            <div>
              <p className="text-white/35 text-xs uppercase tracking-wide mb-1">Rally HQ</p>
              <p className="text-white text-sm">{regs.rallyHQ}</p>
            </div>
          )}
          {regs.clerkOfCourse && (
            <div>
              <p className="text-white/35 text-xs uppercase tracking-wide mb-1">Clerk of Course</p>
              <p className="text-white text-sm">{regs.clerkOfCourse}</p>
            </div>
          )}
          {regs.totalStageDistance && (
            <div>
              <p className="text-white/35 text-xs uppercase tracking-wide mb-1">Total stage distance</p>
              <p className="text-white text-sm">{regs.totalStageDistance}</p>
            </div>
          )}
          {regs.reconDate && (
            <div>
              <p className="text-white/35 text-xs uppercase tracking-wide mb-1">Recce</p>
              <p className="text-white text-sm">{regs.reconDate}</p>
            </div>
          )}
        </div>
      )}

      {serviceAreaLocation && (
        <div className="bg-rl-card border border-white/10 rounded-xl px-4 py-3.5">
          <p className="text-white/35 text-xs uppercase tracking-wide mb-1.5">Service area</p>
          <p className="text-white text-sm font-medium mb-1">{serviceAreaLocation}</p>
          {serviceAreaNotes && <p className="text-white/40 text-xs leading-relaxed">{serviceAreaNotes}</p>}
        </div>
      )}

      {signingOn.length > 0 && (
        <div>
          <h3 className="text-white/60 text-xs uppercase tracking-widest font-semibold mb-3">Signing on</h3>
          <div className="bg-rl-card border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
            {signingOn.map((row, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white text-sm">{toStr(row.carRange || row.cars || row.competitors || row.day || '-')}</span>
                  <span className="text-rl-accent font-mono text-sm font-medium flex-shrink-0">{toStr(row.time || row.times || '-')}</span>
                </div>
                {row.location && <p className="text-white/60 text-xs mt-0.5">{toStr(row.location)}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {scrutineering.length > 0 && (
        <div>
          <h3 className="text-white/60 text-xs uppercase tracking-widest font-semibold mb-3">Scrutineering</h3>
          <div className="bg-rl-card border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
            {scrutineering.map((row, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white text-sm">{toStr(row.carRange || row.cars || row.competitors || row.day || '-')}</span>
                  <span className="text-rl-accent font-mono text-sm font-medium flex-shrink-0">{toStr(row.time || row.times || '-')}</span>
                </div>
                {row.location && <p className="text-white/60 text-xs mt-0.5">{toStr(row.location)}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {importantNotes.length > 0 && (
        <div>
          <h3 className="text-white/60 text-xs uppercase tracking-widest font-semibold mb-3">Important notes</h3>
          <ul className="space-y-2">
            {importantNotes.map((note, i) => (
              <li key={i} className="flex gap-2 text-sm text-white/70 bg-rl-card border border-white/8 rounded-lg px-4 py-3">
                <span className="text-rl-accent mt-0.5 flex-shrink-0">→</span>
                <span>{toStr(note)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Fuel Tab ────────────────────────────────────────────────────────────────

const DEFAULT_START_ROW = { id: 'start', label: 'Fuel at start', location: '', fuel: '', notes: '' }

function FuelTab({ pack, onSave }) {
  const [start, setStart] = useState(() =>
    pack?.fuel_schedule?.find(r => r.id === 'start') || { ...DEFAULT_START_ROW }
  )
  const [refuels, setRefuels] = useState(() =>
    (pack?.fuel_schedule || []).filter(r => r.id !== 'start')
  )
  const [reserve, setReserve] = useState(pack?.fuel_reserve || '')
  const [dirty, setDirty] = useState(false)

  function save(nextStart, nextRefuels) {
    onSave({ fuel_schedule: [nextStart, ...nextRefuels], fuel_reserve: reserve.trim() })
    setDirty(false)
  }

  function updateStart(field, val) {
    const next = { ...start, [field]: val }
    setStart(next)
    setDirty(true)
  }

  function updateRefuel(i, field, val) {
    const next = refuels.map((r, idx) => idx === i ? { ...r, [field]: val } : r)
    setRefuels(next)
    setDirty(true)
  }

  function addRefuel() {
    const next = [...refuels, { id: `refuel-${Date.now()}`, label: `Refuel ${refuels.length + 1}`, location: '', fuel: '', notes: '' }]
    setRefuels(next)
    setDirty(true)
  }

  function deleteRefuel(i) {
    const next = refuels
      .filter((_, idx) => idx !== i)
      .map((r, idx) => ({ ...r, label: `Refuel ${idx + 1}` }))
    setRefuels(next)
    setDirty(true)
  }

  const gaugeTotal = [start, ...refuels].reduce((sum, r) => sum + (parseFloat(r.fuel) || 0), 0)
  const reserveL = parseFloat(reserve) || 0
  const refuelCount = refuels.filter(r => (parseFloat(r.fuel) || 0) > 0).length
  const projectedTotal = gaugeTotal - reserveL * refuelCount

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-medium">Fuel plan</h2>
          <p className="text-white/35 text-xs mt-0.5">Starting fuel plus refuel stops</p>
        </div>
        {dirty && (
          <button onClick={() => save(start, refuels)} className="rl-btn-primary text-xs">Save</button>
        )}
      </div>

      {/* Reserve setting */}
      <div className="bg-rl-card border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-white text-sm font-medium">Reserve in tank</p>
          <p className="text-white/35 text-xs mt-0.5">Litres always in the tank that never get used — deducted from the total at each refuel</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <input type="number" value={reserve} min="0" step="0.5" placeholder="0"
            onChange={e => { setReserve(e.target.value); setDirty(true) }}
            className="rl-input text-sm w-20 text-center" />
          <span className="text-white/35 text-xs">L</span>
        </div>
      </div>

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

      <FuelCard label="Fuel at start" data={start} onChange={updateStart} fixed />

      {refuels.map((r, i) => (
        <FuelCard key={r.id} label={r.label} data={r}
          onChange={(field, val) => updateRefuel(i, field, val)}
          onDelete={() => deleteRefuel(i)} />
      ))}

      <button
        onClick={addRefuel}
        className="w-full border border-dashed border-white/15 rounded-xl py-3.5 text-white/35 hover:text-white/60 hover:border-white/25 text-sm transition-all"
      >
        + Add refuel stop
      </button>
    </div>
  )
}

function FuelCard({ label, data, onChange, onDelete, fixed }) {
  return (
    <div className="bg-rl-card border border-white/10 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-white font-medium text-sm">{label}</p>
        {!fixed && (
          <button onClick={onDelete} className="text-white/20 hover:text-red-400 transition-colors text-xs">
            Remove
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-white/35 text-xs mb-1">Location</p>
          <input value={data.location || ''} onChange={e => onChange('location', e.target.value)}
            placeholder="Where" className="rl-input text-sm w-full" />
        </div>
        <div>
          <p className="text-white/35 text-xs mb-1">{fixed ? 'Litres' : 'Litres showing on gauge'}</p>
          <input type="number" value={data.fuel || ''} onChange={e => onChange('fuel', e.target.value)}
            placeholder="0" min="0" step="0.5" className="rl-input text-sm w-full" />
        </div>
      </div>
      <div>
        <p className="text-white/35 text-xs mb-1">Notes</p>
        <input value={data.notes || ''} onChange={e => onChange('notes', e.target.value)}
          placeholder="e.g. after SS4, left side of road" className="rl-input text-sm w-full" />
      </div>
    </div>
  )
}

// ─── Recce Tab ───────────────────────────────────────────────────────────────

function RecceTab({ pack, stages, rally, onSave }) {
  const [notes, setNotes] = useState(pack?.recce_notes || {})
  const [dirty, setDirty] = useState(false)
  const recce = rally?.regulations_data?.recce
  const reconDate = rally?.regulations_data?.reconDate

  function update(num, val) {
    setNotes(n => ({ ...n, [num]: val }))
    setDirty(true)
  }

  return (
    <div className="space-y-4">

      {/* Extracted recce info from regulations */}
      {(recce?.dates?.length > 0 || recce?.speedLimit || recce?.passes || recce?.notes || reconDate) && (
        <div className="bg-rl-card border border-white/10 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-white/4 border-b border-white/8">
            <p className="text-white/50 text-[11px] uppercase tracking-widest font-medium">From regulations</p>
          </div>
          <div className="divide-y divide-white/8">
            {recce?.dates?.length > 0 ? (
              <div className="px-4 py-3">
                <p className="text-white/35 text-[10px] uppercase tracking-wide mb-2">Sessions</p>
                <div className="space-y-2">
                  {recce.dates.map((d, i) => (
                    <div key={i}>
                      <p className="text-white text-sm font-medium">{d.day}</p>
                      {d.times && <p className="text-white/60 text-xs">{d.times}</p>}
                      {d.startLocation && <p className="text-white/40 text-xs">{d.startLocation}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ) : reconDate ? (
              <div className="px-4 py-3">
                <p className="text-white/35 text-[10px] uppercase tracking-wide mb-1">Date</p>
                <p className="text-white text-sm">{reconDate}</p>
              </div>
            ) : null}
            {recce?.speedLimit && (
              <div className="px-4 py-3">
                <p className="text-white/35 text-[10px] uppercase tracking-wide mb-1">Speed limit</p>
                <p className="text-white text-sm">{recce.speedLimit}</p>
              </div>
            )}
            {recce?.passes && (
              <div className="px-4 py-3">
                <p className="text-white/35 text-[10px] uppercase tracking-wide mb-1">Passes</p>
                <p className="text-white text-sm">{recce.passes}</p>
              </div>
            )}
            {recce?.notes && (
              <div className="px-4 py-3">
                <p className="text-white/35 text-[10px] uppercase tracking-wide mb-1">Rules</p>
                <p className="text-white/70 text-xs leading-relaxed">{recce.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-medium">Recce notes</h2>
          <p className="text-white/35 text-xs mt-0.5">Per-stage notes from reconnaissance — visible to the whole team</p>
        </div>
        {dirty && (
          <button onClick={() => { onSave({ recce_notes: notes }); setDirty(false) }}
            className="rl-btn-primary text-xs">Save notes</button>
        )}
      </div>

      {stages.length === 0 ? (
        <textarea value={notes.general || ''} onChange={e => update('general', e.target.value)}
          placeholder="General recce notes…" rows={12} className="rl-textarea" />
      ) : (
        <div className="space-y-2">
          {stages.map(s => (
            <div key={s.number} className="bg-rl-card border border-white/10 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-rl-accent font-bold text-base w-10 text-center">SS{s.number}</span>
                <div>
                  <p className="text-white font-medium text-sm">{s.name}</p>
                  {s.distance && <p className="text-white/30 text-xs">{s.distance}</p>}
                </div>
              </div>
              <textarea value={notes[s.number] || ''} onChange={e => update(s.number, e.target.value)}
                placeholder="Hazards, cuts, surface changes, notes for pacenotes…"
                rows={3} className="rl-textarea text-xs" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Locations Tab ───────────────────────────────────────────────────────────

const PIN_TYPES = [
  { id: 'postcode', label: 'Postcode', placeholder: 'e.g. CA3 8RE' },
  { id: 'w3w',      label: '///what3words', placeholder: 'e.g. filled.count.soap' },
  { id: 'apple',    label: 'Apple Maps', placeholder: 'Paste link from Apple Maps share' },
]
const PIN_KEYS = ['postcode', 'w3w', 'apple']

function pinUrl(type, value) {
  if (!value) return null
  if (type === 'postcode') return `https://maps.apple.com/?q=${encodeURIComponent(value)}`
  if (type === 'w3w') {
    const clean = value.replace(/^\/\/\//, '')
    return `https://what3words.com/${clean}`
  }
  return value // apple maps URL as-is
}

const LOCATION_FIELDS = [
  { key: 'hotel',       label: 'Accommodation',         color: '#f59e0b', rooming: true },
  { key: 'hq',          label: 'HQ / start',            color: '#06b6d4' },
  { key: 'servicepark', label: 'Service park',          color: '#10b981' },
  { key: 'refuel',      label: 'Refuel',                color: '#f97316' },
  { key: 'noise',       label: 'Noise / scrutineering', color: '#a78bfa' },
  { key: 'trailerpark', label: 'Trailer park',          color: '#6366f1' },
  { key: 'hospital',    label: 'Nearest hospital',      color: '#ef4444' },
]

// Old format stored one { pinType, pin }; new format stores postcode/w3w/apple side by side.
// Fold any legacy single pin into its matching field so nothing is lost.
function migrateEntry(entry) {
  if (!entry) return {}
  if (entry.pinType && entry.pin && !entry[entry.pinType]) {
    return { ...entry, [entry.pinType]: entry.pin }
  }
  return entry
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

function occupantNames(str) {
  return String(str || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean)
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

function PinBadge({ type, value }) {
  if (!value) return null
  const url = pinUrl(type, value)
  const labels = { postcode: 'Map', w3w: '///w3w', apple: 'Maps' }
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors no-underline flex-shrink-0">
      <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/>
      </svg>
      {labels[type] || 'Open'}
    </a>
  )
}

function LocField({ label, value, onChange, placeholder, type = 'text', rows }) {
  return (
    <div>
      <p className="text-white/35 text-[10px] uppercase tracking-wide mb-1">{label}</p>
      {rows ? (
        <textarea value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          rows={rows} className="rl-textarea text-sm w-full" />
      ) : (
        <input value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          type={type} className="rl-input text-sm w-full" />
      )}
    </div>
  )
}

// ── Rooming list ─────────────────────────────────────────────────────────────
function RoomingList({ rooms, contacts, onChange }) {
  const list = Array.isArray(rooms) ? rooms : []
  const placed = new Set(list.flatMap(r => occupantNames(r.occupants).map(n => n.toLowerCase())))
  const unplaced = (contacts || []).map(c => c.name).filter(n => n && !placed.has(n.toLowerCase()))
  const people = list.reduce((n, r) => n + occupantNames(r.occupants).length, 0)

  function addRoom() {
    onChange([...list, { id: `room-${Date.now()}`, room: '', occupants: '', notes: '' }])
  }
  function update(id, field, val) {
    onChange(list.map(r => r.id === id ? { ...r, [field]: val } : r))
  }
  function remove(id) {
    onChange(list.filter(r => r.id !== id))
  }
  function addPerson(id, name) {
    const row = list.find(r => r.id === id)
    const names = occupantNames(row?.occupants)
    if (names.some(n => n.toLowerCase() === name.toLowerCase())) return
    update(id, 'occupants', [...names, name].join(', '))
  }

  return (
    <div className="bg-rl-card border border-white/10 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BedIcon className="w-4 h-4 text-amber-400" />
          <div>
            <p className="text-white font-medium text-sm">Rooming list</p>
            <p className="text-white/35 text-xs">
              {list.length ? `${list.length} room${list.length === 1 ? '' : 's'} · ${people} ${people === 1 ? 'person' : 'people'}` : 'Who is sleeping where'}
            </p>
          </div>
        </div>
        <button onClick={addRoom} className="rl-btn-primary text-xs">+ Room</button>
      </div>

      {list.length === 0 ? (
        <p className="text-white/30 text-xs">No rooms added yet — add one and assign the crew.</p>
      ) : (
        <div className="space-y-2">
          {list.map((r, i) => (
            <div key={r.id} className="bg-white/5 border border-white/10 rounded-lg p-3 space-y-2.5">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <LocField label={`Room ${i + 1}`} value={r.room} onChange={v => update(r.id, 'room', v)}
                    placeholder="e.g. Room 204 — twin" />
                </div>
                <button onClick={() => remove(r.id)} className="text-red-400/50 hover:text-red-400 text-xs mt-5 flex-shrink-0">Remove</button>
              </div>
              <LocField label="Occupants" value={r.occupants} onChange={v => update(r.id, 'occupants', v)}
                placeholder="Comma-separated names" />
              {unplaced.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {unplaced.map(n => (
                    <button key={n} onClick={() => addPerson(r.id, n)}
                      className="text-[11px] px-2 py-1 rounded-md bg-rl-accent/10 text-rl-accent border border-rl-accent/25 hover:bg-rl-accent/20 transition-colors">
                      + {n}
                    </button>
                  ))}
                </div>
              )}
              <LocField label="Notes" value={r.notes} onChange={v => update(r.id, 'notes', v)}
                placeholder="e.g. Late check-in, paid on team card" />
            </div>
          ))}
        </div>
      )}
      {(contacts || []).length === 0 && (
        <p className="text-white/25 text-[11px]">Tip: add crew in the Team tab and they appear here as one-tap chips.</p>
      )}
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

// Work out a lat/lon for a location from whatever the crew typed in.
async function geocodeEntry(entry) {
  const e = entry || {}
  const blob = [e.postcode, e.text, e.address].filter(Boolean).join(' ')
  const pair = blob.match(/(-?\d{1,2}\.\d{3,})\s*[, ]\s*(-?\d{1,3}\.\d{3,})/)
  if (pair) return { lat: +pair[1], lon: +pair[2], src: 'coordinates' }

  if (e.apple) {
    const m = e.apple.match(/[?&](?:ll|q|sll|daddr|coordinate)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/)
    if (m) return { lat: +m[1], lon: +m[2], src: 'Apple Maps link' }
  }

  const pc = (e.postcode || '').replace(/\s+/g, '').toUpperCase()
  if (/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(pc)) {
    const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`).then(r => r.json()).catch(() => null)
    if (r?.result) return { lat: r.result.latitude, lon: r.result.longitude, src: 'postcode' }
  }
  const outcode = pc.match(/^[A-Z]{1,2}\d[A-Z\d]?/)?.[0]
  if (outcode) {
    const r = await fetch(`https://api.postcodes.io/outcodes/${encodeURIComponent(outcode)}`).then(r => r.json()).catch(() => null)
    if (r?.result) return { lat: r.result.latitude, lon: r.result.longitude, src: `${outcode} area` }
  }

  const place = (e.address || '').split('\n').map(s => s.trim()).filter(Boolean).pop() || e.text
  if (place) {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&country=GB`)
      .then(r => r.json()).catch(() => null)
    const hit = r?.results?.[0]
    if (hit) return { lat: hit.latitude, lon: hit.longitude, src: hit.name }
  }
  return null
}

// What should show on this location's tile: an uploaded diagram, a map, or nothing.
function tilePicture(entry) {
  const e = migrateEntry(entry)
  const mode = e.pic || (e.image_url ? 'image' : (e.coords ? 'map' : 'none'))
  if (mode === 'image' && e.image_url) return { mode: 'image', url: e.image_url }
  if (mode === 'map' && e.coords) return { mode: 'map', coords: e.coords }
  return { mode: 'none' }
}

// ── The picture that stays on the tile: a map, or an uploaded diagram ────────
const PIC_MODES = [
  { id: 'map', label: 'Map' },
  { id: 'image', label: 'Diagram' },
  { id: 'none', label: 'None' },
]

function LocationPicture({ loc, packId, onField }) {
  const e = loc.entry
  const mode = e.pic || (e.image_url ? 'image' : (e.coords ? 'map' : 'none'))
  const [locating, setLocating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const tried = useRef(false)

  async function locate(quiet) {
    setLocating(true)
    const hit = await geocodeEntry(e)
    setLocating(false)
    if (!hit) { if (!quiet) toast.error('Couldn\'t place that — add a postcode or address first'); return }
    onField('coords', { lat: hit.lat, lon: hit.lon, src: hit.src })
    if (!quiet) toast.success(`Map placed from ${hit.src}`)
  }

  // First time someone picks Map, place it automatically from what's already typed in.
  useEffect(() => {
    if (mode === 'map' && !e.coords && !tried.current) {
      tried.current = true
      locate(true)
    }
  }) // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(ev) {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file) return
    setUploading(true)
    let body = file, ext = 'jpg', contentType = 'image/jpeg'
    try { body = await reencodeImage(file) }
    catch { body = file; ext = (file.name.split('.').pop() || 'jpg'); contentType = file.type || 'image/jpeg' }
    const path = `location-images/${packId || 'pack'}/${loc.key}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('rally-docs').upload(path, body, { contentType, upsert: true })
    setUploading(false)
    if (error) { toast.error(`Upload failed: ${error.message}`); return }
    const { data: { publicUrl } } = supabase.storage.from('rally-docs').getPublicUrl(path)
    onField('image_url', publicUrl)
    onField('pic', 'image')
    toast.success('Diagram added')
  }

  const firstPin = PIN_KEYS.find(p => e[p])

  return (
    <div className="bg-rl-card border border-white/10 rounded-xl p-4 space-y-3">
      <div>
        <p className="text-white font-medium text-sm">Tile picture</p>
        <p className="text-white/35 text-xs mt-0.5">Stays visible on the Locations tile — no need to open anything</p>
      </div>

      <div className="inline-flex rounded-lg border border-white/10 overflow-hidden w-full">
        {PIC_MODES.map(m => (
          <button key={m.id} type="button" onClick={() => onField('pic', m.id)}
            className={`flex-1 px-2 py-2 text-xs font-semibold transition-colors ${mode === m.id ? 'bg-rl-accent text-white' : 'bg-white/5 text-white/45 hover:text-white/80'}`}>
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'map' && (
        <div className="space-y-2">
          {e.coords ? (
            <>
              <div className="rounded-xl overflow-hidden border border-white/10">
                <MiniMap lat={e.coords.lat} lon={e.coords.lon} zoom={15} halfW={340} halfH={90} className="w-full h-44" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-white/35 text-[11px] truncate">
                  Placed from {e.coords.src || 'your details'} · {e.coords.lat.toFixed(4)}, {e.coords.lon.toFixed(4)}
                </p>
                <button onClick={() => locate(false)} disabled={locating}
                  className="rl-btn-ghost text-xs flex-shrink-0">{locating ? 'Locating…' : 'Re-locate'}</button>
              </div>
              {firstPin && (
                <a href={pinUrl(firstPin, e[firstPin])} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-cyan-500/12 text-cyan-400 border border-cyan-500/25 hover:bg-cyan-500/20 transition-colors no-underline text-sm font-medium">
                  <MapPinIcon className="w-4 h-4" />
                  Open in maps
                </a>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center space-y-2">
              <p className="text-white/40 text-xs">
                {locating ? 'Looking it up…' : 'Add a postcode or address above, then place the map.'}
              </p>
              <button onClick={() => locate(false)} disabled={locating} className="rl-btn-primary text-xs">
                {locating ? 'Locating…' : 'Place map'}
              </button>
            </div>
          )}
        </div>
      )}

      {mode === 'image' && (
        <div className="space-y-2">
          {e.image_url ? (
            <>
              <button onClick={() => setLightbox(e.image_url)} className="block w-full rounded-xl overflow-hidden border border-white/10">
                <img src={e.image_url} alt="" className="w-full h-44 object-cover" />
              </button>
              <div className="flex items-center justify-between gap-3">
                <p className="text-white/35 text-[11px]">Tap to view full size</p>
                <button onClick={() => { onField('image_url', ''); onField('pic', 'none') }}
                  className="text-red-400/60 hover:text-red-400 text-xs flex-shrink-0">Remove</button>
              </div>
            </>
          ) : (
            <label className="block rounded-xl border border-dashed border-white/15 px-4 py-6 text-center cursor-pointer hover:border-white/30 transition-colors">
              <p className="text-white/40 text-xs mb-2">Service park layout, hotel plan, hand-drawn sketch — anything.</p>
              <span className="rl-btn-primary text-xs inline-flex">{uploading ? 'Uploading…' : 'Upload a diagram'}</span>
              <input type="file" accept="image/*" onChange={upload} disabled={uploading} className="hidden" />
            </label>
          )}
        </div>
      )}

      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}

// ── One location, expanded ───────────────────────────────────────────────────
function LocationDetail({ loc, contacts, packId, onField, onRemove }) {
  const e = loc.entry
  const anyPin = PIN_KEYS.some(p => e[p])
  const firstPin = PIN_KEYS.find(p => e[p])
  const picMode = e.pic || (e.image_url ? 'image' : (e.coords ? 'map' : 'none'))

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: loc.color + '20', color: loc.color }}>
          <MapPinIcon className="w-5 h-5" />
        </div>
        {loc.custom ? (
          <input value={loc.label} onChange={ev => onField('label', ev.target.value)}
            placeholder="Location name" className="rl-input text-base font-semibold flex-1" />
        ) : (
          <h3 className="text-white font-semibold text-lg">{loc.label}</h3>
        )}
      </div>

      <LocationPicture loc={loc} packId={packId} onField={onField} />

      {anyPin && picMode !== 'map' && (
        <a href={pinUrl(firstPin, e[firstPin])} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-cyan-500/12 text-cyan-400 border border-cyan-500/25 hover:bg-cyan-500/20 transition-colors no-underline text-sm font-medium">
          <MapPinIcon className="w-4 h-4" />
          Open in maps
        </a>
      )}

      <div className="bg-rl-card border border-white/10 rounded-xl p-4 space-y-3">
        <p className="text-white font-medium text-sm">Where</p>
        <LocField label="Name / description" value={e.text} onChange={v => onField('text', v)}
          placeholder="e.g. Premier Inn Carlisle Central" />
        <LocField label="Address" value={e.address} onChange={v => onField('address', v)}
          placeholder={'Street\nTown\nPostcode'} rows={3} />
        {PIN_TYPES.map(pt => (
          <div key={pt.id}>
            <p className="text-white/35 text-[10px] uppercase tracking-wide mb-1">{pt.label}</p>
            <div className="flex gap-2 items-center">
              <input value={e[pt.id] || ''} onChange={ev => onField(pt.id, ev.target.value)}
                placeholder={pt.placeholder} className="rl-input text-sm flex-1" />
              <PinBadge type={pt.id} value={e[pt.id]} />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-rl-card border border-white/10 rounded-xl p-4 space-y-3">
        <p className="text-white font-medium text-sm">Details</p>
        <div className="grid grid-cols-2 gap-3">
          <LocField label="Phone" value={e.phone} onChange={v => onField('phone', v)} placeholder="+44 …" type="tel" />
          <LocField label="Booking ref" value={e.ref} onChange={v => onField('ref', v)} placeholder="e.g. BK-88213" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <LocField label="Check-in / opens" value={e.arrive} onChange={v => onField('arrive', v)} placeholder="e.g. Fri 15:00" />
          <LocField label="Check-out / closes" value={e.depart} onChange={v => onField('depart', v)} placeholder="e.g. Sun 10:00" />
        </div>
        <LocField label="Website / booking link" value={e.link} onChange={v => onField('link', v)} placeholder="https://…" />
        <div className="flex flex-wrap gap-2">
          {e.phone && (
            <a href={`tel:${e.phone.replace(/\s+/g, '')}`}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-green-500/12 text-green-600 border border-green-500/25 hover:bg-green-500/20 transition-colors no-underline">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/>
              </svg>
              Call
            </a>
          )}
          {e.link && (
            <a href={e.link} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-blue-500/12 text-blue-600 border border-blue-500/25 hover:bg-blue-500/20 transition-colors no-underline">
              Open link
            </a>
          )}
        </div>
      </div>

      <div className="bg-rl-card border border-white/10 rounded-xl p-4 space-y-2">
        <p className="text-white font-medium text-sm">Notes</p>
        <textarea value={e.notes || ''} onChange={ev => onField('notes', ev.target.value)}
          placeholder="Anything the team needs to know about this location…"
          rows={4} className="rl-textarea text-sm w-full" />
      </div>

      {loc.rooming && (
        <RoomingList rooms={e.rooms} contacts={contacts} onChange={v => onField('rooms', v)} />
      )}

      {loc.custom && (
        <div className="bg-rl-card border border-white/10 rounded-xl p-4 space-y-3">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={!!loc.rooming} onChange={ev => onField('rooming', ev.target.checked)}
              className="w-4 h-4 accent-rl-accent" />
            <span className="text-white/70 text-sm">This is accommodation — show a rooming list</span>
          </label>
          <button onClick={onRemove} className="text-red-400/60 hover:text-red-400 text-xs">Delete this location</button>
        </div>
      )}
    </div>
  )
}

function LocationsTab({ pack, onSave }) {
  const [locs, setLocs] = useState(() => pack?.locations || {})
  const [dirty, setDirty] = useState(false)
  const [open, setOpen] = useState(null)

  const customList = Array.isArray(locs._custom) ? locs._custom : []
  const contacts = pack?.team_members || []

  const allLocations = [
    ...LOCATION_FIELDS.map(f => ({ ...f, entry: migrateEntry(locs[f.key]) })),
    ...customList.map(c => ({
      key: c.id, label: c.label || 'Location', color: c.color || '#94a3b8',
      rooming: !!c.rooming, custom: true, entry: migrateEntry(c),
    })),
  ]
  const openLoc = allLocations.find(l => l.key === open) || null

  function updateField(key, field, val) {
    setDirty(true)
    setLocs(prev => {
      const cust = Array.isArray(prev._custom) ? prev._custom : []
      if (cust.some(c => c.id === key)) {
        return { ...prev, _custom: cust.map(c => c.id === key ? { ...c, [field]: val } : c) }
      }
      return { ...prev, [key]: { ...(prev[key] || {}), [field]: val } }
    })
  }

  function addCustom() {
    const id = `loc-${Date.now()}`
    setLocs(prev => ({
      ...prev,
      _custom: [...(Array.isArray(prev._custom) ? prev._custom : []), { id, label: '', color: '#94a3b8' }],
    }))
    setDirty(true)
    setOpen(id)
  }

  function removeCustom(id) {
    setLocs(prev => ({ ...prev, _custom: (Array.isArray(prev._custom) ? prev._custom : []).filter(c => c.id !== id) }))
    setDirty(true)
    setOpen(null)
  }

  function handleSave(next) {
    const payload = next || locs
    onSave({ locations: payload })
    setDirty(false)
  }

  function closeDetail() {
    if (dirty) handleSave()
    setOpen(null)
  }

  if (openLoc) {
    return (
      <div className="space-y-4">
<BackBar label="All locations" sublabel={openLoc.label || undefined} onClick={closeDetail} />

        <LocationDetail
          loc={openLoc}
          contacts={contacts}
          packId={pack?.id}
          onField={(f, v) => updateField(openLoc.key, f, v)}
          onRemove={() => removeCustom(openLoc.key)}
        />

        {dirty && (
          <button onClick={() => handleSave()} className="rl-btn-primary w-full justify-center sticky bottom-4">
            Save {openLoc.label || 'location'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-medium">Locations</h2>
          <p className="text-white/35 text-xs mt-0.5">Tap a location for addresses, contacts and notes</p>
        </div>
        {dirty && <button onClick={() => handleSave()} className="rl-btn-primary text-xs">Save</button>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {allLocations.map(l => {
          const filled = entryHasDetail(l.entry)
          const summary = entrySummary(l.entry)
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
                <p className="text-white font-semibold text-sm leading-tight">{l.label || 'Untitled location'}</p>
                <p className={`text-xs mt-1 line-clamp-2 ${filled ? 'text-white/45' : 'text-white/20 italic'}`}>
                  {filled ? (summary || 'Details added') : 'Not set'}
                </p>
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

        <button onClick={addCustom}
          className="flex flex-col items-center justify-center gap-2 min-h-[7.5rem] rounded-2xl border border-dashed border-white/20 hover:border-white/40 text-white/40 hover:text-white/70 transition-all active:scale-[0.98]">
          <span className="text-2xl leading-none">+</span>
          <span className="text-xs font-medium">Add location</span>
        </button>
      </div>

      <div className="bg-rl-card border border-white/10 rounded-xl p-4 space-y-2">
        <p className="text-white font-medium text-sm">Extra notes</p>
        <textarea
          value={locs.notes || ''}
          onChange={e => { setLocs(prev => ({ ...prev, notes: e.target.value })); setDirty(true) }}
          placeholder="Any other location info for the team…"
          rows={3}
          className="rl-textarea text-sm w-full"
        />
      </div>

      {dirty && (
        <button onClick={() => handleSave()} className="rl-btn-primary w-full justify-center">Save locations</button>
      )}
    </div>
  )
}


// ─── Car Setup Tab ────────────────────────────────────────────────────────────

function CarSetupTab({ pack, rally, onSave }) {
  const [images, setImages] = useState(() => pack?.setup_sheet_urls || [])
  const [changes, setChanges] = useState(() => pack?.setup_changes || '')
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [dirty, setDirty] = useState(false)

  async function handleUpload(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    const uploaded = []
    for (const file of files) {
      const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
      let body = file, ext = 'jpg', contentType = 'image/jpeg'
      if (pdf) {
        body = file; ext = 'pdf'; contentType = 'application/pdf'
      } else {
        try { body = await reencodeImage(file) } catch { body = file; ext = (file.name.split('.').pop() || 'jpg') }
      }
      const path = `setup-sheets/${rally.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error } = await supabase.storage.from('rally-docs').upload(path, body, { upsert: true, contentType })
      if (error) { toast.error(`Upload failed: ${error.message || file.name}`); continue }
      const { data: { publicUrl } } = supabase.storage.from('rally-docs').getPublicUrl(path)
      uploaded.push(publicUrl)
    }
    e.target.value = ''
    if (!uploaded.length) { setUploading(false); return }
    const next = [...images, ...uploaded]
    setImages(next)
    onSave({ setup_sheet_urls: next })
    setUploading(false)
    toast.success(uploaded.length > 1 ? `${uploaded.length} files uploaded` : 'Setup sheet uploaded')
  }

  const isPdf = (url) => /\.pdf(\?|$)/i.test(url)

  async function removeImage(url) {
    const next = images.filter(u => u !== url)
    setImages(next)
    onSave({ setup_sheet_urls: next })
  }

  function saveChanges() {
    onSave({ setup_changes: changes })
    setDirty(false)
    toast.success('Saved')
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-white font-medium">Car set-up</h2>
        <p className="text-white/35 text-xs mt-0.5">Setup sheet photos and in-rally changes</p>
      </div>

      {/* Setup sheet images */}
      <div className="space-y-3">
        <p className="text-white/60 text-xs uppercase tracking-widest font-semibold">Setup sheet</p>

        {images.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {images.map((url, i) => (
              <div key={i} className="relative group">
                {isPdf(url) ? (
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    className="w-full aspect-[3/4] rounded-xl border border-white/10 bg-white/5 flex flex-col items-center justify-center gap-2 text-white/60 hover:text-violet-300 no-underline">
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-8 h-8">
                      <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z" />
                    </svg>
                    <span className="text-xs">PDF {i + 1}</span>
                  </a>
                ) : (
                  <button onClick={() => setLightbox(url)} className="w-full">
                    <img src={url} alt={`Setup sheet ${i + 1}`}
                      className="w-full aspect-[3/4] object-cover rounded-xl border border-white/10" />
                  </button>
                )}
                <button
                  onClick={() => removeImage(url)}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 text-white/60 hover:text-red-400 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >✕</button>
              </div>
            ))}
          </div>
        )}

        <label className={`w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-6 cursor-pointer transition-all ${
          uploading ? 'border-white/10 text-white/20' : 'border-white/15 text-white/35 hover:border-violet-400/40 hover:text-violet-300'
        }`}>
          <svg className="w-7 h-7" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd"/>
          </svg>
          <span className="text-sm font-medium">{uploading ? 'Uploading…' : images.length > 0 ? 'Add more' : 'Upload setup sheet'}</span>
          <span className="text-xs text-white/25">Photos or PDFs — take a photo, or choose one or more from your library</span>
          <input type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      {/* Changes during rally */}
      <div className="space-y-2">
        <p className="text-white/60 text-xs uppercase tracking-widest font-semibold">Changes during rally</p>
        <textarea
          value={changes}
          onChange={e => { setChanges(e.target.value); setDirty(true) }}
          placeholder="e.g. Added 1 click front ARB after SS3, softened rear dampers 2 clicks…"
          rows={6}
          className="rl-textarea w-full text-sm"
        />
        {dirty && (
          <button onClick={saveChanges} className="rl-btn-primary w-full justify-center">Save changes</button>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}

// ─── Entry List Tab ──────────────────────────────────────────────────────────

function EntryListTab({ entries, carNumber }) {
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
        <p className="text-white/30 text-sm">Entry list will appear here once the organiser uploads it on RallyGo.</p>
      </div>
    )
  }

  const myEntry = carNumber ? entries.find(e => String(e.car) === String(carNumber)) : null

  return (
    <div className="space-y-4">
      {/* My entry highlight */}
      {myEntry ? (
        <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-4">
          <p className="text-cyan-400 text-[11px] uppercase tracking-widest font-semibold mb-2">Your entry</p>
          <div className="flex items-center gap-4">
            <span className="text-cyan-400 font-bold text-3xl leading-none">#{myEntry.car}</span>
            <div>
              <p className="text-white font-semibold">{myEntry.driver}</p>
              {myEntry.codriver && <p className="text-white/60 text-sm">{myEntry.codriver}</p>}
              <p className="text-white/40 text-xs mt-0.5">{myEntry.vehicle}{myEntry.class ? ` · ${myEntry.class}` : ''}</p>
            </div>
          </div>
        </div>
      ) : carNumber ? (
        <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3">
          <p className="text-amber-400 text-xs">Car #{carNumber} not found in entry list — check your car number is correct.</p>
        </div>
      ) : (
        <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
          <p className="text-white/35 text-xs">Set your car number in the header above to highlight your entry.</p>
        </div>
      )}

      {/* Search */}
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
          const isMe = carNumber && String(e.car) === String(carNumber)
          return (
            <div key={i} className={`px-4 py-3 flex items-center gap-3 ${isMe ? 'bg-cyan-500/8' : ''}`}>
              <span className={`font-bold text-sm w-8 text-center flex-shrink-0 tabular-nums ${isMe ? 'text-cyan-400' : 'text-rl-accent'}`}>
                {e.car}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-white text-sm font-medium truncate">{e.driver}</p>
                  {isMe && <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">You</span>}
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

// ─── Rally Schedule Tab (placeholder) ────────────────────────────────────────

function addMinutesToTime(time, mins) {
  // time "HH:MM" + mins → "HH:MM" (24h, wraps midnight)
  const m = /^(\d{1,2}):(\d{2})$/.exec((time || '').trim())
  if (!m || !mins) return null
  const total = ((parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + mins) % 1440 + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function RallyScheduleTab({ pack, rally, onSave, carNumber }) {
  const [rows, setRows] = useState(pack?.rally_schedule || [])
  const [dirty, setDirty] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const [orgLightbox, setOrgLightbox] = useState(null)
  const scheduleImg = pack?.rally_schedule_image_url          // legacy single slot
  const crewFiles = pack?.rally_schedule_files || []          // new multi-file list
  const orgFiles = rally?.rally_schedule_files || []

  const carNum = parseInt(carNumber, 10)
  // Car 1 is the first car; assume 1-minute start intervals
  const ourOffset = !isNaN(carNum) && carNum > 0 ? carNum - 1 : null

  // Add one or many schedule files (image or PDF) — e.g. Leg 1, Leg 2, Day 2…
  async function uploadImage(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    const added = []
    for (const file of files) {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
      const isImg = file.type.startsWith('image/') || !isPdf
      if (!isPdf && !isImg) { toast.error('Please choose an image or a PDF'); continue }
      try {
        let body = file, ext = 'jpg', contentType = 'image/jpeg'
        if (isPdf) { body = file; ext = 'pdf'; contentType = 'application/pdf' }
        else { try { body = await reencodeImage(file) } catch { body = file; ext = (file.name.split('.').pop() || 'jpg'); contentType = file.type || 'image/jpeg' } }
        const path = `rally-schedule/${pack.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const { error } = await supabase.storage.from('rally-docs').upload(path, body, { contentType, upsert: true })
        if (error) throw error
        const { data: { publicUrl } } = supabase.storage.from('rally-docs').getPublicUrl(path)
        added.push({ id: Date.now() + Math.floor(Math.random() * 1000), label: file.name.replace(/\.[^.]+$/, ''), url: publicUrl, type: isPdf ? 'pdf' : 'image' })
      } catch (err) {
        toast.error(`Upload failed: ${err.message || file.name}`)
      }
    }
    e.target.value = ''
    setUploading(false)
    if (!added.length) return
    onSave({ rally_schedule_files: [...crewFiles, ...added] })
    toast.success(added.length > 1 ? `${added.length} added` : 'Schedule added')
  }

  function removeCrewFile(id) {
    onSave({ rally_schedule_files: crewFiles.filter(m => m.id !== id) })
  }

  function removeLegacyImage() {
    onSave({ rally_schedule_image_url: null })
  }

  const scheduleIsPdf = /\.pdf(\?|$)/i.test(scheduleImg || '')

  function update(i, field, val) {
    setRows(rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
    setDirty(true)
  }

  function addRow() {
    setRows([...rows, { id: Date.now(), control: '', location: '', distance: '', firstCar: '', notes: '' }])
    setDirty(true)
  }

  function deleteRow(i) {
    setRows(rows.filter((_, idx) => idx !== i))
    setDirty(true)
  }

  function saveRows() {
    onSave({ rally_schedule: rows })
    setDirty(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-medium">Rally schedule</h2>
          <p className="text-white/35 text-xs mt-0.5">Time controls & road sections — first car due times{ourOffset !== null ? `. "Us" estimates car #${carNum} at 1-min intervals (+${ourOffset} min)` : ''}</p>
        </div>
        {dirty && <button onClick={saveRows} className="rl-btn-primary text-xs">Save</button>}
      </div>

      {/* Official rally schedule from the organiser (RallyGo) */}
      {orgFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-white/50 text-xs uppercase tracking-widest font-semibold">Official schedule</p>
          {orgFiles.map(m => (
            m.type === 'image' ? (
              <button key={m.id} onClick={() => setOrgLightbox(m.url)} className="w-full text-left">
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
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-white/25 flex-shrink-0"><path fillRule="evenodd" d="M4.22 11.78a.75.75 0 010-1.06L9.44 5.5H5.75a.75.75 0 010-1.5h5.5a.75.75 0 01.75.75v5.5a.75.75 0 01-1.5 0V6.56l-5.22 5.22a.75.75 0 01-1.06 0z" clipRule="evenodd"/></svg>
              </a>
            )
          ))}
        </div>
      )}
      {orgLightbox && <ImageLightbox src={orgLightbox} onClose={() => setOrgLightbox(null)} />}

      {/* Your own schedule — add as many files as you like (Leg 1, Leg 2, Day 2…) */}
      <div className="bg-rl-card border border-white/10 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-white/60 text-xs uppercase tracking-widest font-semibold">Your schedule</p>
          <label className="text-xs text-rl-accent hover:text-white cursor-pointer">
            {uploading ? 'Uploading…' : '+ Add image / PDF'}
            <input type="file" accept="image/*,application/pdf" multiple onChange={uploadImage} className="hidden" disabled={uploading} />
          </label>
        </div>

        {/* Legacy single image, if one was uploaded before */}
        {scheduleImg && (
          <div className="mb-2">
            {scheduleIsPdf ? (
              <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg px-4 py-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-500/15 flex items-center justify-center flex-shrink-0"><svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-indigo-400"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"/></svg></div>
                <a href={scheduleImg} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 no-underline"><p className="text-white text-sm font-medium">Schedule PDF · tap to open</p></a>
                <button onClick={removeLegacyImage} className="text-xs text-red-400/60 hover:text-red-400 flex-shrink-0">Remove</button>
              </div>
            ) : (
              <div className="relative">
                <button onClick={() => setLightbox(scheduleImg)} className="w-full"><img src={scheduleImg} alt="Rally schedule" className="w-full rounded-lg border border-white/10" /></button>
                <button onClick={removeLegacyImage} className="absolute top-2 right-2 text-[11px] px-2 py-1 rounded-md bg-black/70 text-white">Remove</button>
              </div>
            )}
          </div>
        )}

        {/* Multi-file list — preview tiles with title */}
        {crewFiles.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {crewFiles.map(m => (
              <div key={m.id} className="relative bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                {m.type === 'image' ? (
                  <button onClick={() => setLightbox(m.url)} className="block w-full"><img src={m.url} alt={m.label} className="w-full h-32 object-cover" /></button>
                ) : (
                  <a href={m.url} target="_blank" rel="noopener noreferrer" className="flex h-32 flex-col items-center justify-center gap-1.5 bg-indigo-500/10 no-underline"><svg viewBox="0 0 20 20" fill="currentColor" className="w-8 h-8 text-indigo-400"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"/></svg><span className="text-indigo-300 text-[11px]">PDF · tap to open</span></a>
                )}
                <div className="flex items-center gap-2 px-3 py-2">
                  <p className="text-white text-xs font-medium flex-1 min-w-0 truncate">{m.label}</p>
                  <button onClick={() => removeCrewFile(m.id)} className="text-[11px] text-red-400/60 hover:text-red-400 flex-shrink-0">Remove</button>
                </div>
              </div>
            ))}
          </div>
        ) : !scheduleImg && (
          <p className="text-white/30 text-xs">Snap a photo of the printed schedule, or upload PDFs — one per leg or day.</p>
        )}
      </div>

      {rows.length === 0 && (
        <div className="text-center py-10 bg-rl-card border border-white/8 rounded-xl">
          <p className="text-white/30 text-sm">No controls added yet — add them below, or just use the schedule above.</p>
        </div>
      )}

      {typeof lightbox === 'string' && <ImageLightbox src={lightbox} onClose={() => setLightbox(false)} />}

      {rows.map((r, i) => {
        const ourTime = ourOffset ? addMinutesToTime(r.firstCar, ourOffset) : null
        return (
          <div key={r.id || i} className="bg-rl-card border border-white/10 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <input value={r.control || ''} onChange={e => update(i, 'control', e.target.value)}
                placeholder="TC1 / SS1 / MC2…" className="rl-input text-sm font-semibold w-36" />
              <div className="flex items-center gap-3 flex-shrink-0">
                {ourTime && (
                  <span className="text-cyan-400 text-xs font-mono bg-cyan-500/10 border border-cyan-500/25 rounded-lg px-2 py-1">
                    Us: {ourTime}
                  </span>
                )}
                <button onClick={() => deleteRow(i)} className="text-white/20 hover:text-red-400 transition-colors text-xs">Remove</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-white/35 text-xs mb-1">Location</p>
                <input value={r.location || ''} onChange={e => update(i, 'location', e.target.value)}
                  placeholder="Where" className="rl-input text-sm w-full" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-white/35 text-xs mb-1">Dist (mi)</p>
                  <input value={r.distance || ''} onChange={e => update(i, 'distance', e.target.value)}
                    placeholder="0.0" className="rl-input text-sm w-full" />
                </div>
                <div>
                  <p className="text-white/35 text-xs mb-1">1st car due</p>
                  <input value={r.firstCar || ''} onChange={e => update(i, 'firstCar', e.target.value)}
                    placeholder="09:00" className="rl-input text-sm w-full font-mono" />
                </div>
              </div>
            </div>
            <div>
              <p className="text-white/35 text-xs mb-1">Notes</p>
              <input value={r.notes || ''} onChange={e => update(i, 'notes', e.target.value)}
                placeholder="e.g. regroup 20 min, fuel available" className="rl-input text-sm w-full" />
            </div>
          </div>
        )
      })}

      <button
        onClick={addRow}
        className="w-full border border-dashed border-white/15 rounded-xl py-3.5 text-white/35 hover:text-white/60 hover:border-white/25 text-sm transition-all"
      >
        + Add control
      </button>
    </div>
  )
}

// ─── Documents Tab ────────────────────────────────────────────────────────────

function DocumentsTab({ rally, docs }) {
  const regsUrl = rally?.regulations_pdf_url
  const fiUrl = rally?.final_instructions_pdf_url
  const roadbookUrl = rally?.roadbook_pdf_url

  const hasAnything = regsUrl || fiUrl || roadbookUrl || docs?.length > 0

  if (!hasAnything) {
    return (
      <div className="text-center py-16 bg-rl-card border border-white/8 rounded-xl">
        <p className="text-white/30 text-sm">Documents will appear here once the organiser uploads them on RallyGo.</p>
      </div>
    )
  }

  function docLabel(doc) {
    const map = {
      'pre-event': 'Pre-event',
      'route': 'Route',
      'bulletins': 'Bulletin',
      'documents': 'Document',
    }
    return map[doc.section] || doc.section || 'Document'
  }

  return (
    <div className="space-y-3">
      {regsUrl && (
        <a href={regsUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-4 bg-rl-card border border-white/10 rounded-xl px-4 py-3.5 no-underline hover:border-white/20 transition-all group">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-indigo-400">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium text-sm">Regulations</p>
            <p className="text-white/35 text-xs">PDF</p>
          </div>
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-white/25 group-hover:text-white/50 flex-shrink-0">
            <path fillRule="evenodd" d="M4.22 11.78a.75.75 0 010-1.06L9.44 5.5H5.75a.75.75 0 010-1.5h5.5a.75.75 0 01.75.75v5.5a.75.75 0 01-1.5 0V6.56l-5.22 5.22a.75.75 0 01-1.06 0z" clipRule="evenodd"/>
          </svg>
        </a>
      )}

      {fiUrl && (
        <a href={fiUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-4 bg-rl-card border border-white/10 rounded-xl px-4 py-3.5 no-underline hover:border-white/20 transition-all group">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-indigo-400">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium text-sm">Final Instructions</p>
            <p className="text-white/35 text-xs">PDF</p>
          </div>
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-white/25 group-hover:text-white/50 flex-shrink-0">
            <path fillRule="evenodd" d="M4.22 11.78a.75.75 0 010-1.06L9.44 5.5H5.75a.75.75 0 010-1.5h5.5a.75.75 0 01.75.75v5.5a.75.75 0 01-1.5 0V6.56l-5.22 5.22a.75.75 0 01-1.06 0z" clipRule="evenodd"/>
          </svg>
        </a>
      )}

      {roadbookUrl && (
        <a href={roadbookUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-4 bg-rl-card border border-white/10 rounded-xl px-4 py-3.5 no-underline hover:border-white/20 transition-all group">
          <div className="w-9 h-9 rounded-lg bg-orange-500/15 flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-orange-400">
              <path fillRule="evenodd" d="M12 1.586l-4 4v12.828l4-4V1.586zM3.707 3.293A1 1 0 002 4v10a1 1 0 00.293.707L6 18.414V5.586L3.707 3.293zM17.707 5.293L14 1.586v12.828l2.293 2.293A1 1 0 0018 16V6a1 1 0 00-.293-.707z" clipRule="evenodd"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium text-sm">Roadbook</p>
            <p className="text-white/35 text-xs">PDF</p>
          </div>
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-white/25 group-hover:text-white/50 flex-shrink-0">
            <path fillRule="evenodd" d="M4.22 11.78a.75.75 0 010-1.06L9.44 5.5H5.75a.75.75 0 010-1.5h5.5a.75.75 0 01.75.75v5.5a.75.75 0 01-1.5 0V6.56l-5.22 5.22a.75.75 0 01-1.06 0z" clipRule="evenodd"/>
          </svg>
        </a>
      )}

      {docs?.map((doc, i) => (
        <a key={i} href={doc.url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-4 bg-rl-card border border-white/10 rounded-xl px-4 py-3.5 no-underline hover:border-white/20 transition-all group">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-indigo-400">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium text-sm truncate">{doc.title || doc.filename || 'Document'}</p>
            <p className="text-white/35 text-xs">{docLabel(doc)}</p>
          </div>
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-white/25 group-hover:text-white/50 flex-shrink-0">
            <path fillRule="evenodd" d="M4.22 11.78a.75.75 0 010-1.06L9.44 5.5H5.75a.75.75 0 010-1.5h5.5a.75.75 0 01.75.75v5.5a.75.75 0 01-1.5 0V6.56l-5.22 5.22a.75.75 0 01-1.06 0z" clipRule="evenodd"/>
          </svg>
        </a>
      ))}
    </div>
  )
}

// ─── Team Chat Tab ────────────────────────────────────────────────────────────

function TeamChatTab({ rallyId, user, rallyName }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [queueCount, setQueueCount] = useState(0)
  const [lightbox, setLightbox] = useState(null)
  const bottomRef = useRef(null)
  const fileRef = useRef(null)
  const QUEUE_KEY = `rl:chat:queue:${rallyId}`

  function getQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch { return [] }
  }
  function saveQueue(q) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
    setQueueCount(q.length)
  }

  async function flushQueue() {
    const q = getQueue()
    if (q.length === 0) return
    for (const item of q) {
      const { error } = await supabase.from('team_chat_messages').insert(item)
      if (!error) notifyTeam(item)
    }
    saveQueue([])
  }

  useEffect(() => {
    setQueueCount(getQueue().length)

    supabase
      .from('team_chat_messages')
      .select('*')
      .eq('rally_id', rallyId)
      .order('created_at', { ascending: true })
      .limit(200)
      .then(({ data }) => setMessages(data || []))

    const channel = supabase
      .channel(`team-chat-${rallyId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'team_chat_messages',
        filter: `rally_id=eq.${rallyId}`,
      }, payload => {
        setMessages(m => [...m, payload.new])
      })
      .subscribe()

    function handleOnline() {
      setIsOnline(true)
      flushQueue()
    }
    function handleOffline() { setIsOnline(false) }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [rallyId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(msg, imageUrl = null) {
    if (!msg && !imageUrl) return
    const row = {
      rally_id: rallyId,
      user_id: user.id,
      user_email: user.email,
      message: msg || null,
      image_url: imageUrl || null,
    }
    if (!navigator.onLine) {
      saveQueue([...getQueue(), row])
      setText('')
      return
    }
    setSending(true)
    setText('')
    const { error } = await supabase.from('team_chat_messages').insert(row)
    setSending(false)
    if (!error) notifyTeam(row)
  }

  // Fire-and-forget push notification to the rest of the team
  async function notifyTeam(row) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const senderName = (row.user_email || '').split('@')[0]
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          rallyId,
          title: `${rallyName || 'Team chat'} 💬`,
          body: `${senderName}: ${row.message || '📷 Photo'}`,
          app: 'logistics',
          excludeUserId: user.id,
          url: `https://rallylogistics.rallygo.co.uk/pack/${rallyId}`,
        }),
      }).catch(() => {})
    } catch { /* never block chat on push failure */ }
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${rallyId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('team-chat-images').upload(path, file, { upsert: true })
    if (error) { toast.error('Upload failed'); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('team-chat-images').getPublicUrl(path)
    await send(text.trim() || null, publicUrl)
    setText('')
    setUploading(false)
    e.target.value = ''
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  const isMe = (m) => m.user_id === user.id

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 280px)', minHeight: '420px' }}>
      {/* Offline / queue indicator */}
      {(!isOnline || queueCount > 0) && (
        <div className={`mb-3 px-3 py-2 rounded-xl text-xs flex items-center gap-2 ${
          !isOnline
            ? 'bg-amber-500/10 border border-amber-500/25 text-amber-400'
            : 'bg-green-500/10 border border-green-500/25 text-green-400'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${!isOnline ? 'bg-amber-400' : 'bg-green-400 animate-pulse'}`} />
          {!isOnline
            ? queueCount > 0
              ? `Offline — ${queueCount} message${queueCount !== 1 ? 's' : ''} queued, will send when back online`
              : 'Offline — messages will queue and send when you\'re back online'
            : `Sending ${queueCount} queued message${queueCount !== 1 ? 's' : ''}…`
          }
        </div>
      )}

      {/* Messages list */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-2">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-white/20">
                <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd"/>
              </svg>
            </div>
            <p className="text-white/25 text-sm">No messages yet — start the conversation</p>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex gap-2.5 ${isMe(m) ? 'flex-row-reverse' : ''}`}>
              {/* Avatar */}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5 ${isMe(m) ? 'bg-[#22c55e]/20 text-[#22c55e]' : 'bg-white/10 text-white/60'}`}>
                {(m.user_email || '?')[0].toUpperCase()}
              </div>
              {/* Bubble */}
              <div className={`flex flex-col gap-1 max-w-[75%] ${isMe(m) ? 'items-end' : 'items-start'}`}>
                {!isMe(m) && (
                  <p className="text-white/35 text-[10px] px-1 leading-none">{m.user_email?.split('@')[0] || 'Team'}</p>
                )}
                <div className={`text-sm leading-relaxed break-words ${
                  m.image_url && !m.message ? 'p-1' : 'px-3.5 py-2.5'
                } ${
                  isMe(m)
                    ? 'bg-[#22c55e]/12 border border-[#22c55e]/25 text-white rounded-2xl rounded-tr-sm'
                    : 'bg-white/8 border border-white/10 text-white/85 rounded-2xl rounded-tl-sm'
                }`}>
                  {m.image_url && (
                    <button onClick={() => setLightbox(m.image_url)} className="block">
                      <img
                        src={m.image_url}
                        alt="Shared image"
                        className="rounded-xl max-w-full max-h-60 object-cover"
                      />
                    </button>
                  )}
                  {m.message && (
                    <span className={m.image_url ? 'block px-2.5 pb-1 pt-1.5' : ''}>{m.message}</span>
                  )}
                </div>
                <p className="text-white/20 text-[10px] px-1">{fmtTime(m.created_at)}</p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="pt-4 border-t border-white/8 mt-2">
        <div className="flex gap-2 items-end">
          {/* Photo upload button */}
          <label className={`flex-shrink-0 w-10 h-[42px] rounded-xl border flex items-center justify-center cursor-pointer transition-all ${
            uploading
              ? 'bg-white/5 border-white/10 cursor-not-allowed'
              : 'bg-white/7 border-white/15 hover:bg-white/12 hover:border-white/25'
          }`}>
            {uploading ? (
              <span className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            ) : (
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-white/50">
                <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd"/>
              </svg>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleImageUpload}
              disabled={uploading}
            />
          </label>

          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text.trim()) }
            }}
            placeholder={isOnline ? 'Message your team… (Enter to send)' : 'Offline — message will be queued'}
            rows={1}
            className="rl-input flex-1 text-sm resize-none"
            style={{ minHeight: '42px', maxHeight: '120px' }}
          />
          <button
            onClick={() => send(text.trim())}
            disabled={(!text.trim() && !uploading) || sending}
            className="flex-shrink-0 w-10 h-[42px] rounded-xl bg-[#22c55e]/20 border border-[#22c55e]/35 hover:bg-[#22c55e]/30 disabled:opacity-30 transition-all flex items-center justify-center"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-[#22c55e]">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/>
            </svg>
          </button>
        </div>
        <p className="text-white/15 text-[10px] mt-1.5 px-1">Shift+Enter for new line · tap 🖼 for photos · messages shared with whole team</p>
      </div>

      {/* Image lightbox */}
      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}