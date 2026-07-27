import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatDateRange } from '../lib/dateUtils'
import toast from 'react-hot-toast'

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const TABS = [
  { id: 'news',           label: 'News' },
  { id: 'championships',  label: 'Championships' },
  { id: 'calendar',       label: 'Calendar Events' },
  { id: 'rallies',        label: 'Rallies' },
]

const SURFACE_OPTIONS = [
  { value: 'gravel',     label: 'Gravel Rally' },
  { value: 'tarmac',     label: 'Tarmac Rally' },
  { value: 'road_rally', label: 'Road Rally' },
]

const STATUSES = ['confirmed', 'provisional', 'cancelled']

const EMPTY_EVENT = { name: '', date: '', end_date: '', location: '', surface: 'gravel', series: [], status: 'confirmed', external_url: '' }

// ─── Root ────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [tab, setTab] = useState('news')

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white mb-1">Admin</h1>
        <p className="text-white/35 text-sm">Manage all content on RallyGo</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-white/4 rounded-xl p-1 mb-8 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id ? 'bg-white text-black' : 'text-white/50 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'news'          && <NewsTab />}
      {tab === 'championships' && <ChampionshipsTab />}
      {tab === 'calendar'      && <CalendarTab />}
      {tab === 'rallies'       && <RalliesTab />}
    </main>
  )
}

// ─── News tab ────────────────────────────────────────────────────────────────

function NewsTab() {
  const { user } = useAuth()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [showOnHome, setShowOnHome] = useState(true)
  const [togglingHome, setTogglingHome] = useState(false)

  async function load() {
    const [{ data: postsData }, { data: settings }] = await Promise.all([
      supabase.from('news_posts').select('*').order('created_at', { ascending: false }),
      supabase.from('site_settings').select('show_news_on_homepage').eq('id', 1).single(),
    ])
    setPosts(postsData || [])
    if (settings) setShowOnHome(settings.show_news_on_homepage)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function toggleHomeNews() {
    setTogglingHome(true)
    const next = !showOnHome
    const { error } = await supabase.from('site_settings').update({ show_news_on_homepage: next }).eq('id', 1)
    if (error) { toast.error('Failed to update'); setTogglingHome(false); return }
    setShowOnHome(next)
    setTogglingHome(false)
    toast.success(next ? 'News shown on homepage' : 'News hidden from homepage')
  }

  async function handleDelete(id) {
    if (!confirm('Delete this post?')) return
    const { error } = await supabase.from('news_posts').delete().eq('id', id)
    if (error) return toast.error('Delete failed')
    toast.success('Deleted')
    load()
  }

  async function handleToggle(post) {
    const pub = post.status === 'published'
    const { error } = await supabase.from('news_posts').update({
      status: pub ? 'draft' : 'published',
      published_at: pub ? null : new Date().toISOString(),
    }).eq('id', post.id)
    if (error) return toast.error('Failed')
    toast.success(pub ? 'Moved to draft' : 'Published')
    load()
  }

  if (editing !== null) return (
    <NewsEditor post={editing === 'new' ? null : editing} userId={user?.id}
      onSave={() => { setEditing(null); load() }} onCancel={() => setEditing(null)} />
  )

  return (
    <Section
      title="News posts"
      count={`${posts.filter(p => p.status === 'published').length} published`}
      action={
        <div className="flex items-center gap-3">
          {/* Homepage visibility toggle */}
          <button
            onClick={toggleHomeNews}
            disabled={togglingHome}
            className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border transition-all disabled:opacity-50"
            style={showOnHome
              ? { borderColor: 'rgba(16,185,129,0.4)', color: 'rgb(52,211,153)', background: 'rgba(16,185,129,0.08)' }
              : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.35)', background: 'transparent' }
            }
          >
            <span className={`w-1.5 h-1.5 rounded-full ${showOnHome ? 'bg-emerald-400' : 'bg-white/20'}`} />
            {showOnHome ? 'Shown on homepage' : 'Hidden from homepage'}
          </button>
          <button onClick={() => setEditing('new')} className="rl-btn-primary text-sm px-4 py-2">+ New post</button>
        </div>
      }
      loading={loading}
      empty={posts.length === 0}
      emptyText="No posts yet."
    >
      {posts.map(post => (
        <Row key={post.id}
          badge={<StatusBadge status={post.status === 'published' ? 'published' : 'draft'} labels={{ published: 'Published', draft: 'Draft' }} />}
          meta={post.published_at ? fmt(post.published_at) : null}
          title={post.title}
          sub={post.excerpt}
          actions={[
            { label: post.status === 'published' ? 'Unpublish' : 'Publish', onClick: () => handleToggle(post) },
            { label: 'Edit', onClick: () => setEditing(post) },
            { label: 'Delete', onClick: () => handleDelete(post.id), danger: true },
          ]}
        />
      ))}
    </Section>
  )
}

