import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { reencodeImage } from '../lib/images'

// Recce videos and back-up pacenotes, per stage, stored on the pack:
//   pack.pacenotes    { [stageKey]: [{ id, url }] }               pages in reading order
//   pack.recce_videos { [stageKey]: [{ id, url, label, kind }] }   kind: 'file' | 'link'
// stageKey is the SS number as a string. Files live in the rally-docs bucket under
// random paths; pacenote pages are prefetched by the pack so they open offline.

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const listFor = (obj, key) => (obj && Array.isArray(obj[key]) ? obj[key] : [])

async function uploadToStorage(path, body, contentType) {
  const { error } = await supabase.storage.from('rally-docs').upload(path, body, { contentType, upsert: true })
  if (error) throw error
  return supabase.storage.from('rally-docs').getPublicUrl(path).data.publicUrl
}

function useWakeLock(on) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return
    let lock = null
    let done = false
    const acquire = async () => {
      try { if (document.visibilityState === 'visible' && !done) lock = await navigator.wakeLock.request('screen') } catch { /* not allowed */ }
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => { done = true; document.removeEventListener('visibilitychange', acquire); if (lock) lock.release().catch(() => {}) }
  }, [on])
}

// Full-screen overlay shell used by the per-stage screens
function Sheet({ title, sub, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-rl-bg overflow-y-auto" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="max-w-3xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="text-white font-semibold text-base truncate">{title}</p>
            {sub && <p className="text-white/40 text-xs truncate">{sub}</p>}
          </div>
          <button onClick={onClose} className="rl-btn-ghost text-xs flex-shrink-0">Close</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─── Pacenotes ───────────────────────────────────────────────────────────────

// The co-driver's view: every page of the stage in one continuous, scrollable
// document, screen kept on, big page-down / page-up buttons.
function PacenotesReader({ title, pages, onClose }) {
  const [zoom, setZoom] = useState(1)
  const [current, setCurrent] = useState(0)
  const pageRefs = useRef([])
  const scroller = useRef(null)
  useWakeLock(true)

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onScroll = () => {
      const mid = el.scrollTop + el.clientHeight / 3
      let idx = 0
      pageRefs.current.forEach((p, i) => { if (p && p.offsetTop <= mid) idx = i })
      setCurrent(idx)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  function go(delta) {
    const next = Math.min(pages.length - 1, Math.max(0, current + delta))
    pageRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-black/90" style={{ color: '#fff' }}>
        <p className="text-sm font-semibold truncate" style={{ color: '#fff' }}>{title}</p>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs mr-1" style={{ color: 'rgba(255,255,255,0.6)' }}>Page {current + 1}/{pages.length}</span>
          <button onClick={() => setZoom(z => Math.max(1, z - 0.5))} className="w-9 h-9 rounded-lg text-lg" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>−</button>
          <button onClick={() => setZoom(z => Math.min(3, z + 0.5))} className="w-9 h-9 rounded-lg text-lg" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>+</button>
          <button onClick={onClose} className="h-9 px-3 rounded-lg text-sm" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>Close</button>
        </div>
      </div>
      <div ref={scroller} className="flex-1 overflow-auto">
        <div style={{ width: `${zoom * 100}%` }}>
          {pages.map((p, i) => (
            <img key={p.id} ref={el => { pageRefs.current[i] = el }} src={p.url} alt={`Page ${i + 1}`}
              className="block w-full h-auto" style={{ marginBottom: 6 }} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 p-2 bg-black/90" style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}>
        <button onClick={() => go(-1)} className="h-12 rounded-xl text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>▲ Previous page</button>
        <button onClick={() => go(1)} className="h-12 rounded-xl text-sm font-semibold" style={{ background: '#E24B4A', color: '#fff' }}>Next page ▼</button>
      </div>
    </div>
  )
}

let jsPdfPromise = null
function loadJsPdf() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF)
  if (!jsPdfPromise) {
    jsPdfPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
      s.onload = () => resolve(window.jspdf.jsPDF)
      s.onerror = () => { jsPdfPromise = null; reject(new Error('Could not load the PDF maker — it needs signal the first time')) }
      document.head.appendChild(s)
    })
  }
  return jsPdfPromise
}

function loadImage(url) {
  return fetch(url).then(r => r.blob()).then(blob => new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = URL.createObjectURL(blob)
  }))
}

