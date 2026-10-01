import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatDateRange } from '../lib/dateUtils'
import { getStoredCode } from '../lib/rallyAccess'
import BackButton from '../components/BackButton'

const SURFACE = {
  gravel:     { bg: 'bg-amber-500',   light: 'bg-amber-500/15',  border: 'border-amber-500/40',  text: 'text-amber-300',   dot: 'bg-amber-400',   label: 'Gravel Rally' },
  tarmac:     { bg: 'bg-blue-500',    light: 'bg-blue-500/15',   border: 'border-blue-500/40',   text: 'text-blue-300',    dot: 'bg-blue-400',    label: 'Tarmac Rally' },
  road_rally: { bg: 'bg-violet-500',  light: 'bg-violet-500/15', border: 'border-violet-500/40', text: 'text-violet-300',  dot: 'bg-violet-400',  label: 'Road Rally' },
  // legacy surface values — kept for backwards compatibility
  closed_road:{ bg: 'bg-violet-500',  light: 'bg-violet-500/15', border: 'border-violet-500/40', text: 'text-violet-300',  dot: 'bg-violet-400',  label: 'Road Rally' },
  mixed:      { bg: 'bg-amber-500',   light: 'bg-amber-500/15',  border: 'border-amber-500/40',  text: 'text-amber-300',   dot: 'bg-amber-400',   label: 'Gravel Rally' },
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_HEADERS = ['Mo','Tu','We','Th','Fr','Sa','Su']

// Local-time YYYY-MM-DD (toISOString would shift the day during BST)
function toISO(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

// Day cells for a month, Monday-first, with leading blanks
function buildMonthDays(year, month) {
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days = Array(startOffset).fill(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(toISO(new Date(year, month, d)))
  return days
}

const onDay = (e, day) => day >= e.date && day <= (e.end_date || e.date)

export default function CalendarPage() {
  const [events, setEvents]           = useState([])
  const [championships, setChampionships] = useState([])
  const [loading, setLoading]         = useState(true)
  const [champFilter, setChampFilter] = useState('all')
  const [selectedDay, setSelectedDay] = useState(null)

  const now = new Date()
  const todayStr = toISO(now)
  const [calYear,  setCalYear]  = useState(now.getFullYear())
  const [calMonth, setCalMonth] = useState(now.getMonth())

  useEffect(() => {
    Promise.all([
      supabase.from('calendar_events').select('*').order('date', { ascending: true }),
      supabase.from('championships').select('*').order('name'),
    ]).then(([{ data: evData }, { data: champData }]) => {
      setEvents(evData || [])
      setChampionships(champData || [])
      setLoading(false)
    })
  }, [])

  const filteredEvents = useMemo(() =>
    champFilter === 'all'
      ? events
      : events.filter(e => (e.series || []).includes(champFilter)),
    [events, champFilter]
  )

  const days = useMemo(() => buildMonthDays(calYear, calMonth), [calYear, calMonth])

  // Rallies that touch the month on show
  const monthEvents = useMemo(() => {
    const first = toISO(new Date(calYear, calMonth, 1))
    const last  = toISO(new Date(calYear, calMonth + 1, 0))
    return filteredEvents.filter(e => e.date <= last && (e.end_date || e.date) >= first)
  }, [filteredEvents, calYear, calMonth])

  const listEvents = selectedDay ? monthEvents.filter(e => onDay(e, selectedDay)) : monthEvents
  const nextEventId = filteredEvents.find(e => e.status !== 'cancelled' && (e.end_date || e.date) >= todayStr)?.id

  function changeMonth(delta) {
    const d = new Date(calYear, calMonth + delta, 1)
    setCalYear(d.getFullYear())
    setCalMonth(d.getMonth())
    setSelectedDay(null)
  }

  const confirmedCount = filteredEvents.filter(e => e.status !== 'cancelled').length

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 sm:py-10">

      <div className="mb-5">
        <BackButton to="/competitor" label="Back" />
      </div>

      <div className="mb-5">
        <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight mb-0.5">Rally info</h1>
        <p className="text-white/35 text-sm">{loading ? '…' : `UK rally calendar · ${confirmedCount} confirmed events`}</p>
      </div>

      {/* Championship filter chips */}
      {!loading && championships.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-5 overflow-x-auto pb-1">
          <button
            onClick={() => setChampFilter('all')}
            className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
              champFilter === 'all'
                ? 'bg-white text-black border-white'
                : 'border-white/15 text-white/50 hover:text-white hover:border-white/30'
            }`}
          >
            All events
          </button>
          {championships.map(c => {
            const active = champFilter === c.short_name
            return (
              <button
                key={c.id}
                onClick={() => setChampFilter(active ? 'all' : c.short_name)}
                className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
                  active
                    ? 'border-transparent'
                    : 'border-white/15 text-white/50 hover:text-white hover:border-white/30'
                }`}
                style={active ? { backgroundColor: c.color || '#E24B4A', borderColor: c.color || '#E24B4A', color: '#fff' } : {}}
              >
                {c.short_name}
              </button>
            )
          })}
        </div>
      )}

      {loading ? (
        <div className="h-72 bg-white/3 rounded-2xl animate-pulse" />
      ) : (
        <>
          <MonthGrid
            days={days}
            events={monthEvents}
            year={calYear}
            month={calMonth}
            todayStr={todayStr}
            selectedDay={selectedDay}
            onSelectDay={day => setSelectedDay(d => (d === day ? null : day))}
            onPrev={() => changeMonth(-1)}
            onNext={() => changeMonth(1)}
          />

          {/* Surface legend */}
          <div className="mt-3 mb-6 flex flex-wrap gap-4 items-center">
            {['gravel', 'tarmac', 'road_rally'].map(key => {
              const s = SURFACE[key]
              return (
                <span key={key} className="flex items-center gap-1.5 text-xs text-white/35">
                  <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                  {s.label}
                </span>
              )
            })}
          </div>

          {/* Rallies for the month (or the tapped day) */}
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-white/50 flex-shrink-0">
              {selectedDay
                ? new Date(selectedDay + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })
                : `${MONTHS[calMonth]} ${calYear}`}
            </span>
            <div className="flex-1 h-px bg-white/8" />
            {selectedDay && (
              <button onClick={() => setSelectedDay(null)} className="text-xs text-white/50 hover:text-white transition-colors flex-shrink-0">
                Show whole month
              </button>
            )}
          </div>

          {listEvents.length === 0 ? (
            <p className="text-white/35 text-sm py-6 text-center">No rallies {selectedDay ? 'on this day' : 'this month'}.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {listEvents.map(event => <ListCard key={event.id} event={event} isUpNext={event.id === nextEventId} />)}
            </div>
          )}
        </>
      )}
    </main>
  )
}

