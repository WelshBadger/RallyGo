import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from '../lib/dateUtils'

const SECTIONS = [
  { key: 'pre-event', label: 'Pre-event info' },
  { key: 'route', label: 'Route information' },
  { key: 'bulletins', label: 'Live bulletins' },
  { key: 'team', label: 'Organising team' },
  { key: 'accommodation', label: 'Accommodation' },
  { key: 'results', label: 'Live results' },
]

export default function ManageEventPage() {
  const { rallyId } = useParams()
  const { user } = useAuth()
  const [rally, setRally] = useState(null)
  const [docs, setDocs] = useState([])
  const [activeSection, setActiveSection] = useState('bulletins')
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState({ title: '', section: 'bulletins', file: null, isUrgent: false, linkUrl: '' })
  const [docType, setDocType] = useState('pdf') // pdf | link | text
  const [regsFile, setRegsFile] = useState(null)
  const [regsUploading, setRegsUploading] = useState(false)
  const [regsExtracting, setRegsExtracting] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: r } = await supabase.from('rallies').select('*').eq('id', rallyId).single()
      setRally(r)
      loadDocs(activeSection)
    }
    load()
  }, [rallyId])

  async function loadDocs(section) {
    const { data } = await supabase
      .from('rally_documents')
      .select('*')
      .eq('rally_id', rallyId)
      .eq('section', section)
      .order('created_at', { ascending: false })
    setDocs(data || [])
  }

  function switchSection(section) {
    setActiveSection(section)
    loadDocs(section)
    setForm(f => ({ ...f, section }))
  }

  async function handleUpload(e) {
    e.preventDefault()
    if (!form.title.trim()) { toast.error('Please add a title'); return }
    setUploading(true)

    try {
      let fileUrl = null
      let fileType = docType

      if (docType === 'pdf' && form.file) {
        const ext = form.file.name.split('.').pop()
        const path = `${rallyId}/${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('rally-docs')
          .upload(path, form.file, { contentType: form.file.type })
        if (uploadErr) throw uploadErr
        const { data: { publicUrl } } = supabase.storage.from('rally-docs').getPublicUrl(path)
        fileUrl = publicUrl
        fileType = 'pdf'
      }

      const { error } = await supabase.from('rally_documents').insert({
        rally_id: rallyId,
        title: form.title,
        section: form.section,
        file_url: fileUrl,
        file_type: fileType,
        link_url: docType === 'link' ? form.linkUrl : null,
        is_urgent: form.isUrgent,
        posted_by: user.id,
      })
      if (error) throw error

      toast.success('Document posted!')
      setForm({ title: '', section: activeSection, file: null, isUrgent: false, linkUrl: '' })
      loadDocs(activeSection)
    } catch (err) {
      toast.error(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(docId) {
    if (!confirm('Delete this document?')) return
    await supabase.from('rally_documents').delete().eq('id', docId)
    toast.success('Deleted')
    loadDocs(activeSection)
  }

  async function handleRegsUpload(e) {
    e.preventDefault()
    if (!regsFile) { toast.error('Please select a PDF'); return }
    setRegsUploading(true)

    try {
      // Upload PDF to storage
      const path = `${rallyId}/regulations_${Date.now()}.pdf`
      const { error: uploadErr } = await supabase.storage
        .from('rally-docs')
        .upload(path, regsFile, { contentType: 'application/pdf', upsert: true })
      if (uploadErr) throw uploadErr

      const { data: { publicUrl } } = supabase.storage.from('rally-docs').getPublicUrl(path)

      // Save the URL
      await supabase.from('rallies').update({ regulations_pdf_url: publicUrl }).eq('id', rallyId)

      // Read as base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = reader.result
          // Strip "data:application/pdf;base64," prefix
          resolve(dataUrl.split(',')[1])
        }
        reader.onerror = reject
        reader.readAsDataURL(regsFile)
      })

      setRegsUploading(false)
      setRegsExtracting(true)

      // Call edge function to extract info
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-regulations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ rallyId, pdfBase64: base64 }),
        }
      )
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Extraction failed')

      // Refresh rally data
      const { data: updated } = await supabase.from('rallies').select('*').eq('id', rallyId).single()
      setRally(updated)
      setRegsFile(null)
      toast.success('Regulations uploaded and info extracted!')
    } catch (err) {
      toast.error(err.message || 'Failed to process regulations')
    } finally {
      setRegsUploading(false)
      setRegsExtracting(false)
    }
  }

  if (!rally) return <div className="max-w-4xl mx-auto px-4 py-8"><div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" /></div>

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-2 text-xs text-white/30 mb-5">
        <Link to="/organiser" className="hover:text-white/60 no-underline transition-colors">Dashboard</Link>
        <span>/</span>
        <span className="text-white/60">{rally.name}</span>
      </div>

      <div className="flex items-start justify-between gap-4 mb-6">
        <h1 className="text-xl font-medium text-white">{rally.name}</h1>
        <Link to={`/event/${rallyId}`} className="rl-btn-ghost text-xs">Preview ↗</Link>
      </div>

      {/* Regulations card */}
      <div className="bg-rl-card border border-white/10 rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-white font-medium text-sm">Event Regulations</h2>
            <p className="text-white/35 text-xs mt-0.5">Upload the supplementary regulations PDF — key info will be extracted automatically.</p>
          </div>
          {rally.regulations_pdf_url && (
            <a href={rally.regulations_pdf_url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-rl-accent hover:text-white transition-colors flex-shrink-0">
              View PDF ↗
            </a>
          )}
        </div>

        {rally.regulations_data ? (
          <div className="mb-3 bg-rl-accent/5 border border-rl-accent/20 rounded-lg p-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            {rally.regulations_data.eventName && (
              <div><p className="text-white/35 mb-0.5">Event</p><p className="text-white">{rally.regulations_data.eventName}</p></div>
            )}
            {rally.regulations_data.dates && (
              <div><p className="text-white/35 mb-0.5">Dates</p><p className="text-white">{rally.regulations_data.dates}</p></div>
            )}
            {rally.regulations_data.clerkOfCourse && (
              <div><p className="text-white/35 mb-0.5">Clerk of Course</p><p className="text-white">{rally.regulations_data.clerkOfCourse}</p></div>
            )}
            {rally.regulations_data.totalStageDistance && (
              <div><p className="text-white/35 mb-0.5">Stage distance</p><p className="text-white">{rally.regulations_data.totalStageDistance}</p></div>
            )}
            {rally.regulations_data.stageCount > 0 && (
              <div><p className="text-white/35 mb-0.5">Stages</p><p className="text-white">{rally.regulations_data.stageCount}</p></div>
            )}
            {rally.regulations_data.organiser?.contact && (
              <div><p className="text-white/35 mb-0.5">Organiser contact</p><p className="text-white">{rally.regulations_data.organiser.contact}</p></div>
            )}
          </div>
        ) : null}

        <form onSubmit={handleRegsUpload} className="flex items-center gap-3">
          <input
            type="file"
            accept=".pdf"
            onChange={e => setRegsFile(e.target.files[0])}
            className="flex-1 text-xs text-white/50 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-white/10 file:text-white/70 cursor-pointer"
          />
          <button
            type="submit"
            disabled={!regsFile || regsUploading || regsExtracting}
            className="rl-btn-primary text-xs flex-shrink-0 flex items-center gap-2 disabled:opacity-50"
          >
            {regsUploading && <span className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
            {regsExtracting && <span className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
            {regsUploading ? 'Uploading…' : regsExtracting ? 'Extracting…' : rally.regulations_data ? 'Replace' : 'Upload & Extract'}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Section tabs (left) */}
        <div className="lg:col-span-1">
          <p className="rl-label mb-2">Section</p>
          <div className="space-y-1">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => switchSection(s.key)}
                className={`w-full text-left text-sm px-3.5 py-2.5 rounded-lg transition-all ${
                  activeSection === s.key
                    ? 'bg-rl-accent/15 text-white border border-rl-accent/30'
                    : 'text-white/50 hover:text-white hover:bg-white/5'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Upload + docs (right) */}
        <div className="lg:col-span-2 space-y-5">
          {/* Upload form */}
          <div className="bg-rl-card border border-white/10 rounded-xl p-5">
            <h2 className="text-white font-medium text-sm mb-4">Post to {SECTIONS.find(s => s.key === activeSection)?.label}</h2>

            {/* Type selector */}
            <div className="flex gap-2 mb-4">
              {[{ v: 'pdf', l: 'PDF file' }, { v: 'link', l: 'Link' }].map(({ v, l }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDocType(v)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                    docType === v ? 'border-rl-accent bg-rl-accent/10 text-white' : 'border-white/10 text-white/40 hover:text-white'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            <form onSubmit={handleUpload} className="space-y-3">
              <div>
                <label className="rl-label">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Bulletin 07 — Stage 4 time change"
                  className="rl-input"
                  required
                />
              </div>

              {docType === 'pdf' && (
                <div>
                  <label className="rl-label">File (PDF, image)</label>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={e => setForm(f => ({ ...f, file: e.target.files[0] }))}
                    className="rl-input text-white/50 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-white/10 file:text-white/70 cursor-pointer"
                  />
                </div>
              )}

              {docType === 'link' && (
                <div>
                  <label className="rl-label">URL</label>
                  <input
                    type="url"
                    value={form.linkUrl}
                    onChange={e => setForm(f => ({ ...f, linkUrl: e.target.value }))}
                    placeholder="https://"
                    className="rl-input"
                  />
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isUrgent}
                  onChange={e => setForm(f => ({ ...f, isUrgent: e.target.checked }))}
                  className="rounded border-white/20 bg-white/5 accent-rl-accent"
                />
                <span className="text-sm text-white/60">Mark as urgent</span>
              </label>

              <button type="submit" disabled={uploading} className="rl-btn-primary w-full flex items-center justify-center gap-2">
                {uploading ? <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : 'Post document'}
              </button>
            </form>
          </div>

          {/* Posted docs */}
          <div>
            <p className="rl-label mb-2">Posted ({docs.length})</p>
            {docs.length === 0 ? (
              <p className="text-white/25 text-sm text-center py-6">Nothing posted yet in this section.</p>
            ) : (
              <div className="space-y-2">
                {docs.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-3 bg-rl-card border border-white/10 rounded-xl px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{doc.title}</p>
                      <p className="text-white/35 text-xs mt-0.5">{formatDistanceToNow(doc.created_at)}</p>
                    </div>
                    {doc.is_urgent && <span className="text-[10px] bg-red-500/15 text-rl-accent px-2 py-0.5 rounded-full">Urgent</span>}
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="text-white/20 hover:text-red-400 transition-colors p-1"
                      aria-label="Delete"
                    >
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 000 1.5h.3l.815 8.15A1.5 1.5 0 005.357 15h5.285a1.5 1.5 0 001.493-1.35l.815-8.15h.3a.75.75 0 000-1.5H11v-.75A2.25 2.25 0 008.75 1h-1.5A2.25 2.25 0 005 3.25zm2.25-.75a.75.75 0 00-.75.75V4h3v-.75a.75.75 0 00-.75-.75h-1.5zM6.05 6a.75.75 0 01.787.713l.275 5.5a.75.75 0 01-1.498.075l-.275-5.5A.75.75 0 016.05 6zm3.9 0a.75.75 0 01.712.787l-.275 5.5a.75.75 0 01-1.498-.075l.275-5.5a.75.75 0 01.786-.712z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
