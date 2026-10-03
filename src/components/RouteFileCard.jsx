import { useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'

// Organiser's KMZ / KML route file: import from a link (copied to our storage by
// the import-route-file function) or upload the file. Rally Logistics draws it on
// the live team map.
export default function RouteFileCard({ rally, setRally }) {
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)

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
        body: JSON.stringify({ rallyId: rally.id, url: link.trim() }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Import failed')
      setRally(r => ({ ...r, route_kmz_url: result.url }))
      setLink('')
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
      const { error } = await supabase.from('rallies').update({ route_kmz_url: publicUrl }).eq('id', rally.id)
      if (error) throw error
      setRally(r => ({ ...r, route_kmz_url: publicUrl }))
      toast.success('Route map uploaded')
    } catch (err) {
      toast.error(err.message || 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm('Remove the route map file?')) return
    const { error } = await supabase.from('rallies').update({ route_kmz_url: null }).eq('id', rally.id)
    if (error) return toast.error('Could not remove it')
    setRally(r => ({ ...r, route_kmz_url: null }))
  }

  const fileName = rally.route_kmz_url ? rally.route_kmz_url.split('/').pop() : ''

  return (
    <div className="bg-rl-card border border-white/10 rounded-xl p-5 mb-5">
      <h2 className="text-white font-medium text-sm">Route map file (KMZ / KML)</h2>
      <p className="text-white/35 text-xs mt-0.5 mb-4">
        Paste a link to the rally's KMZ or KML file (Google My Maps links work too), or upload the file.
        Crews see the stages and route on the live team map in Rally Logistics, including offline.
      </p>

      {rally.route_kmz_url && (
        <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 mb-4">
          <span className="text-[10px] font-semibold text-green-600 bg-green-500/10 border border-green-500/25 px-2 py-0.5 rounded-full flex-shrink-0">Added</span>
          <a href={rally.route_kmz_url} className="text-white/60 text-xs truncate flex-1 no-underline hover:text-white" download>{fileName}</a>
          <button type="button" onClick={remove} className="text-xs text-red-400/70 hover:text-red-400 flex-shrink-0">Remove</button>
        </div>
      )}

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
          {busy ? 'Working…' : rally.route_kmz_url ? 'Replace from link' : 'Import link'}
        </button>
      </form>

      <label className={`inline-block mt-3 text-xs text-white/50 hover:text-white cursor-pointer ${busy ? 'pointer-events-none opacity-50' : ''}`}>
        <input type="file" accept=".kmz,.kml" onChange={upload} className="hidden" />
        or upload a .kmz / .kml file
      </label>
    </div>
  )
}