function NewsEditor({ post, userId, onSave, onCancel }) {
  const [title, setTitle]     = useState(post?.title     || '')
  const [excerpt, setExcerpt] = useState(post?.excerpt   || '')
  const [body, setBody]       = useState(post?.body      || '')
  const [imageUrl, setImageUrl] = useState(post?.image_url || '')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving]   = useState(false)

  async function handleImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) return toast.error('Image must be under 5 MB')
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('news-images').upload(path, file, { upsert: false })
    if (error) { setUploading(false); return toast.error('Upload failed') }
    const { data } = supabase.storage.from('news-images').getPublicUrl(path)
    setImageUrl(data.publicUrl)
    setUploading(false)
    toast.success('Image uploaded')
  }

  async function removeImage() {
    setImageUrl('')
  }

  async function save(publish = false) {
    if (!title.trim() || !body.trim()) return toast.error('Title and body required')
    setSaving(true)
    const payload = {
      title: title.trim(), excerpt: excerpt.trim() || null, body: body.trim(),
      image_url: imageUrl || null,
      updated_at: new Date().toISOString(),
      ...(publish ? { status: 'published', published_at: new Date().toISOString() } : {}),
    }
    let error
    if (post?.id) {
      ;({ error } = await supabase.from('news_posts').update(payload).eq('id', post.id))
    } else {
      ;({ error } = await supabase.from('news_posts').insert({ ...payload, author_id: userId, status: publish ? 'published' : 'draft' }))
    }
    setSaving(false)
    if (error) return toast.error('Save failed')
    toast.success(publish ? 'Published!' : 'Saved as draft')
    onSave()
  }

  return (
    <EditorShell title={post ? 'Edit post' : 'New post'} onCancel={onCancel}>
      <Field label="Title">
        <input className="rl-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Post title" />
      </Field>
      <Field label="Excerpt" hint="shown in previews">
        <input className="rl-input" value={excerpt} onChange={e => setExcerpt(e.target.value)} placeholder="One-line summary" />
      </Field>
      <Field label="Cover image" hint="optional">
        {imageUrl ? (
          <div className="relative rounded-xl overflow-hidden border border-white/10">
            <img src={imageUrl} alt="Cover" className="w-full h-48 object-cover" />
            <button
              onClick={removeImage}
              className="absolute top-2 right-2 bg-black/70 hover:bg-black text-white text-xs px-2.5 py-1.5 rounded-lg transition-all"
            >
              Remove
            </button>
          </div>
        ) : (
          <label className={`flex flex-col items-center justify-center gap-2 h-32 rounded-xl border border-dashed border-white/15 hover:border-white/30 transition-all cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            <svg className="w-6 h-6 text-white/25" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
            </svg>
            <span className="text-white/30 text-xs">{uploading ? 'Uploading…' : 'Click to upload image'}</span>
            <span className="text-white/20 text-[10px]">JPG, PNG, WebP · max 5 MB</span>
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </label>
        )}
      </Field>
      <Field label="Body">
        <textarea className="rl-input resize-none leading-relaxed" rows={12} value={body} onChange={e => setBody(e.target.value)} placeholder="Write your post here…" />
      </Field>
      <div className="flex gap-3 pt-2">
        <button onClick={() => save(false)} disabled={saving || uploading} className="rl-btn-ghost text-sm px-5 py-2.5">Save draft</button>
        <button onClick={() => save(true)}  disabled={saving || uploading} className="rl-btn-primary text-sm px-5 py-2.5">
          {saving ? 'Saving…' : post?.status === 'published' ? 'Update' : 'Publish'}
        </button>
      </div>
    </EditorShell>
  )
}

// ─── Championships tab ────────────────────────────────────────────────────────

function ChampionshipsTab() {
  const [championships, setChampionships] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)

  async function load() {
    const { data } = await supabase.from('championships').select('*').order('year', { ascending: false }).order('name')
    setChampionships(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function handleDelete(id, name) {
    if (!confirm(`Delete "${name}"?`)) return
    const { error } = await supabase.from('championships').delete().eq('id', id)
    if (error) return toast.error('Delete failed')
    toast.success('Deleted')
    load()
  }

  if (editing !== null) return (
    <ChampionshipEditor
      championship={editing === 'new' ? null : editing}
      onSave={() => { setEditing(null); load() }}
      onCancel={() => setEditing(null)}
    />
  )

  return (
    <Section
      title="Championships"
      count={`${championships.length} championships`}
      action={<button onClick={() => setEditing('new')} className="rl-btn-primary text-sm px-4 py-2">+ Add championship</button>}
      loading={loading}
      empty={championships.length === 0}
      emptyText="No championships yet."
    >
      {championships.map(c => (
        <Row key={c.id}
          badge={
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-white/60">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color || '#E24B4A' }} />
              {c.year}
            </span>
          }
          meta={c.short_name}
          title={c.name}
          sub={null}
          actions={[
            { label: 'Edit', onClick: () => setEditing(c) },
            { label: 'Delete', onClick: () => handleDelete(c.id, c.name), danger: true },
          ]}
        />
      ))}
    </Section>
  )
}

function ChampionshipEditor({ championship, onSave, onCancel }) {
  const [name, setName]           = useState(championship?.name       || '')
  const [shortName, setShortName] = useState(championship?.short_name || '')
  const [color, setColor]         = useState(championship?.color      || '#E24B4A')
  const [year, setYear]           = useState(championship?.year       || 2026)
  const [saving, setSaving]       = useState(false)

  async function save() {
    if (!name.trim() || !shortName.trim()) return toast.error('Name and short name required')
    setSaving(true)
    const payload = {
      name: name.trim(),
      short_name: shortName.trim().toUpperCase(),
      color,
      year: parseInt(year),
    }
    let error
    if (championship?.id) {
      ;({ error } = await supabase.from('championships').update(payload).eq('id', championship.id))
    } else {
      ;({ error } = await supabase.from('championships').insert(payload))
    }
    setSaving(false)
    if (error) return toast.error(error.message || 'Save failed')
    toast.success(championship ? 'Updated' : 'Championship added')
    onSave()
  }

  return (
    <EditorShell title={championship ? 'Edit championship' : 'New championship'} onCancel={onCancel}>
      <Field label="Full name">
        <input className="rl-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Protyre Motorsport UK Rally Championship" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Short name" hint="shown on events">
          <input className="rl-input" value={shortName} onChange={e => setShortName(e.target.value)} placeholder="e.g. Protyre" />
        </Field>
        <Field label="Year">
          <input type="number" className="rl-input" value={year} onChange={e => setYear(e.target.value)} min="2020" max="2030" />
        </Field>
      </div>
      <Field label="Colour">
        <div className="flex items-center gap-3">
          <input
            type="color"
            className="h-10 w-16 rounded-lg border border-white/10 bg-transparent cursor-pointer p-1"
            value={color}
            onChange={e => setColor(e.target.value)}
          />
          <input className="rl-input flex-1" value={color} onChange={e => setColor(e.target.value)} placeholder="#E24B4A" />
        </div>
      </Field>
      <div className="pt-2">
        <button onClick={save} disabled={saving} className="rl-btn-primary text-sm px-5 py-2.5">
          {saving ? 'Saving…' : championship ? 'Update' : 'Add championship'}
        </button>
      </div>
    </EditorShell>
  )
}

// ─── Calendar Events tab ─────────────────────────────────────────────────────

function CalendarTab() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)

  async function load() {
    const { data } = await supabase.from('calendar_events').select('*').order('date', { ascending: true })
    setEvents(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function handleDelete(id) {
    if (!confirm('Delete this event?')) return
    const { error } = await supabase.from('calendar_events').delete().eq('id', id)
    if (error) return toast.error('Delete failed')
    toast.success('Deleted')
    load()
  }

  if (editing !== null) return (
    <CalendarEventEditor event={editing === 'new' ? null : editing}
      onSave={() => { setEditing(null); load() }} onCancel={() => setEditing(null)} />
  )

  return (
    <Section
      title="UK Calendar events"
      count={`${events.length} events`}
      action={<button onClick={() => setEditing('new')} className="rl-btn-primary text-sm px-4 py-2">+ Add event</button>}
      loading={loading}
      empty={events.length === 0}
      emptyText="No calendar events."
    >
      {events.map(e => (
        <Row key={e.id}
          badge={<StatusBadge status={e.status} labels={{ confirmed: 'Confirmed', provisional: 'Provisional', cancelled: 'Cancelled' }} />}
          meta={fmt(e.date)}
          title={e.name}
          sub={e.location}
          actions={[
            { label: 'Edit', onClick: () => setEditing(e) },
            { label: 'Delete', onClick: () => handleDelete(e.id), danger: true },
          ]}
        />
      ))}
    </Section>
  )
}

function CalendarEventEditor({ event, onSave, onCancel }) {
  const [form, setForm] = useState(event ? {
    ...event,
    series: event.series || [],
  } : EMPTY_EVENT)
  const [championships, setChampionships] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('championships').select('*').order('name')
      .then(({ data }) => setChampionships(data || []))
  }, [])

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function toggleChamp(shortName) {
    setForm(f => {
      const current = f.series || []
      const exists = current.includes(shortName)
      return { ...f, series: exists ? current.filter(s => s !== shortName) : [...current, shortName] }
    })
  }

  async function save() {
    if (!form.name.trim() || !form.date) return toast.error('Name and date required')
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      date: form.date,
      end_date: form.end_date || null,
      location: form.location.trim() || null,
      surface: form.surface,
      series: form.series || [],
      status: form.status,
      external_url: form.external_url?.trim() || null,
    }
    let error
    if (event?.id) {
      ;({ error } = await supabase.from('calendar_events').update(payload).eq('id', event.id))
    } else {
      ;({ error } = await supabase.from('calendar_events').insert(payload))
    }
    setSaving(false)
    if (error) return toast.error('Save failed')
    toast.success(event ? 'Updated' : 'Event added')
    onSave()
  }

  return (
    <EditorShell title={event ? 'Edit calendar event' : 'New calendar event'} onCancel={onCancel}>
      <Field label="Event name">
        <input className="rl-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Plains Rally" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Start date">
          <input type="date" className="rl-input" value={form.date} onChange={e => set('date', e.target.value)} />
        </Field>
        <Field label="End date" hint="optional">
          <input type="date" className="rl-input" value={form.end_date || ''} onChange={e => set('end_date', e.target.value)} />
        </Field>
      </div>
      <Field label="Location">
        <input className="rl-input" value={form.location} onChange={e => set('location', e.target.value)} placeholder="e.g. Mid Wales" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Surface">
          <select className="rl-input" value={form.surface} onChange={e => set('surface', e.target.value)}>
            {SURFACE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className="rl-input" value={form.status} onChange={e => set('status', e.target.value)}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Championships">
        {championships.length === 0 ? (
          <p className="text-white/30 text-xs py-1">No championships set up — add them in the Championships tab.</p>
        ) : (
          <div className="flex flex-wrap gap-2 pt-1">
            {championships.map(c => {
              const selected = (form.series || []).includes(c.short_name)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleChamp(c.short_name)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all font-medium ${
                    selected
                      ? 'bg-rl-accent/20 border-rl-accent/50 text-rl-accent'
                      : 'border-white/10 text-white/40 hover:text-white hover:border-white/25'
                  }`}
                >
                  {c.short_name}
                </button>
              )
            })}
          </div>
        )}
      </Field>
      <Field label="External URL" hint="optional">
        <input className="rl-input" value={form.external_url || ''} onChange={e => set('external_url', e.target.value)} placeholder="https://…" />
      </Field>
      <div className="pt-2">
        <button onClick={save} disabled={saving} className="rl-btn-primary text-sm px-5 py-2.5">
          {saving ? 'Saving…' : event ? 'Update event' : 'Add event'}
        </button>
      </div>
    </EditorShell>
  )
}

