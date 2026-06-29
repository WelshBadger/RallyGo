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
  { id: 'news',     label: 'News' },
  { id: 'calendar', label: 'Calendar Events' },
  { id: 'rallies',  label: 'Rallies' },
]

// ─── Root ────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [tab, setTab] = useState('news')
  const { profile } = useAuth()

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white mb-1">Admin</h1>
        <p className="text-white/35 text-sm">Manage all content on RallyGo</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-white/4 rounded-xl p-1 mb-8 w-full sm:w-auto sm:inline-flex">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id ? 'bg-white text-black' : 'text-white/50 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'news'     && <NewsTab />}
      {tab === 'calendar' && <CalendarTab />}
      {tab === 'rallies'  && <RalliesTab />}
    </main>
  )
}

// ─── News tab ────────────────────────────────────────────────────────────────

function NewsTab() {
  const { user } = useAuth()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)

  async function load() {
    const { data } = await supabase.from('news_posts').select('*').order('created_at', { ascending: false })
    setPosts(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

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
      action={<button onClick={() => setEditing('new')} className="rl-btn-primary text-sm px-4 py-2">+ New post</button>}
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

// ─── Calendar Events tab ─────────────────────────────────────────────────────

const SURFACES = ['gravel', 'tarmac', 'closed_road', 'mixed']
const STATUSES = ['confirmed', 'provisional', 'cancelled']

const EMPTY_EVENT = { name: '', date: '', end_date: '', location: '', surface: 'gravel', series: '', status: 'confirmed', external_url: '' }

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
    series: (event.series || []).join(', '),
  } : EMPTY_EVENT)
  const [saving, setSaving] = useState(false)

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function save() {
    if (!form.name.trim() || !form.date) return toast.error('Name and date required')
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      date: form.date,
      end_date: form.end_date || null,
      location: form.location.trim() || null,
      surface: form.surface,
      series: form.series ? form.series.split(',').map(s => s.trim()).filter(Boolean) : [],
      status: form.status,
      external_url: form.external_url.trim() || null,
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
            {SURFACES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className="rl-input" value={form.status} onChange={e => set('status', e.target.value)}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Series" hint="comma-separated, e.g. BTRDA, MSA">
        <input className="rl-input" value={form.series} onChange={e => set('series', e.target.value)} placeholder="BTRDA, MSA" />
      </Field>
      <Field label="External URL" hint="optional">
        <input className="rl-input" value={form.external_url} onChange={e => set('external_url', e.target.value)} placeholder="https://…" />
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
  const [rallies, setRallies] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('rallies').select('*').order('date', { ascending: false })
      .then(({ data }) => { setRallies(data || []); setLoading(false) })
  }, [])

  return (
    <Section
      title="All rallies"
      count={`${rallies.length} total`}
      action={<Link to="/organiser/create" className="rl-btn-primary text-sm px-4 py-2">+ New rally</Link>}
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
          ]}
        />
      ))}
    </Section>
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
