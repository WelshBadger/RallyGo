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
          <h2 className="font-medium text-base leading-tight text-white">{r.name}</h2>
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
      .then(({ data, error }) => {
        if (!error && data) setRallies(data)
        setLoading(false)
      })
  }, [])

  const upcoming = rallies.filter(r => (r.end_date || r.date) >= today)
  const past = rallies.filter(r => (r.end_date || r.date) < today)
  const next = upcoming[0]

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/10 border-t-rl-accent rounded-full animate-spin" />
      </main>
    )
  }

  if (rallies.length === 0) {
    return (
      <main className="max-w-lg mx-auto px-4 py-24 text-center">
        <p className="text-white/20 text-5xl mb-4">🏁</p>
        <h1 className="text-white text-xl font-semibold mb-2">No events yet</h1>
        <p className="text-white/40 text-sm">Events will appear here once they're added.</p>
      </main>
    )
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-white font-semibold text-lg mb-5">Your events</h1>

      {upcoming.length > 0 && (
        <>
          {past.length > 0 && <SectionLabel label="Upcoming" />}
          <div className="space-y-2">
            {upcoming.map(r => <RallyCard key={r.id} r={r} highlight={r.id === next?.id} />)}
          </div>
        </>
      )}

      {past.length > 0 && (
        <>
          <SectionLabel label="Past" />
          <div className="space-y-2 opacity-60">
            {past.map(r => <RallyCard key={r.id} r={r} highlight={false} />)}
          </div>
        </>
      )}
    </main>
  )
}