// ─── Rallies tab ─────────────────────────────────────────────────────────────

function RalliesTab() {
  const { user } = useAuth()
  const [rallies, setRallies] = useState([])
  const [loading, setLoading] = useState(true)
  const [showPicker, setShowPicker] = useState(false)
  const [prefill, setPrefill] = useState(null)

  async function load() {
    const { data } = await supabase.from('rallies').select('*').order('date', { ascending: false })
    setRallies(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function handleDelete(id, name) {
    if (!confirm(`Delete "${name}" and all its documents? This cannot be undone.`)) return
    await supabase.from('rally_documents').delete().eq('rally_id', id)
    await supabase.from('calendar_events').update({ rally_id: null }).eq('rally_id', id)
    await supabase.from('logistics_packs').delete().eq('rally_id', id)
    const { error } = await supabase.from('rallies').delete().eq('id', id)
    if (error) return toast.error('Delete failed')
    toast.success('Rally deleted')
    setRallies(prev => prev.filter(r => r.id !== id))
  }

  if (prefill !== null) return (
    <AdminRallyEditor
      prefill={prefill}
      userId={user?.id}
      onSave={() => { setPrefill(null); load() }}
      onCancel={() => setPrefill(null)}
    />
  )

  return (
    <>
      <Section
        title="All rallies"
        count={`${rallies.length} total`}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPicker(true)}
              className="rl-btn-ghost text-sm px-4 py-2"
            >
              From calendar →
            </button>
            <Link to="/organiser/create" className="rl-btn-primary text-sm px-4 py-2">+ New rally</Link>
          </div>
        }
        loading={loading}
        empty={rallies.length === 0}
        emptyText="No rallies yet."
      >
        {rallies.map(r => (
          <Row key={r.id}
            badge={<StatusBadge status={r.status} labels={{ draft: 'Draft', active: 'Active', archived: 'Archived' }} />}
            meta={fmt(r.date)}
            title={r.name}
            sub={r.location}
            actions={[
              { label: 'View', href: `/event/${r.id}` },
              { label: 'Manage', href: `/organiser/event/${r.id}`, primary: true },
              { label: 'Delete', onClick: () => handleDelete(r.id, r.name), danger: true },
            ]}
          />
        ))}
      </Section>

      {showPicker && (
        <CalendarPickerModal
          onSelect={ev => { setShowPicker(false); setPrefill(ev) }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  )
}

function CalendarPickerModal({ onSelect, onClose }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    supabase.from('calendar_events').select('*').order('date', { ascending: true })
      .then(({ data }) => { setEvents(data || []); setLoading(false) })
  }, [])

  const filtered = events.filter(e =>
    !search ||
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.location || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-white border border-white/10 rounded-2xl w-full max-w-lg mx-4 overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-white/8">
          <h3 className="text-white font-semibold mb-3">Pick a calendar event</h3>
          <input
            className="rl-input"
            placeholder="Search events…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="max-h-96 overflow-y-auto p-2">
          {loading ? (
            <div className="p-8 text-center text-white/30 text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-white/30 text-sm">No events found</div>
          ) : filtered.map(ev => (
            <button
              key={ev.id}
              onClick={() => onSelect(ev)}
              className="w-full text-left px-3 py-3 rounded-xl hover:bg-white/5 transition-all"
            >
              <p className="text-white text-sm font-medium">{ev.name}</p>
              <p className="text-white/35 text-xs mt-0.5">
                {fmt(ev.date)}
                {ev.location && <> · {ev.location}</>}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function AdminRallyEditor({ prefill, userId, onSave, onCancel }) {
  const [form, setForm] = useState({
    name:     prefill?.name     || '',
    date:     prefill?.date     || '',
    end_date: prefill?.end_date || '',
    location: prefill?.location || '',
    series:   (prefill?.series || []).join(', '),
  })
  const [saving, setSaving] = useState(false)

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function save() {
    if (!form.name.trim() || !form.date) return toast.error('Name and date required')
    setSaving(true)
    const { data: rally, error } = await supabase.from('rallies').insert({
      name:         form.name.trim(),
      date:         form.date,
      end_date:     form.end_date || null,
      location:     form.location.trim() || null,
      series:       form.series ? form.series.split(',').map(s => s.trim()).filter(Boolean).join(', ') : null,
      organiser_id: userId,
      status:       'active',
    }).select().single()

    if (error) { setSaving(false); return toast.error('Failed to create rally') }

    // Link the calendar event if it came from one
    if (prefill?.id) {
      await supabase.from('calendar_events').update({ rally_id: rally.id }).eq('id', prefill.id)
    }

    toast.success('Rally created and linked to calendar!')
    setSaving(false)
    onSave()
  }

  return (
    <EditorShell title="Create rally from calendar event" onCancel={onCancel}>
      <div className="p-3 bg-rl-accent/8 border border-rl-accent/20 rounded-xl mb-1">
        <p className="text-white/50 text-xs">
          Pre-filled from <span className="text-white/70 font-medium">{prefill?.name}</span>. Edit as needed.
          Rally will be created as <span className="text-emerald-400 font-medium">Active</span> and linked to the calendar entry.
        </p>
      </div>
      <Field label="Rally name">
        <input className="rl-input" value={form.name} onChange={e => set('name', e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Start date">
          <input type="date" className="rl-input" value={form.date} onChange={e => set('date', e.target.value)} />
        </Field>
        <Field label="End date" hint="optional">
          <input type="date" className="rl-input" value={form.end_date || ''} onChange={e => set('end_date', e.target.value)} />
        </Field>
      </div>
      <Field label="Location">
        <input className="rl-input" value={form.location} onChange={e => set('location', e.target.value)} />
      </Field>
      <Field label="Series" hint="comma-separated">
        <input className="rl-input" value={form.series} onChange={e => set('series', e.target.value)} />
      </Field>
      <div className="pt-2">
        <button onClick={save} disabled={saving} className="rl-btn-primary text-sm px-5 py-2.5">
          {saving ? 'Creating…' : 'Create rally'}
        </button>
      </div>
    </EditorShell>
  )
}

// ─── Shared UI ───────────────────────────────────────────────────────────────

function Section({ title, count, action, loading, empty, emptyText, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-white font-semibold">{title}</h2>
          <p className="text-white/35 text-xs mt-0.5">{count}</p>
        </div>
        {action}
      </div>
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />)}</div>
      ) : empty ? (
        <div className="text-center py-16 text-white/30 text-sm border border-dashed border-white/10 rounded-xl">{emptyText}</div>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  )
}

function Row({ badge, meta, title, sub, actions }) {
  return (
    <div className="flex items-center gap-4 bg-white/3 border border-white/8 rounded-xl px-4 py-3.5 hover:border-white/15 transition-all">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          {badge}
          {meta && <span className="text-white/25 text-[10px]">{meta}</span>}
        </div>
        <p className="text-white text-sm font-medium truncate">{title}</p>
        {sub && <p className="text-white/35 text-xs truncate mt-0.5">{sub}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {actions.map(a => a.href ? (
          <Link key={a.label} to={a.href}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-all no-underline ${
              a.primary ? 'border-rl-accent/40 text-rl-accent hover:border-rl-accent' : 'border-white/10 text-white/40 hover:text-white hover:border-white/25'
            }`}
          >{a.label}</Link>
        ) : (
          <button key={a.label} onClick={a.onClick}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
              a.danger ? 'border-white/10 text-red-400/60 hover:text-red-400 hover:border-red-400/30'
              : a.primary ? 'border-rl-accent/40 text-rl-accent hover:border-rl-accent'
              : 'border-white/10 text-white/40 hover:text-white hover:border-white/25'
            }`}
          >{a.label}</button>
        ))}
      </div>
    </div>
  )
}

function StatusBadge({ status, labels }) {
  const colours = {
    published:   'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    draft:       'bg-white/8 text-white/35 border-white/10',
    confirmed:   'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    provisional: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
    cancelled:   'bg-red-500/15 text-red-400 border-red-500/25',
    active:      'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    archived:    'bg-white/8 text-white/35 border-white/10',
  }
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${colours[status] || colours.draft}`}>
      {labels[status] || status}
    </span>
  )
}

function EditorShell({ title, onCancel, children }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onCancel} className="text-white/40 hover:text-white transition-colors">
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M7.78 4.22a.75.75 0 010 1.06L5.06 8l2.72 2.72a.75.75 0 11-1.06 1.06L3.47 8.53a.75.75 0 010-1.06l3.25-3.25a.75.75 0 011.06 0z" />
          </svg>
        </button>
        <h2 className="text-white font-semibold text-lg">{title}</h2>
      </div>
      <div className="max-w-xl space-y-4">{children}</div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="rl-label">
        {label}
        {hint && <span className="text-white/20 normal-case tracking-normal font-normal ml-1">({hint})</span>}
      </label>
      {children}
    </div>
  )
}
