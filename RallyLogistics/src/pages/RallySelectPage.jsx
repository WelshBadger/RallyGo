import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

function fmt(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0)
  const diff = Math.round((target - today) / 86400000)
  if (diff < 0) return null
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return `${diff} days`
}

// e = calendar_events row. Has rally_id when a full RallyGo event exists.
function EventCard({ e, highlight }) {
  const countdown = daysUntil(e.date)
  const hasFull = !!e.rally_id
  const to = hasFull ? `/pack/${e.rally_id}` : `/pack/cal/${e.id}`
  return (
    <Link to={to}
      className={`block rounded-xl px-5 py-4 transition-all no-underline group border ${
        highlight
          ? 'bg-rl-accent/8 border-rl-accent/30 hover:border-rl-accent/55'
          : 'bg-rl-card border-white/10 hover:border-white/25'
      }`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          {e.series && <p className="text-white/30 text-[11px] mb-1">{e.series}</p>}
          <h2 className="font-medium text-base leading-tight text-white">{e.name}</h2>
          <div className="flex items-center gap-3 mt-1 text-xs text-white/35 flex-wrap">
            <span>{fmt(e.date)}{e.end_date && e.end_date !== e.date ? ` – ${fmt(e.end_date)}` : ''}</span>
            {e.location && <span>{e.location}</span>}
          </div>
          <div className="mt-2">
            {hasFull ? (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-green-500/12 text-green-600 border border-green-500/25 font-medium">
                ✓ Full details available
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/40 border border-white/10 font-medium">
                Calendar listing · plan your own pack
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {countdown && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              highlight ? 'bg-rl-accent/15 text-rl-accent' : 'bg-white/5 text-white/40'
            }`}>
              {countdown}
            </span>
          )}
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors">
            <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.75a.75.75 0 010-1.5h7.44L8.22 4.03a.75.75 0 010-1.06z" clipRule="evenodd" />
          </svg>
        </div>
      </div>
    </Link>
  )
}

function CustomCard({ p }) {
  const countdown = daysUntil(p.custom_date)
  return (
    <Link to={`/pack/custom/${p.id}`}
      className="block rounded-xl px-5 py-4 transition-all no-underline group border bg-rl-card border-white/10 hover:border-white/25">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="font-medium text-base leading-tight text-white">{p.custom_name}</h2>
          <div className="flex items-center gap-3 mt-1 text-xs text-white/35 flex-wrap">
            {p.custom_date && <span>{fmt(p.custom_date)}{p.custom_end_date && p.custom_end_date !== p.custom_date ? ` – ${fmt(p.custom_end_date)}` : ''}</span>}
            {p.custom_location && <span>{p.custom_location}</span>}
          </div>
          <div className="mt-2">
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/40 border border-white/10 font-medium">
              Your own rally · private
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {countdown && <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-white/5 text-white/40">{countdown}</span>}
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors">
            <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.75a.75.75 0 010-1.5h7.44L8.22 4.03a.75.75 0 010-1.06z" clipRule="evenodd" />
          </svg>
        </div>
      </div>
    </Link>
  )
}

const ROLE_CHIP = { admin: 'Admin', editor: 'Editor', viewer: 'View only' }
function SharedCard({ p }) {
  return (
    <Link to={`/pack/team/${p.id}`}
      className="block rounded-xl px-5 py-4 transition-all no-underline group border bg-rl-card border-white/10 hover:border-white/25">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="font-medium text-base leading-tight text-white truncate">{p.name}</h2>
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-rl-accent/10 text-rl-accent border border-rl-accent/25 font-medium">
              Shared with you · {ROLE_CHIP[p.role] || p.role}
            </span>
            {p.car_number && <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/40 border border-white/10 font-medium">Car {p.car_number}</span>}
          </div>
        </div>
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors flex-shrink-0">
          <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.75a.75.75 0 010-1.5h7.44L8.22 4.03a.75.75 0 010-1.06z" clipRule="evenodd" />
        </svg>
      </div>
    </Link>
  )
}

function SectionLabel({ label }) {
  return (
    <div className="flex items-center gap-3 mb-3 mt-6 first:mt-0">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">{label}</span>
      <div className="flex-1 h-px bg-white/8" />
    </div>
  )
}

export default function RallySelectPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [customPacks, setCustomPacks] = useState([])
  const [sharedPacks, setSharedPacks] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', date: '', end_date: '', location: '' })
  const today = useMemo(() => new Date().toISOString().split('T')[0], [])

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('calendar_events')
        .select('id, name, date, end_date, location, series, surface, status, rally_id')
        .order('date', { ascending: true }),
      supabase.from('logistics_packs')
        .select('id, custom_name, custom_date, custom_end_date, custom_location')
        .eq('user_id', user.id)
        .not('custom_name', 'is', null)
        .order('custom_date', { ascending: true }),
      supabase.from('pack_members')
        .select('role, logistics_packs(id, rally_id, calendar_event_id, custom_name, custom_date, car_number)')
        .eq('user_id', user.id),
    ]).then(([ev, cp, sp]) => {
      const evData = (!ev.error && ev.data) ? ev.data : []
      setEvents(evData)
      if (!cp.error && cp.data) setCustomPacks(cp.data)
      if (!sp.error && sp.data) {
        const nameFor = (pk) => pk.custom_name
          || (pk.rally_id && evData.find(e => e.rally_id === pk.rally_id)?.name)
          || (pk.calendar_event_id && evData.find(e => e.id === pk.calendar_event_id)?.name)
          || 'Rally'
        setSharedPacks(sp.data.filter(m => m.logistics_packs).map(m => ({
          id: m.logistics_packs.id, role: m.role, car_number: m.logistics_packs.car_number,
          date: m.logistics_packs.custom_date, name: nameFor(m.logistics_packs),
        })))
      }
      setLoading(false)
    })
  }, [user])

  async function addRally(e) {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Give your rally a name'); return }
    setSaving(true)
    try {
      const { data, error } = await supabase.from('logistics_packs').insert({
        user_id: user.id,
        custom_name: form.name.trim(),
        custom_date: form.date || null,
        custom_end_date: form.end_date || null,
        custom_location: form.location.trim() || null,
        team_members: [],
        fuel_schedule: [],
      }).select().single()
      if (error) throw error
      navigate(`/pack/custom/${data.id}`)
    } catch (err) {
      toast.error(err.message || 'Could not add rally')
      setSaving(false)
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return events
    const q = search.toLowerCase()
    return events.filter(e =>
      e.name?.toLowerCase().includes(q) ||
      e.location?.toLowerCase().includes(q) ||
      e.series?.toLowerCase().includes(q)
    )
  }, [events, search])

  const upcoming = filtered.filter(e => (e.end_date || e.date) >= today)
  const past = filtered.filter(e => (e.end_date || e.date) < today)
  const next = upcoming[0]

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/10 border-t-rl-accent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-white font-semibold text-lg">Choose your rally</h1>
        <button onClick={() => setAdding(a => !a)} className="rl-btn-primary text-xs flex-shrink-0">
          {adding ? 'Close' : '+ Add rally'}
        </button>
      </div>
      <p className="text-white/40 text-xs mb-4">Search the RallyGo calendar, or add your own rally if it isn't listed.</p>

      {/* Add-your-own-rally form */}
      {adding && (
        <form onSubmit={addRally} className="bg-rl-card border border-white/10 rounded-xl p-4 mb-5 space-y-3">
          <div>
            <label className="text-white/35 text-[10px] uppercase tracking-wide mb-1 block">Rally name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Local club stage rally" className="rl-input text-sm w-full" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-white/35 text-[10px] uppercase tracking-wide mb-1 block">Start date</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="rl-input text-sm w-full" />
            </div>
            <div>
              <label className="text-white/35 text-[10px] uppercase tracking-wide mb-1 block">End date</label>
              <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="rl-input text-sm w-full" />
            </div>
          </div>
          <div>
            <label className="text-white/35 text-[10px] uppercase tracking-wide mb-1 block">Location</label>
            <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              placeholder="e.g. Kielder, Northumberland" className="rl-input text-sm w-full" />
          </div>
          <button type="submit" disabled={saving} className="rl-btn-primary w-full justify-center text-sm disabled:opacity-50">
            {saving ? 'Creating…' : 'Create pack'}
          </button>
        </form>
      )}

      {/* Search */}
      <div className="relative mb-5">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search rally, location or series…"
          className="rl-input w-full pl-9 text-sm"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
        </svg>
      </div>

      {/* Shared with me — packs another crew invited me to */}
      {sharedPacks.length > 0 && !search && (
        <>
          <SectionLabel label="Shared with me" />
          <div className="space-y-2">
            {sharedPacks.map(p => <SharedCard key={p.id} p={p} />)}
          </div>
        </>
      )}

      {/* My own rallies */}
      {customPacks.length > 0 && !search && (
        <>
          <SectionLabel label="Your rallies" />
          <div className="space-y-2">
            {customPacks.map(p => <CustomCard key={p.id} p={p} />)}
          </div>
        </>
      )}

      {filtered.length === 0 && customPacks.length === 0 && (
        <div className="text-center py-16">
          <p className="text-white/20 text-4xl mb-3">🏁</p>
          <p className="text-white/40 text-sm">{search ? 'No events match your search.' : 'No events yet — add your own rally to get started.'}</p>
        </div>
      )}

      {upcoming.length > 0 && (
        <>
          <SectionLabel label={customPacks.length > 0 && !search ? 'RallyGo calendar' : 'Upcoming'} />
          <div className="space-y-2">
            {upcoming.map(e => <EventCard key={e.id} e={e} highlight={e.id === next?.id} />)}
          </div>
        </>
      )}

      {past.length > 0 && (
        <>
          <SectionLabel label="Past" />
          <div className="space-y-2 opacity-60">
            {past.map(e => <EventCard key={e.id} e={e} highlight={false} />)}
          </div>
        </>
      )}
    </main>
  )
}
