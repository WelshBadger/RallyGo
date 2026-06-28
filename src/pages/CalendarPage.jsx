import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatDateRange } from '../lib/dateUtils'

const SURFACE = {
  gravel:     { bg: 'bg-amber-500',   light: 'bg-amber-500/15',  border: 'border-amber-500/40',  text: 'text-amber-300',   dot: 'bg-amber-400',   label: 'Gravel' },
  tarmac:     { bg: 'bg-blue-500',    light: 'bg-blue-500/15',   border: 'border-blue-500/40',   text: 'text-blue-300',    dot: 'bg-blue-400',    label: 'Tarmac' },
  closed_road:{ bg: 'bg-violet-500',  light: 'bg-violet-500/15', border: 'border-violet-500/40', text: 'text-violet-300',  dot: 'bg-violet-400',  label: 'Closed Road' },
  mixed:      { bg: 'bg-white/30',    light: 'bg-white/5',       border: 'border-white/20',      text: 'text-white/50',    dot: 'bg-white/40',    label: 'Mixed' },
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_HEADERS = ['Mo','Tu','We','Th','Fr','Sa','Su']

// Returns all calendar day cells for a given month (Mon-start, padded to full weeks)
function buildCalendarDays(year, month) {
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)
  const startOffset = (first.getDay() + 6) % 7 // Mon=0 … Sun=6

  const days = []
  // Leading days from prev month
  for (let i = startOffset - 1; i >= 0; i--) {
    days.push({ date: new Date(year, month, -i), current: false })
  }
  // Current month
  for (let d = 1; d <= last.getDate(); d++) {
    days.push({ date: new Date(year, month, d), current: true })
  }
  // Trailing days to complete last row
  const tail = days.length % 7
  if (tail > 0) {
    for (let i = 1; i <= 7 - tail; i++) {
      days.push({ date: new Date(year, month + 1, i), current: false })
    }
  }
  return days
}

function toISO(date) {
  return date.toISOString().split('T')[0]
}

function eventsForDay(date, events) {
  const d = toISO(date)
  return events.filter(e => d >= e.date && d <= (e.end_date || e.date))
}

function isStart(date, event) {
  return toISO(date) === event.date
}

function isEnd(date, event) {
  return toISO(date) === (event.end_date || event.date)
}

// ─── List helpers ───────────────────────────────────────────────
const LIST_MONTHS = MONTHS

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
  const [events, setEvents]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [view, setView]           = useState('calendar') // 'calendar' | 'list'
  const [selected, setSelected]   = useState(null)       // event object (for detail sheet)

  const now = new Date()
  const [calYear,  setCalYear]  = useState(now.getFullYear())
  const [calMonth, setCalMonth] = useState(now.getMonth())

  useEffect(() => {
    supabase
      .from('calendar_events')
      .select('*')
      .order('date', { ascending: true })
      .then(({ data }) => { setEvents(data || []); setLoading(false) })
  }, [])

  const calDays = useMemo(() => buildCalendarDays(calYear, calMonth), [calYear, calMonth])

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11) }
    else setCalMonth(m => m - 1)
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0) }
    else setCalMonth(m => m + 1)
  }

  const confirmedCount = events.filter(e => e.status !== 'cancelled').length

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 sm:py-10">

      {/* Header row */}
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight mb-0.5">UK Rally Calendar</h1>
          <p className="text-white/35 text-sm">{loading ? '…' : `${confirmedCount} confirmed events · 2026 season`}</p>
        </div>

        {/* View toggle */}
        <div className="flex items-center bg-white/6 rounded-lg p-0.5 gap-0.5 flex-shrink-0">
          <button
            onClick={() => setView('calendar')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'calendar' ? 'bg-white text-black' : 'text-white/50 hover:text-white'}`}
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <rect x="2" y="3" width="12" height="11" rx="1.5" />
              <path strokeLinecap="round" d="M2 6.5h12M5.5 2v2.5M10.5 2v2.5" />
            </svg>
          </button>
          <button
            onClick={() => setView('list')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'list' ? 'bg-white text-black' : 'text-white/50 hover:text-white'}`}
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" d="M4 4h8M4 8h8M4 12h8" />
            </svg>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-96 bg-white/3 rounded-2xl animate-pulse" />
      ) : view === 'calendar' ? (
        <CalendarGrid
          days={calDays}
          events={events}
          year={calYear}
          month={calMonth}
          onPrev={prevMonth}
          onNext={nextMonth}
          onSelect={setSelected}
          now={now}
        />
      ) : (
        <ListView events={events} now={now} />
      )}

      {/* Surface legend */}
      {!loading && (
        <div className="mt-8 flex flex-wrap gap-4 items-center">
          <span className="text-white/20 text-xs">Surface</span>
          {Object.entries(SURFACE).map(([key, s]) => (
            <span key={key} className="flex items-center gap-1.5 text-xs text-white/35">
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              {s.label}
            </span>
          ))}
        </div>
      )}

      {/* Event detail sheet */}
      {selected && (
        <EventSheet event={selected} onClose={() => setSelected(null)} />
      )}
    </main>
  )
}

