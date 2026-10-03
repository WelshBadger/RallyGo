import { useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'

// Route map files: a labelled list (e.g. one KMZ per day). Older rallies only have route_kmz_url.
const routeFilesOf = r => (Array.isArray(r?.route_kmz_files) && r.route_kmz_files.length)
  ? r.route_kmz_files
  : (r?.route_kmz_url ? [{ id: 'route', label: 'Route', url: r.route_kmz_url }] : [])

// Organiser's KMZ / KML route files: import from a link (copied to our storage by
// the import-route-file function) or upload. Rally Logistics draws them on the
// live team map.
export default function RouteFileCard({ rally, setRally }) {
  const [link, setLink] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const files = routeFilesOf(rally)

  const nextLabel = () => label.trim() || (files.length ? `Route ${files.length + 1}` : 'Route')

  // Keeps route_kmz_url pointing at the first file for older app versions
  async function saveFiles(list) {
    const { error } = await supabase.from('rallies')
      .update({ route_kmz_files: list, route_kmz_url: list[0]?.url ?? null }).eq('id', rally.id)
    if (error) throw error
    setRally(r => ({ ...r, route_kmz_files: list, route_kmz_url: list[0]?.url ?? null }))
  }

  async function importLink(e) {
    e.preventDefault()
    if (!link.trim()) return
    setBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-route-file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ rallyId: rally.id, url: link.trim(), label: nextLabel() }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Import failed')
      setRally(r => ({ ...r, route_kmz_files: result.files, route_kmz_url: result.files[0]?.url ?? null }))
      setLink('')
      setLabel('')
      toast.success('Route map imported')
    } catch (err) {
      toast.error(err.message || 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  async function upload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (ext !== 'kmz' && ext !== 'kml') { toast.error('Please choose a .kmz or .kml file'); return }
    setBusy(true)
    try {
      const path = `${rally.id}/route_${Date.now()}.${ext}`
      const contentType = ext === 'kmz' ? 'application/vnd.google-earth.kmz' : 'application/vnd.google-earth.kml+xml'
      const { error: upErr } = await supabase.storage.from('rally-docs').upload(path, file, { contentType, upsert: true })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('rally-docs').getPublicUrl(path)
      await saveFiles([...files, { id: crypto.randomUUID(), label: nextLabel(), url: publicUrl }])
      setLabel('')
      toast.success('Route map uploaded')
    } catch (err) {
      toast.error(err.message || 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id) {
    if (!confirm('Remove this route map file?')) return
    try {
      await saveFiles(files.filter(f => f.id !== id))
    } catch {
      toast.error('Could not remove it')
    }
  }

  return (
    <div className="bg-rl-card border border-white/10 rounded-xl p-5 mb-5">
      <h2 className="text-white font-medium text-sm">Route map files (KMZ / KML)</h2>
      <p className="text-white/35 text-xs mt-0.5 mb-4">
        Add the rally's KMZ or KML file — or one per day. Paste a link (Google My Maps links work too) or upload the file.
        Crews see the stages and route on the live team map in Rally Logistics, including offline.
      </p>

      {files.length > 0 && (
        <div className="space-y-2 mb-4">
          {files.map(f => (
            <div key={f.id} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5">
              <span className="text-white text-sm flex-1 truncate">{f.label}</span>
              <a href={f.url} className="text-xs text-rl-accent hover:text-white transition-colors flex-shrink-0 no-underline" download>Download</a>
              <button type="button" onClick={() => remove(f.id)} className="text-xs text-red-400/70 hover:text-red-400 flex-shrink-0">Remove</button>
            </div>
          ))}
        </div>
      )}

      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label — e.g. Day 1 (Friday)"
        className="rl-input mb-2"
        disabled={busy}
      />
      <form onSubmit={importLink} className="flex flex-wrap gap-2">
        <input
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://… .kmz"
          className="rl-input flex-1 min-w-[180px]"
          disabled={busy}
        />
        <button type="submit" disabled={busy || !link.trim()} className="rl-btn-primary text-xs px-4">
          {busy ? 'Working…' : 'Import link'}
        </button>
      </form>

      <label className={`inline-block mt-3 text-xs text-white/50 hover:text-white cursor-pointer ${busy ? 'pointer-events-none opacity-50' : ''}`}>
        <input type="file" accept=".kmz,.kml" onChange={upload} className="hidden" />
        or upload a .kmz / .kml file
      </label>
    </div>
  )
}