// ─── Compact month grid ─────────────────────────────────────────
function MonthGrid({ days, events, year, month, todayStr, selectedDay, onSelectDay, onPrev, onNext }) {
  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
      {/* Month nav */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/8">
        <button onClick={onPrev} aria-label="Previous month" className="w-9 h-9 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/8 transition-all">
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 010 1.06L7.06 8l2.72 2.72a.75.75 0 11-1.06 1.06L5.47 8.53a.75.75 0 010-1.06l3.25-3.25a.75.75 0 011.06 0z" />
          </svg>
        </button>
        <span className="text-white font-semibold text-sm">{MONTHS[month]} {year}</span>
        <button onClick={onNext} aria-label="Next month" className="w-9 h-9 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/8 transition-all">
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06L7.28 11.78a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z" />
          </svg>
        </button>
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
            const isToday = day === todayStr
            const isSelected = day === selectedDay
            const hasEvents = dayEvents.length > 0
            return (
              <button
                key={day}
                type="button"
                disabled={!hasEvents}
                onClick={() => onSelectDay(day)}
                className={`h-10 flex flex-col items-center justify-center gap-0.5 rounded-lg transition-all ${
                  isSelected ? 'bg-rl-accent/10 ring-1 ring-rl-accent/40' : hasEvents ? 'hover:bg-white/8' : ''
                }`}
              >
                <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs ${
                  isToday ? 'bg-rl-accent text-white font-semibold'
                  : hasEvents ? 'text-white font-semibold'
                  : 'text-white/35'
                }`}>
                  {Number(day.slice(8))}
                </span>
                <span className="flex gap-0.5 h-1.5">
                  {dayEvents.slice(0, 3).map(e => (
                    <span
                      key={e.id}
                      className={`w-1.5 h-1.5 rounded-full ${(SURFACE[e.surface] || SURFACE.mixed).dot} ${e.status === 'cancelled' ? 'opacity-30' : ''}`}
                    />
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

function ListCard({ event, isUpNext }) {
  const surf = SURFACE[event.surface] || SURFACE.mixed
  const isCancelled = event.status === 'cancelled'
  const isRallyGo = !!event.rally_id
  const isUnlocked = isRallyGo && !!getStoredCode(event.rally_id)
  const card = (
    <div className={`relative h-full rounded-xl border overflow-hidden transition-all duration-150 ${
      isCancelled ? 'border-white/5 bg-white/2 opacity-45'
      : isUpNext ? 'border-rl-accent/50 bg-rl-accent/6 ring-1 ring-rl-accent/20'
      : isRallyGo ? 'border-rl-accent/25 bg-rl-accent/4 hover:border-rl-accent/50 hover:bg-rl-accent/8 cursor-pointer'
      : 'border-white/8 bg-white/3 hover:border-white/18'
    }`}>
      <div className={`h-0.5 w-full opacity-70 ${surf.bg}`} />
      <div className="p-4">
        {isUpNext && (
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-rl-accent animate-pulse" />
            <span className="text-[10px] font-semibold text-rl-accent uppercase tracking-widest">Up next</span>
          </div>
        )}
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
            : isRallyGo ? <span className="flex-shrink-0 text-[10px] font-semibold text-rl-accent bg-rl-accent/10 border border-rl-accent/20 px-2 py-0.5 rounded-full">{isUnlocked ? 'Open ›' : 'Code required'}</span>
            : <span className="flex-shrink-0 text-[10px] font-medium text-white/40 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">Date only</span>}
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
  return <Link to={`/calendar/event/${event.id}`} className="block no-underline h-full">{card}</Link>
}