// ─── Calendar grid ──────────────────────────────────────────────
function CalendarGrid({ days, events, year, month, onPrev, onNext, onSelect, now }) {
  const todayStr = toISO(now)
  const navigate = useNavigate()

  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
      {/* Month nav */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
        <button onClick={onPrev} className="w-8 h-8 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/8 transition-all">
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 010 1.06L7.06 8l2.72 2.72a.75.75 0 11-1.06 1.06L5.47 8.53a.75.75 0 010-1.06l3.25-3.25a.75.75 0 011.06 0z" />
          </svg>
        </button>
        <span className="text-white font-semibold text-base">{MONTHS[month]} {year}</span>
        <button onClick={onNext} className="w-8 h-8 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/8 transition-all">
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06L7.28 11.78a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z" />
          </svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-white/6">
        {DAY_HEADERS.map(d => (
          <div key={d} className="py-2 text-center text-[11px] font-medium text-white/25 uppercase tracking-wider">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const dayStr  = toISO(day.date)
          const isToday = dayStr === todayStr
          const dayEvents = eventsForDay(day.date, events)
          const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6

          return (
            <div
              key={i}
              className={`min-h-[72px] sm:min-h-[90px] border-b border-r border-white/5 p-1 sm:p-1.5 ${
                !day.current ? 'opacity-25' : ''
              } ${isWeekend && day.current ? 'bg-white/[0.02]' : ''}`}
            >
              {/* Day number */}
              <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium mb-1 ${
                isToday
                  ? 'bg-rl-accent text-white'
                  : day.current ? 'text-white/60' : 'text-white/20'
              }`}>
                {day.date.getDate()}
              </div>

              {/* Event pills */}
              <div className="space-y-0.5">
                {dayEvents.map(event => {
                  const surf = SURFACE[event.surface] || SURFACE.mixed
                  const start = isStart(day.date, event)
                  const end   = isEnd(day.date, event)
                  const cancelled = event.status === 'cancelled'
                  const isRallyGo = !!event.rally_id

                  return (
                    <button
                      key={event.id}
                      onClick={() => {
                        if (isRallyGo && !cancelled) navigate(`/event/${event.rally_id}`)
                        else onSelect(event)
                      }}
                      className={`w-full text-left flex items-center gap-1 transition-all group ${
                        cancelled ? 'opacity-40' : 'hover:opacity-90'
                      }`}
                    >
                      <div className={`
                        flex items-center overflow-hidden
                        ${start ? 'rounded-l-sm pl-1' : 'pl-0'}
                        ${end   ? 'rounded-r-sm pr-0.5' : 'pr-0'}
                        ${surf.bg} h-5 w-full
                        ${start && !end ? 'rounded-r-none' : ''}
                        ${!start && end ? 'rounded-l-none' : ''}
                        ${!start && !end ? 'rounded-none' : ''}
                      `}>
                        {start && (
                          <span className={`text-[9px] sm:text-[10px] font-semibold text-white/90 truncate leading-none ${cancelled ? 'line-through' : ''}`}>
                            {event.name}
                          </span>
                        )}
                        {isRallyGo && start && (
                          <span className="ml-auto flex-shrink-0 w-1 h-1 rounded-full bg-white/60 mr-1" />
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Event detail bottom sheet ───────────────────────────────────
function EventSheet({ event, onClose }) {
  const surf = SURFACE[event.surface] || SURFACE.mixed
  const isCancelled = event.status === 'cancelled'
  const isRallyGo = !!event.rally_id

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-[#1a1a1a] border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 w-full sm:max-w-sm mx-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center mb-4 sm:hidden">
          <div className="w-8 h-1 rounded-full bg-white/15" />
        </div>

        {/* Surface strip */}
        <div className={`h-0.5 w-full rounded-full ${surf.bg} mb-4 opacity-70`} />

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${surf.light} ${surf.text} ${surf.border}`}>
            {surf.label}
          </span>
          {event.series?.filter(Boolean).map(s => (
            <span key={s} className="text-[10px] text-white/35 bg-white/5 border border-white/8 px-2 py-0.5 rounded-full">{s}</span>
          ))}
          {isCancelled && (
            <span className="text-[10px] font-semibold text-red-400 bg-red-400/10 border border-red-400/20 px-2 py-0.5 rounded-full">Cancelled</span>
          )}
        </div>

        <h3 className={`font-semibold text-xl mb-1 ${isCancelled ? 'line-through text-white/40' : 'text-white'}`}>
          {event.name}
        </h3>
        <p className="text-white/40 text-sm mb-5">
          {formatDateRange(event.date, event.end_date)}
          {event.location && <span className="text-white/20 mx-1.5">·</span>}
          {event.location}
        </p>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/12 text-white/50 text-sm hover:border-white/25 transition-all">
            Close
          </button>
          {isRallyGo && !isCancelled && (
            <Link
              to={`/event/${event.rally_id}`}
              className="flex-1 py-2.5 rounded-xl bg-rl-accent text-white text-sm font-medium text-center no-underline hover:bg-rl-accent/90 transition-all"
            >
              Open on RallyGo →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── List view (kept as fallback) ───────────────────────────────
function ListView({ events, now }) {
  const grouped = useMemo(() => groupByMonth(events), [events])
  return (
    <div className="space-y-10">
      {grouped.map(({ year, month, events: monthEvents }) => {
        const isPast    = new Date(year, month + 1, 0) < now
        const isCurrent = new Date(year, month) <= now && now <= new Date(year, month + 1, 0)
        return (
          <section key={`${year}-${month}`}>
            <div className="flex items-center gap-3 mb-4">
              <span className={`text-xs font-semibold uppercase tracking-widest flex-shrink-0 ${isCurrent ? 'text-rl-accent' : isPast ? 'text-white/20' : 'text-white/50'}`}>
                {LIST_MONTHS[month]} {year}
              </span>
              {isCurrent && <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-rl-accent animate-pulse" />}
              <div className="flex-1 h-px bg-white/6" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {monthEvents.map(event => <ListCard key={event.id} event={event} />)}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function ListCard({ event }) {
  const surf = SURFACE[event.surface] || SURFACE.mixed
  const isCancelled = event.status === 'cancelled'
  const isRallyGo = !!event.rally_id
  const card = (
    <div className={`relative h-full rounded-xl border overflow-hidden transition-all duration-150 ${
      isCancelled ? 'border-white/5 bg-white/2 opacity-45'
      : isRallyGo ? 'border-rl-accent/25 bg-rl-accent/4 hover:border-rl-accent/50 hover:bg-rl-accent/8 cursor-pointer'
      : 'border-white/8 bg-white/3 hover:border-white/18'
    }`}>
      <div className={`h-0.5 w-full opacity-70 ${surf.bg}`} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex flex-wrap gap-1.5">
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${surf.light} ${surf.text} ${surf.border}`}>
              <span className={`w-1 h-1 rounded-full ${surf.dot}`} />{surf.label}
            </span>
            {event.series?.filter(Boolean).map(s => (
              <span key={s} className="text-[10px] text-white/35 bg-white/5 border border-white/8 px-2 py-0.5 rounded-full">{s}</span>
            ))}
          </div>
          {isCancelled
            ? <span className="flex-shrink-0 text-[10px] font-semibold text-red-400 bg-red-400/10 border border-red-400/20 px-2 py-0.5 rounded-full">Cancelled</span>
            : isRallyGo ? <span className="flex-shrink-0 text-[10px] font-semibold text-rl-accent bg-rl-accent/10 border border-rl-accent/20 px-2 py-0.5 rounded-full">On RallyGo ›</span>
            : null}
        </div>
        <h3 className={`font-semibold text-[15px] leading-snug mb-1.5 ${isCancelled ? 'line-through text-white/30' : 'text-white'}`}>{event.name}</h3>
        <p className="text-white/35 text-xs">
          {formatDateRange(event.date, event.end_date)}
          {event.location && <><span className="text-white/15 mx-1.5">·</span>{event.location}</>}
        </p>
      </div>
    </div>
  )
  if (isRallyGo && !isCancelled) return <Link to={`/event/${event.rally_id}`} className="block no-underline h-full">{card}</Link>
  return <div className="h-full">{card}</div>
}
