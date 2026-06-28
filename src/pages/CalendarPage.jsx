import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatDateRange } from '../lib/dateUtils'

const SURFACE = {
  gravel:     { bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  text: 'text-amber-400',  dot: 'bg-amber-400',  bar: 'bg-amber-400',  label: 'Gravel' },
  tarmac:     { bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   text: 'text-blue-400',   dot: 'bg-blue-400',   bar: 'bg-blue-400',   label: 'Tarmac' },
  closed_road:{ bg: 'bg-violet-500/10', border: 'border-violet-500/30', text: 'text-violet-400', dot: 'bg-violet-400', bar: 'bg-violet-400', label: 'Closed Road' },
  mixed:      { bg: 'bg-white/5',       border: 'border-white/10',      text: 'text-white/40',   dot: 'bg-white/30',   bar: 'bg-white/20',   label: 'Mixed' },
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const FILTERS = [
  { id: null,          label: 'All events' },
  { id: 'gravel',      label: 'Gravel' },
  { id: 'tarmac',      label: 'Tarmac' },
  { id: 'closed_road', label: 'Closed Road' },
]

function groupByMonth(events) {
  const groups = {}
  for (const e of events) {
    const d = new Date(e.date + 'T00:00:00')
    const key = `${d.getFullYear()}-${d.getMonth()}`
    if (!groups[key]) groups[key] = { year: d.getFullYear(), month: d.getMonth(), events: [] }
    groups[key].events.push(e)
  }
  return Object.values(groups).sort((a, b) => a.year - b.year || a.month - b.month)
}

export default function CalendarPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [surface, setSurface] = useState(null)

  useEffect(() => {
    supabase
      .from('calendar_events')
      .select('*')
      .order('date', { ascending: true })
      .then(({ data }) => {
        setEvents(data || [])
        setLoading(false)
      })
  }, [])

  const filtered = useMemo(() =>
    surface ? events.filter(e => e.surface === surface) : events,
    [events, surface]
  )

  const grouped = useMemo(() => groupByMonth(filtered), [filtered])

  const now = new Date()
  const confirmedCount = events.filter(e => e.status !== 'cancelled').length

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 sm:py-10">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight mb-1">
          UK Rally Calendar
        </h1>
        <p className="text-white/35 text-sm">
          {loading ? '…' : `${confirmedCount} confirmed events · 2026 season`}
        </p>
      </div>

      {/* Surface filter pills */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 no-scrollbar">
        {FILTERS.map(f => {
          const s = f.id ? SURFACE[f.id] : null
          const active = surface === f.id
          return (
            <button
              key={String(f.id)}
              onClick={() => setSurface(f.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
                active
                  ? 'bg-white text-black'
                  : 'bg-white/6 text-white/50 hover:text-white hover:bg-white/10'
              }`}
            >
              {s && (
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'bg-black' : s.dot}`} />
              )}
              {f.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-10">
          {[0, 1, 2].map(i => (
            <div key={i}>
              <div className="h-3 w-20 bg-white/5 rounded animate-pulse mb-4" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="h-28 bg-white/5 rounded-xl animate-pulse" />
                <div className="h-28 bg-white/5 rounded-xl animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-white/30 text-sm">No events found.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {grouped.map(({ year, month, events: monthEvents }) => {
            const isPast = new Date(year, month + 1, 0) < now
            const isCurrent = new Date(year, month) <= now && now <= new Date(year, month + 1, 0)
            return (
              <section key={`${year}-${month}`}>
                {/* Month header */}
                <div className="flex items-center gap-3 mb-4">
                  <span className={`text-xs font-semibold uppercase tracking-widest flex-shrink-0 ${
                    isCurrent ? 'text-rl-accent' : isPast ? 'text-white/20' : 'text-white/50'
                  }`}>
                    {MONTHS[month]} {year}
                  </span>
                  {isCurrent && (
                    <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-rl-accent animate-pulse" />
                  )}
                  <div className="flex-1 h-px bg-white/6" />
                </div>

                {/* Event cards grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {monthEvents.map(event => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* Legend */}
      {!loading && (
        <div className="mt-12 pt-6 border-t border-white/6 flex flex-wrap gap-4 items-center">
          <span className="text-white/20 text-xs">Surface key</span>
          {Object.entries(SURFACE).map(([key, s]) => (
            <span key={key} className="flex items-center gap-1.5 text-xs text-white/35">
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </main>
  )
}

function EventCard({ event }) {
  const surf = SURFACE[event.surface] || SURFACE.mixed
  const isPast = new Date((event.end_date || event.date) + 'T23:59:59') < new Date()
  const isCancelled = event.status === 'cancelled'
  const isRallyGo = !!event.rally_id

  const card = (
    <div className={`relative h-full rounded-xl border overflow-hidden transition-all duration-150 ${
      isCancelled
        ? 'border-white/5 bg-white/2 opacity-45'
        : isRallyGo
          ? 'border-rl-accent/25 bg-rl-accent/4 hover:border-rl-accent/50 hover:bg-rl-accent/8 cursor-pointer'
          : isPast
            ? 'border-white/6 bg-white/2 opacity-60'
            : 'border-white/8 bg-white/3 hover:border-white/18'
    }`}>
      {/* Surface colour bar */}
      <div className={`h-0.5 w-full opacity-70 ${surf.bar}`} />

      <div className="p-4">
        {/* Badges row */}
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex flex-wrap gap-1.5">
            {/* Surface badge */}
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${surf.bg} ${surf.text} ${surf.border}`}>
              <span className={`w-1 h-1 rounded-full ${surf.dot}`} />
              {surf.label}
            </span>
            {/* Series badges */}
            {event.series?.filter(Boolean).map(s => (
              <span key={s} className="text-[10px] text-white/35 bg-white/5 border border-white/8 px-2 py-0.5 rounded-full">
                {s}
              </span>
            ))}
          </div>
          {/* Right-side status badge */}
          {isCancelled ? (
            <span className="flex-shrink-0 text-[10px] font-semibold text-red-400 bg-red-400/10 border border-red-400/20 px-2 py-0.5 rounded-full">
              Cancelled
            </span>
          ) : isRallyGo ? (
            <span className="flex-shrink-0 text-[10px] font-semibold text-rl-accent bg-rl-accent/10 border border-rl-accent/20 px-2 py-0.5 rounded-full">
              On RallyGo ›
            </span>
          ) : null}
        </div>

        {/* Name */}
        <h3 className={`font-semibold text-[15px] leading-snug mb-1.5 ${
          isCancelled ? 'line-through text-white/30' : isPast ? 'text-white/45' : 'text-white'
        }`}>
          {event.name}
        </h3>

        {/* Date + location */}
        <p className="text-white/35 text-xs leading-relaxed">
          {formatDateRange(event.date, event.end_date)}
          {event.location && (
            <>
              <span className="text-white/15 mx-1.5">·</span>
              {event.location}
            </>
          )}
        </p>
      </div>
    </div>
  )

  if (isRallyGo && !isCancelled) {
    return (
      <Link to={`/event/${event.rally_id}`} className="block no-underline h-full">
        {card}
      </Link>
    )
  }

  return <div className="h-full">{card}</div>
}
