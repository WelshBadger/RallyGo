import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function fmt(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0)
  const target = new Date(dateStr); target.setHours(0,0,0,0)
  const diff = Math.round((target - today) / 86400000)
  if (diff < 0) return null
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return `${diff} days`
}

function RallyCard({ r, highlight }) {
  const countdown = daysUntil(r.date)
  return (
    <Link key={r.id} to={`/pack/${r.id}`}
      className={`block rounded-xl px-5 py-4 transition-all no-underline group border ${
        highlight
          ? 'bg-rl-accent/8 border-rl-accent/30 hover:border-rl-accent/55'
          : 'bg-rl-card border-white/10 hover:border-white/25'
      }`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          {r.series && <p className="text-white/30 text-[11px] mb-1">{r.series}</p>}
          <h2 className={`font-medium text-base leading-tight ${highlight ? 'text-white' : 'text-white'}`}>{r.name}</h2>
          <div className="flex items-center gap-3 mt-1 text-xs text-white/35 flex-wrap">
            <span>{fmt(r.date)}{r.end_date && r.end_date !== r.date ? ` – ${fmt(r.end_date)}` : ''}</span>
            {r.location && <span>{r.location}</span>}
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

function SectionLabel({ label }) {
  return (
    <div className="flex items-center gap-3 mb-3 mt-6 first:mt-0">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">{label}</span>
      <div className="flex-1 h-px bg-white/8" />
    </div>
  )
}

export default function RallySelectPage() {
  const [rallies, setRallies] = useState([])
  const [loading, setLoading] = useState(true)
  const today = useMemo(() => new Date().toISOString().split('T')[0], [])

  useEffect(() => {
    supabase.from('rallies').select('id,name,date,end_date,location,series,status')
      .in('status', ['active', 'draft'])
      .order('date', { ascending: true })
      .then(({ data }) => { setRallies(data || []); setLoading(false) })
  }, [])

  // Split into next event + everything else
  const { next, rest } = useMemo(() => {
    const endOf = r => r.end_date || r.date
    const future = rallies.filter(r => endOf(r) >= today)
    const past   = rallies.filter(r => endOf(r) < today)
    return {
      next: future[0] || null,
      // upcoming future events first, then past events reversed (most recent first)
      rest: [...future.slice(1), ...[...past].reverse()],
    }
  }, [rallies, today])

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4 mb-1">
          <h1 className="text-2xl font-semibold text-white">Your events</h1>
          <a
            href="https://rallygo-git-main-carls-projects-0baeff4c.vercel.app"
            className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors no-underline flex-shrink-0 mt-1"
          >
            RallyGo
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.75a.75.75 0 010-1.5h7.44L8.22 4.03a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
          </a>
        </div>
        <p className="text-white/40 text-sm">Select a rally to open your logistics pack.</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-white/5 rounded-xl animate-pulse" />)}
        </div>
      ) : rallies.length === 0 ? (
        <div className="text-center py-16 text-white/30 text-sm">No active events found.</div>
      ) : (
        <div>
          {/* Next event */}
          {next && (
            <>
              <SectionLabel label="Next event" />
              <RallyCard r={next} highlight />
            </>
          )}

          {/* All other events */}
          {rest.length > 0 && (
            <>
              <SectionLabel label="All events" />
              <div className="space-y-3">
                {rest.map(r => {
                  const endOf = r.end_date || r.date
                  const isPast = endOf < today
                  return (
                    <div key={r.id} className={isPast ? 'opacity-50' : ''}>
                      <RallyCard r={r} />
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </main>
  )
}