// One PDF of the stage's pages (A4 portrait, each page fitted) — for printing or sharing
async function savePdf(title, pages) {
  const JsPDF = await loadJsPdf()
  const doc = new JsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, H = 297, M = 6
  for (let i = 0; i < pages.length; i++) {
    const img = await loadImage(pages[i].url)
    const c = document.createElement('canvas')
    c.width = img.naturalWidth; c.height = img.naturalHeight
    c.getContext('2d').drawImage(img, 0, 0)
    const data = c.toDataURL('image/jpeg', 0.85)
    const s = Math.min((W - 2 * M) / img.naturalWidth, (H - 2 * M) / img.naturalHeight)
    const w = img.naturalWidth * s, h = img.naturalHeight * s
    if (i > 0) doc.addPage()
    doc.addImage(data, 'JPEG', (W - w) / 2, (H - h) / 2, w, h)
  }
  doc.save(`${title.replace(/[^\w\- ]+/g, '').trim() || 'pacenotes'}.pdf`)
}

export function StagePacenotes({ pack, stageKey, title, canEdit, onSave, onClose }) {
  const pages = listFor(pack?.pacenotes, stageKey)
  const [uploading, setUploading] = useState(null) // "3/8"
  const [reading, setReading] = useState(false)
  const [making, setMaking] = useState(false)

  function setPages(next) {
    onSave({ pacenotes: { ...(pack?.pacenotes || {}), [stageKey]: next } })
  }

  async function addPages(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    if (!navigator.onLine) { toast.error('Adding pages needs signal'); return }
    const added = []
    for (let i = 0; i < files.length; i++) {
      setUploading(`${i + 1}/${files.length}`)
      try {
        let body = files[i]
        try { body = await reencodeImage(files[i], 2000, 0.82) } catch { /* keep original */ }
        const url = await uploadToStorage(`pacenotes/${pack.id}/${stageKey}/${newId()}.jpg`, body, 'image/jpeg')
        added.push({ id: newId(), url })
      } catch (err) {
        toast.error(`Page ${i + 1} failed: ${err.message || 'upload error'}`)
      }
    }
    setUploading(null)
    if (added.length) {
      setPages([...pages, ...added])
      added.forEach(p => fetch(p.url, { mode: 'cors' }).catch(() => {})) // save for offline now
    }
  }

  function move(i, delta) {
    const j = i + delta
    if (j < 0 || j >= pages.length) return
    const next = [...pages]
    ;[next[i], next[j]] = [next[j], next[i]]
    setPages(next)
  }

  function remove(i) {
    if (!confirm(`Remove page ${i + 1}?`)) return
    setPages(pages.filter((_, k) => k !== i))
  }

  async function makePdf() {
    setMaking(true)
    try { await savePdf(title, pages) } catch (err) { toast.error(err.message || 'Could not make the PDF') }
    setMaking(false)
  }

  return (
    <Sheet title={`Pacenotes — ${title}`} sub={`${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`} onClose={onClose}>
      {pages.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button onClick={() => setReading(true)} className="rl-btn-primary justify-center text-sm py-3">Read pacenotes</button>
          <button onClick={makePdf} disabled={making} className="rl-btn-ghost justify-center text-sm py-3">{making ? 'Making PDF…' : 'Save as PDF'}</button>
        </div>
      )}

      {canEdit && (
        <label className={`block text-center border-2 border-dashed border-white/15 rounded-xl px-4 py-5 mb-4 cursor-pointer hover:border-white/30 ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
          <input type="file" accept="image/*" multiple onChange={addPages} className="hidden" />
          <p className="text-white text-sm font-medium">{uploading ? `Uploading page ${uploading}…` : '+ Add pages'}</p>
          <p className="text-white/40 text-xs mt-1">Photograph each page in order. Pick several at once — they're added in the order you choose them.</p>
        </label>
      )}

      {pages.length === 0 ? (
        <p className="text-white/40 text-sm text-center py-8">No pacenotes for this stage yet.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {pages.map((p, i) => (
            <div key={p.id} className="bg-rl-card border border-white/10 rounded-lg overflow-hidden">
              <button onClick={() => setReading(true)} className="block w-full">
                <img src={p.url} alt={`Page ${i + 1}`} className="w-full h-28 object-cover object-top" />
              </button>
              <div className="flex items-center justify-between px-1.5 py-1">
                <span className="text-white/60 text-[11px] font-medium">{i + 1}</span>
                {canEdit && (
                  <span className="flex gap-0.5">
                    <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move earlier" className="w-6 h-6 text-white/50 disabled:opacity-20">◀</button>
                    <button onClick={() => move(i, 1)} disabled={i === pages.length - 1} aria-label="Move later" className="w-6 h-6 text-white/50 disabled:opacity-20">▶</button>
                    <button onClick={() => remove(i)} aria-label="Remove page" className="w-6 h-6 text-red-400/70">✕</button>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-white/25 text-[11px] mt-4">
        Pages are saved on the phone when the pack opens with signal, so they read with no signal. Only people with access to this pack see them.
      </p>

      {reading && <PacenotesReader title={title} pages={pages} onClose={() => setReading(false)} />}
    </Sheet>
  )
}

// The Pacenotes tile: every stage, with how many pages each has
export function PacenotesTab({ pack, stages, canEdit, onSave }) {
  const [open, setOpen] = useState(null) // { key, title }
  const [extra, setExtra] = useState('')
  const notes = pack?.pacenotes || {}
  const listed = new Set(stages.map(s => String(s.number)))
  const others = Object.keys(notes).filter(k => !listed.has(k) && notes[k]?.length).sort((a, b) => Number(a) - Number(b))
  const rows = [
    ...stages.map(s => ({ key: String(s.number), title: `SS${s.number}${s.name && s.name !== `SS${s.number}` ? ` ${s.name}` : ''}`, distance: s.distance })),
    ...others.map(k => ({ key: k, title: `SS${k}` })),
  ]

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-white font-medium">Pacenotes</h2>
        <p className="text-white/35 text-xs mt-0.5">A back-up copy of each stage's pacenotes, photographed page by page, in case the real ones are lost.</p>
      </div>

      {rows.length === 0 && <p className="text-white/40 text-sm py-4">No stage list for this rally yet — add a stage number below.</p>}

      <div className="space-y-2">
        {rows.map(r => {
          const n = listFor(notes, r.key).length
          return (
            <button key={r.key} onClick={() => setOpen(r)} className="w-full flex items-center justify-between gap-3 bg-rl-card border border-white/10 rounded-xl px-4 py-3 text-left hover:border-white/25">
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">{r.title}</p>
                {r.distance && <p className="text-white/35 text-xs">{r.distance}</p>}
              </div>
              <span className={`text-xs flex-shrink-0 ${n ? 'text-rl-accent font-medium' : 'text-white/30'}`}>{n ? `${n} ${n === 1 ? 'page' : 'pages'}` : 'None yet'}</span>
            </button>
          )
        })}
      </div>

      {canEdit && (
        <form onSubmit={e => { e.preventDefault(); const k = String(parseInt(extra, 10)); if (k !== 'NaN') { setOpen({ key: k, title: `SS${k}` }); setExtra('') } }}
          className="flex gap-2 pt-2">
          <input value={extra} onChange={e => setExtra(e.target.value)} inputMode="numeric" placeholder="Another stage number" className="rl-input flex-1" />
          <button type="submit" disabled={!extra.trim()} className="rl-btn-ghost text-xs px-4">Open</button>
        </form>
      )}

      {open && <StagePacenotes pack={pack} stageKey={open.key} title={open.title} canEdit={canEdit} onSave={onSave} onClose={() => setOpen(null)} />}
    </div>
  )
}

// ─── Recce videos ────────────────────────────────────────────────────────────

const MAX_VIDEO_MB = 50

export function RecceVideos({ pack, stageKey, title, canEdit, onSave, onClose }) {
  const videos = listFor(pack?.recce_videos, stageKey)
  const [uploading, setUploading] = useState(false)
  const [link, setLink] = useState('')

  function setVideos(next) {
    onSave({ recce_videos: { ...(pack?.recce_videos || {}), [stageKey]: next } })
  }

  async function upload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      toast.error(`That video is ${Math.round(file.size / 1048576)} MB — the limit is ${MAX_VIDEO_MB} MB. Trim it, or upload it to YouTube/Google Drive and add the link instead.`, { duration: 7000 })
      return
    }
    setUploading(true)
    try {
      const ext = (file.name.split('.').pop() || 'mp4').toLowerCase()
      const url = await uploadToStorage(`recce-videos/${pack.id}/${stageKey}/${newId()}.${ext}`, file, file.type || 'video/mp4')
      setVideos([...videos, { id: newId(), url, label: file.name.replace(/\.[^.]+$/, ''), kind: 'file' }])
    } catch (err) {
      toast.error(err.message || 'Upload failed')
    }
    setUploading(false)
  }

  function addLink(e) {
    e.preventDefault()
    const url = link.trim()
    if (!/^https?:\/\//i.test(url)) { toast.error('Paste a full link starting with https://'); return }
    setVideos([...videos, { id: newId(), url, label: url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60), kind: 'link' }])
    setLink('')
  }

  function remove(id) {
    if (!confirm('Remove this video?')) return
    setVideos(videos.filter(v => v.id !== id))
  }

  return (
    <Sheet title={`Recce video — ${title}`} sub={`${videos.length} ${videos.length === 1 ? 'video' : 'videos'}`} onClose={onClose}>
      {canEdit && (
        <div className="space-y-2 mb-4">
          <label className={`block text-center border-2 border-dashed border-white/15 rounded-xl px-4 py-5 cursor-pointer hover:border-white/30 ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
            <input type="file" accept="video/*" onChange={upload} className="hidden" />
            <p className="text-white text-sm font-medium">{uploading ? 'Uploading video…' : '+ Upload a video'}</p>
            <p className="text-white/40 text-xs mt-1">Up to {MAX_VIDEO_MB} MB. Longer videos: add a YouTube or Google Drive link below.</p>
          </label>
          <form onSubmit={addLink} className="flex gap-2">
            <input value={link} onChange={e => setLink(e.target.value)} type="url" placeholder="https://… video link" className="rl-input flex-1" />
            <button type="submit" disabled={!link.trim()} className="rl-btn-ghost text-xs px-4">Add link</button>
          </form>
        </div>
      )}

      {videos.length === 0 ? (
        <p className="text-white/40 text-sm text-center py-8">No recce video for this stage yet.</p>
      ) : (
        <div className="space-y-3">
          {videos.map(v => (
            <div key={v.id} className="bg-rl-card border border-white/10 rounded-xl overflow-hidden">
              {v.kind === 'file' ? (
                <video src={v.url} controls playsInline preload="metadata" className="w-full bg-black" />
              ) : (
                <a href={v.url} target="_blank" rel="noopener noreferrer" className="block px-4 py-3 text-rl-accent text-sm truncate no-underline">▶ Open video link</a>
              )}
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <p className="text-white/70 text-xs truncate">{v.label}</p>
                {canEdit && <button onClick={() => remove(v.id)} className="text-xs text-red-400/70 flex-shrink-0">Remove</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-white/25 text-[11px] mt-4">Videos play with signal. They aren't saved for offline use because of their size.</p>
    </Sheet>
  )
}
