import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatDateRange } from '../lib/dateUtils'

const SURFACE = {
  gravel:      { bg: 'bg-amber-500',  light: 'bg-amber-500/15',  border: 'border-amber-500/40',  text: 'text-amber-300',  dot: 'bg-amber-400',  label: 'Gravel' },
  tarmac:      { bg: 'bg-blue-500',   light: 'bg-blue-500/15',   border: 'border-blue-500/40',   text: 'text-blue-300',   dot: 'bg-blue-400',   label: 'Tarmac' },
  closed_road: { bg: 'bg-violet-500', light: 'bg-violet-500/15', border: 'border-violet-500/40', text: 'text-violet-300', dot: 'bg-violet-400', label: 'Closed Road' },
  mixed:       { bg: 'bg-white/30',   light: 'bg-white/5',       border: 'border-white/20',      text: 'text-white/50',   dot: 'bg-white/40',   label: 'Mixed' },
}

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0)
  const target = new Date(dateStr); target.setHours(0,0,0,0)
  const diff = Math.round((target - today) / 86400000)
  if (diff < 0) return null
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return `${diff} days away`
}

export default function CalendarEventPage() {
  const { id } = useParams()
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('calendar_events')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => { setEvent(data); setLoading(false) })
  }, [id])

  if (loading) return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <div className="h-64 bg-white/5 rounded-2xl animate-pulse" />
    </main>
  )

  if (!event) return (
    <main className="max-w-2xl mx-auto px-4 py-10 text-center">
      <p className="text-white/40">Event not found.</p>
      <Link to="/calendar" className="text-rl-accent text-sm mt-4 inline-block">← Back to calendar</Link>
    </main>
  )

  const surf = SURFACE[event.surface] || SURFACE.mixed
  const isCancelled = event.status === 'cancelled'
  const isProvisional = event.status === 'provisional'
  const isRallyGo = !!event.rally_id
  const countdown = daysUntil(event.date)

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 sm:py-12">

      {/* Back */}
      <Link to="/calendar" className="inline-flex items-center gap-1.5 text-white/40 hover:text-white text-sm mb-8 no-underline transition-colors">
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
          <path fillRule="evenodd" d="M7.78 4.22a.75.75 0 010 1.06L5.06 8l2.72 2.72a.75.75 0 11-1.06 1.06L3.47 8.53a.75.75 0 010-1.06l3.25-3.25a.75.75 0 011.06 0z" />
        </svg>
        Calendar
      </Link>

      {/* Card */}
      <div className="bg-white/3 border border-white/10 rounded-2xl overflow-hidden">
        {/* Surface bar */}
        <div className={`h-1 w-full ${surf.bg} opacity-80`} />

        <div className="p-6 sm:p-8">
          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border ${surf.light} ${surf.text} ${surf.border}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${surf.dot}`} />
              {surf.label}
            </span>
            {event.series?.filter(Boolean).map(s => (
              <span key={s} className="text-[11px] text-white/40 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">{s}</span>
            ))}
            {isCancelled && (
              <span className="text-[11px] font-semibold text-red-400 bg-red-400/10 border border-red-400/20 px-2.5 py-1 rounded-full">Cancelled</span>
            )}
            {isProvisional && (
              <span className="text-[11px] font-semibold text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-2.5 py-1 rounded-full">Provisional</span>
            )}
            {countdown && !isCancelled && (
              <span className="text-[11px] text-white/30 ml-auto">{countdown}</span>
            )}
          </div>

          {/* Title */}
          <h1 className={`text-2xl sm:text-3xl font-semibold leading-tight mb-2 ${isCancelled ? 'line-through text-white/30' : 'text-white'}`}>
            {event.name}
          </h1>

          {/* Date + location */}
          <p className="text-white/45 text-base mb-8">
            {formatDateRange(event.date, event.end_date)}
            {event.location && <><span className="text-white/20 mx-2">·</span>{event.location}</>}
          </p>

          {/* CTA row */}
          <div className="flex flex-col sm:flex-row gap-3">
            {isRallyGo && !isCancelled && (
              <Link
                to={`/event/${event.rally_id}`}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-rl-accent text-white text-sm font-medium no-underline hover:bg-rl-accent/90 transition-all"
              >
                Open on RallyGo
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.75a.75.75 0 010-1.5h7.44L8.22 4.03a.75.75 0 010-1.06z" clipRule="evenodd" />
                </svg>
              </Link>
            )}
            {event.external_url && (
              <a
                href={event.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-white/15 text-white/60 text-sm no-underline hover:border-white/30 hover:text-white transition-all ${isRallyGo ? '' : 'bg-white/3'}`}
              >
                More info
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M6.22 8.72a.75.75 0 001.06 1.06l5.22-5.22v1.69a.75.75 0 001.5 0v-3.5a.75.75 0 00-.75-.75h-3.5a.75.75 0 000 1.5h1.69L6.22 8.72z"/>
                  <path d="M3.5 6.75a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h6a.75.75 0 000-1.5H3.5v-5.25z"/>
                </svg>
              </a>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
