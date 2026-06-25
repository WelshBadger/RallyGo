import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatDateRange } from '../lib/dateUtils'

function daysUntil(dateStr) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  const diff = Math.round((target - today) / (1000 * 60 * 60 * 24))
  if (diff < 0) return null
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return `${diff} days away`
}

export default function HomePage() {
  const [rallies, setRallies] = useState([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('rallies')
        .select('*')
        .eq('status', 'active')
        .order('date', { ascending: true })
      setRallies(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const featured = rallies[0] || null
  const rest = rallies.slice(1)

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 sm:py-12">

      {/* Hero */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-rl-accent animate-pulse" />
          <span className="text-rl-accent text-[11px] font-semibold uppercase tracking-widest">Live events</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-semibold text-white leading-tight mb-3">
          Your rally,<br />all in one place.
        </h1>
        <p className="text-white/40 text-sm max-w-md leading-relaxed">
          Official documents, bulletins, route information and results — everything you need for rally day.
        </p>
      </section>

      {loading ? (
        <div className="space-y-3">
          <div className="h-52 bg-white/5 rounded-2xl animate-pulse" />
          <div className="h-20 bg-white/5 rounded-xl animate-pulse" />
          <div className="h-20 bg-white/5 rounded-xl animate-pulse" />
        </div>
      ) : rallies.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-white/30 text-sm">No events currently active.</p>
          {!user && (
            <p className="text-white/20 text-xs mt-2">
              Are you an organiser?{' '}
              <Link to="/register" className="text-rl-accent">Create an account</Link> to publish your event.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Featured event */}
          {featured && <FeaturedCard rally={featured} />}

          {/* Remaining events */}
          {rest.map((rally) => (
            <RallyCard key={rally.id} rally={rally} />
          ))}
        </div>
      )}

      {/* Rally Logistics — subtle footer link */}
      {user && (
        <div className="mt-10 pt-6 border-t border-white/8 flex items-center justify-between">
          <p className="text-white/25 text-xs">Also by RallyGo</p>
          <a
            href="https://rally-logistics.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/40 hover:text-rl-accent text-xs transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.75 2h8.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0112.25 14h-8.5A1.75 1.75 0 012 12.25v-8.5C2 2.784 2.784 2 3.75 2zm0 1.5a.25.25 0 00-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25v-8.5a.25.25 0 00-.25-.25h-8.5z" />
            </svg>
            Rally Logistics →
          </a>
        </div>
      )}
    </main>
  )
}

function FeaturedCard({ rally }) {
  const isPast = new Date(rally.end_date || rally.date) < new Date()
  const countdown = daysUntil(rally.date)
  const stages = rally.regulations_data?.stages?.length || rally.regulations_data?.stageCount
  const distance = rally.regulations_data?.totalStageDistance

  return (
    <Link
      to={`/event/${rally.id}`}
      className="block rounded-2xl overflow-hidden border border-white/10 hover:border-white/25 transition-all no-underline group relative"
      style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f0f 100%)' }}
    >
      {/* Top accent line */}
      <div className="h-0.5 w-full bg-gradient-to-r from-rl-accent via-rl-accent/50 to-transparent" />

      <div className="p-5 sm:p-6">
        {/* Badges row */}
        <div className="flex items-center gap-2 mb-4">
          {!isPast && (
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-rl-accent bg-rl-accent/10 border border-rl-accent/20 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-rl-accent animate-pulse" />
              Live
            </span>
          )}
          {rally.series && (
            <span className="text-[10px] text-white/40 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">
              {rally.series}
            </span>
          )}
          {countdown && !isPast && (
            <span className="text-[10px] text-white/40 ml-auto">{countdown}</span>
          )}
        </div>

        {/* Event name */}
        <h2 className="text-white font-semibold text-2xl sm:text-3xl leading-tight mb-1">
          {rally.name}
        </h2>

        {/* Date + location */}
        <p className="text-white/45 text-sm mb-5">
          {formatDateRange(rally.date, rally.end_date)}
          {rally.location && <span className="text-white/25 mx-2">·</span>}
          {rally.location}
        </p>

        {/* Stats row */}
        {(stages || distance) && (
          <div className="flex items-center gap-4 mb-5">
            {stages && (
              <div className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-white/25" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h10M8 3l5 5-5 5" />
                </svg>
                <span className="text-white/50 text-xs">{stages} stages</span>
              </div>
            )}
            {distance && (
              <div className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-white/25" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <circle cx="8" cy="8" r="5" /><path strokeLinecap="round" d="M8 5v3l2 1" />
                </svg>
                <span className="text-white/50 text-xs">{distance}</span>
              </div>
            )}
          </div>
        )}

        {/* CTA */}
        <div className="flex items-center justify-between">
          <span className="text-white/30 text-xs">View documents, bulletins &amp; route</span>
          <span className="text-white text-sm font-medium group-hover:text-rl-accent transition-colors flex items-center gap-1.5">
            Open event
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.75a.75.75 0 010-1.5h7.44L8.22 4.03a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  )
}

function RallyCard({ rally }) {
  const isPast = new Date(rally.end_date || rally.date) < new Date()
  const countdown = daysUntil(rally.date)
  const stages = rally.regulations_data?.stages?.length || rally.regulations_data?.stageCount
  const distance = rally.regulations_data?.totalStageDistance

  return (
    <Link
      to={`/event/${rally.id}`}
      className="block bg-rl-card border border-white/10 rounded-xl px-4 py-4 sm:px-5 hover:border-white/25 transition-all no-underline group"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {!isPast && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-rl-accent">
                <span className="w-1.5 h-1.5 rounded-full bg-rl-accent animate-pulse" />
                Live
              </span>
            )}
            {rally.series && (
              <span className="text-white/30 text-xs">{rally.series}</span>
            )}
            {countdown && !isPast && (
              <span className="text-white/20 text-[10px] ml-auto">{countdown}</span>
            )}
          </div>
          <h2 className="text-white font-medium text-base leading-tight">{rally.name}</h2>
          <div className="flex items-center gap-3 mt-1 text-xs text-white/35 flex-wrap">
            <span>{formatDateRange(rally.date, rally.end_date)}</span>
            {rally.location && <span>{rally.location}</span>}
            {stages && <span>{stages} stages</span>}
            {distance && <span>{distance}</span>}
          </div>
        </div>
        <div className="text-white/25 group-hover:text-white/50 transition-colors flex-shrink-0">
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.75a.75.75 0 010-1.5h7.44L8.22 4.03a.75.75 0 010-1.06z" clipRule="evenodd" />
          </svg>
        </div>
      </div>
    </Link>
  )
}
