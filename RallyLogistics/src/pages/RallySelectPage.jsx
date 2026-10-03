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

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_HEADERS = ['Mo','Tu','We','Th','Fr','Sa','Su']
const SURFACE_DOT = { gravel: '#f59e0b', mixed: '#f59e0b', tarmac: '#3b82f6', road_rally: '#8b5cf6', closed_road: '#8b5cf6' }

// Local-time YYYY-MM-DD (toISOString would shift the day during BST)
function toISO(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

const onDay = (e, day) => day >= e.date && day <= (e.end_date || e.date)

// Compact month grid: a dot per rally on each day; tapping a day filters the list
function MonthGrid({ year, month, events, today, selectedDay, onSelectDay, onPrev, onNext }) {
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days = Array(startOffset).fill(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(toISO(new Date(year, month, d)))
  const arrow = 'w-9 h-9 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/8 transition-all'
  return (
    <div className="bg-rl-card border border-white/10 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/8">
        <button onClick={onPrev} aria-label="Previous month" className={arrow}>‹</button>
        <span className="text-white font-semibold text-sm">{MONTHS[month]} {year}</span>
        <button onClick={onNext} aria-label="Next month" className={arrow}>›</button>
      </div>
      <div className="px-2 pb-2">
        <div className="grid grid-cols-7">
          {DAY_HEADERS.map(d => (
            <div key={d} className="py-1.5 text-center text-[10px] font-medium text-white/25 uppercase tracking-wider">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5">
          {days.map((day, i) => {
            if (!day) return <div key={i} />
            const dayEvents = events.filter(e => onDay(e, day))
            const hasEvents = dayEvents.length > 0
            return (
              <button
                key={day}
                type="button"
                disabled={!hasEvents}
                onClick={() => onSelectDay(day)}
                className={`h-10 flex flex-col items-center justify-center gap-0.5 rounded-lg transition-all ${
                  day === selectedDay ? 'bg-rl-accent/10 ring-1 ring-rl-accent/40' : hasEvents ? 'hover:bg-white/8' : ''
                }`}
              >
                <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs ${
                  day === today ? 'bg-rl-accent text-white font-semibold'
                  : hasEvents ? 'text-white font-semibold'
                  : 'text-white/35'
                }`}>
                  {Number(day.slice(8))}
                </span>
                <span className="flex gap-0.5 h-1.5">
                  {dayEvents.slice(0, 3).map(e => (
                    <span key={e.id} className="w-1.5 h-1.5 rounded-full" style={{ background: SURFACE_DOT[e.surface] || SURFACE_DOT.mixed }} />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
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
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [customPacks, setCustomPacks] = useState([])
  const [myPacks, setMyPacks] = useState([]) // my packs for calendar / RallyHQ rallies
  const [sharedPacks, setSharedPacks] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', date: '', end_date: '', location: '' })
  const today = useMemo(() => toISO(new Date()), [])
  const [calYear, setCalYear] = useState(() => new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth())
  const [selectedDay, setSelectedDay] = useState(null)

  function changeMonth(delta) {
    const d = new Date(calYear, calMonth + delta, 1)
    setCalYear(d.getFullYear())
    setCalMonth(d.getMonth())
    setSelectedDay(null)
  }

  useEffect(() => {
    if (authLoading) return
    const calendar = supabase.from('calendar_events')
      .select('id, name, date, end_date, location, series, surface, status, rally_id')
      .order('date', { ascending: true })
    // Signed out: the calendar is public, packs need an account
    if (!user) {
      calendar.then(ev => {
        setEvents((!ev.error && ev.data) ? ev.data : [])
        setCustomPacks([])
        setMyPacks([])
        setSharedPacks([])
        setLoading(false)
      })
      return
    }
    Promise.all([
      calendar,
      supabase.from('logistics_packs')
        .select('id, custom_name, custom_date, custom_end_date, custom_location')
        .eq('user_id', user.id)
        .not('custom_name', 'is', null)
        .order('custom_date', { ascending: true }),
      supabase.from('pack_members')
        .select('role, logistics_packs(id, rally_id, calendar_event_id, custom_name, custom_date, car_number)')
        .eq('user_id', user.id),
      supabase.from('logistics_packs')
        .select('id, rally_id, calendar_event_id')
        .eq('user_id', user.id)
        .is('custom_name', null),
    ]).then(([ev, cp, sp, mine]) => {
      const evData = (!ev.error && ev.data) ? ev.data : []
      setEvents(evData)
      if (!cp.error && cp.data) setCustomPacks(cp.data)
      if (!mine.error && mine.data) setMyPacks(mine.data)
      if (!sp.error && sp.data) {
        const nameFor = (pk) => pk.custom_name
          || (pk.rally_id && evData.find(e => e.rally_id === pk.rally_id)?.name)
          || (pk.calendar_event_id && evData.find(e => e.id === pk.calendar_event_id)?.name)
          || 'Rally'
        const eventFor = (pk) => (pk.rally_id && evData.find(e => e.rally_id === pk.rally_id))
          || (pk.calendar_event_id && evData.find(e => e.id === pk.calendar_event_id)) || null
        setSharedPacks(sp.data.filter(m => m.logistics_packs).map(m => ({
          id: m.logistics_packs.id, role: m.role, car_number: m.logistics_packs.car_number,
          date: m.logistics_packs.custom_date || eventFor(m.logistics_packs)?.date || null,
          end_date: eventFor(m.logistics_packs)?.end_date || null,
          name: nameFor(m.logistics_packs),
        })))
      }
      setLoading(false)
    })
  }, [user, authLoading])

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

  const next = events.find(e => (e.end_date || e.date) >= today)

  // The rally to pin at the top: the soonest current/upcoming one I have a pack for
  // (my own, a crew's pack shared with me, or my own rally); otherwise the next on the calendar.
  const pinned = useMemo(() => {
    const myRallyIds = new Set(myPacks.map(p => p.rally_id).filter(Boolean))
    const myCalIds = new Set(myPacks.map(p => p.calendar_event_id).filter(Boolean))
    const mine = [
      ...events.filter(e => myRallyIds.has(e.rally_id) || myCalIds.has(e.id))
        .map(e => ({ name: e.name, date: e.date, end: e.end_date, location: e.location, to: e.rally_id ? `/pack/${e.rally_id}` : `/pack/cal/${e.id}` })),
      ...sharedPacks.filter(p => p.date).map(p => ({ name: p.name, date: p.date, end: p.end_date, to: `/pack/team/${p.id}`, shared: true })),
      ...customPacks.filter(p => p.custom_date).map(p => ({ name: p.custom_name, date: p.custom_date, end: p.custom_end_date, location: p.custom_location, to: `/pack/custom/${p.id}` })),
    ].filter(r => (r.end || r.date) >= today).sort((a, b) => a.date.localeCompare(b.date))
    if (mine.length) return { ...mine[0], yours: true }
    return next ? { name: next.name, date: next.date, end: next.end_date, location: next.location, to: next.rally_id ? `/pack/${next.rally_id}` : `/pack/cal/${next.id}` } : null
  }, [events, myPacks, sharedPacks, customPacks, next, today])
  const monthFirst = toISO(new Date(calYear, calMonth, 1))
  const monthLast = toISO(new Date(calYear, calMonth + 1, 0))
  const monthEvents = events.filter(e => e.date <= monthLast && (e.end_date || e.date) >= monthFirst)
  const dayEvents = selectedDay ? monthEvents.filter(e => onDay(e, selectedDay)) : monthEvents

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/10 border-t-rl-accent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-6">
      {pinned && (() => {
        const now = pinned.date <= today
        const days = daysUntil(pinned.date)
        return (
          <Link to={pinned.to} className="block mb-5 rounded-2xl border border-rl-accent/40 bg-rl-accent/10 px-5 py-4 no-underline hover:border-rl-accent/70 transition-all">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-rl-accent mb-1">
              {now ? 'Happening now' : pinned.yours ? `Your next rally${days ? ` · ${days}` : ''}` : `Next rally on the calendar${days ? ` · ${days}` : ''}`}
            </p>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-white font-semibold text-lg leading-tight truncate">{pinned.name}</h2>
                <p className="text-white/45 text-xs mt-1 truncate">
                  {fmt(pinned.date)}{pinned.end && pinned.end !== pinned.date ? ` – ${fmt(pinned.end)}` : ''}
                  {pinned.location ? ` · ${pinned.location}` : ''}
                </p>
              </div>
              <span className="rl-btn-primary text-xs flex-shrink-0">Open</span>
            </div>
          </Link>
        )
      })()}

      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-white font-semibold text-lg">Choose your rally</h1>
        {user ? (
          <button onClick={() => setAdding(a => !a)} className="rl-btn-primary text-xs flex-shrink-0">
            {adding ? 'Close' : '+ Add rally'}
          </button>
        ) : (
          <Link to="/login" className="rl-btn-primary text-xs flex-shrink-0 no-underline">Sign in</Link>
        )}
      </div>
      <p className="text-white/40 text-xs mb-4">
        {user
          ? "Search the RallyHQ calendar, or add your own rally if it isn't listed."
          : 'Pick a rally from the calendar. You will be asked to sign in or register to open it.'}
      </p>

      {/* Add-your-own-rally form */}
      {user && adding && (
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
          placeholder="Search all rallies, locations or series…"
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

      {search.trim() ? (
        <>
          <SectionLabel label="Search results" />
          {filtered.length === 0 ? (
            <p className="text-white/40 text-sm text-center py-8">No events match your search.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map(e => <EventCard key={e.id} e={e} highlight={e.id === next?.id} />)}
            </div>
          )}
        </>
      ) : (
        <>
          <SectionLabel label="Rally calendar" />
          <MonthGrid
            year={calYear}
            month={calMonth}
            events={monthEvents}
            today={today}
            selectedDay={selectedDay}
            onSelectDay={day => setSelectedDay(d => (d === day ? null : day))}
            onPrev={() => changeMonth(-1)}
            onNext={() => changeMonth(1)}
          />

          <div className="flex items-center gap-3 mb-3 mt-6">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
              {selectedDay
                ? new Date(selectedDay + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })
                : `${MONTHS[calMonth]} ${calYear}`}
            </span>
            <div className="flex-1 h-px bg-white/8" />
            {selectedDay && (
              <button onClick={() => setSelectedDay(null)} className="text-xs text-white/50 hover:text-white transition-colors">
                Show whole month
              </button>
            )}
          </div>

          {dayEvents.length === 0 ? (
            <p className="text-white/40 text-sm text-center py-8">No rallies {selectedDay ? 'on this day' : 'this month'}.</p>
          ) : (
            <div className="space-y-2">
              {dayEvents.map(e => <EventCard key={e.id} e={e} highlight={e.id === next?.id} />)}
            </div>
          )}
        </>
      )}
    </main>
  )
}
