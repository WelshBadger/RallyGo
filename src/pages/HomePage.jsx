import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatDateRange } from '../lib/dateUtils'

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0)
  const diff = Math.round((target - today) / (1000 * 60 * 60 * 24))
  if (diff < 0) return null
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return `${diff} days away`
}

function fmtDate(str) {
  return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function HomePage() {
  const [news, setNews]             = useState([])
  const [rallies, setRallies]       = useState([])
  const [showNews, setShowNews]     = useState(true)
  const [loading, setLoading]       = useState(true)
  const { user } = useAuth()

  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().split('T')[0]
      const [{ data: newsData }, { data: rallyData }, { data: settings }] = await Promise.all([
        supabase.from('news_posts').select('*').eq('status', 'published').order('published_at', { ascending: false }).limit(1),
        supabase.from('rallies').select('*').eq('status', 'active')
          .or(`end_date.gte.${today},and(end_date.is.null,date.gte.${today})`)
          .order('date', { ascending: true }).limit(3),
        supabase.from('site_settings').select('show_news_on_homepage').eq('id', 1).single(),
      ])
      setNews(newsData || [])
      setRallies(rallyData || [])
      if (settings) setShowNews(settings.show_news_on_homepage)
      setLoading(false)
    }
    load()
  }, [])

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 sm:py-12 space-y-14">

      {/* ── How it works ── */}
      <section>
        <div className="text-center mb-8">
          <p className="text-rl-accent text-[11px] font-semibold uppercase tracking-widest mb-2">How it works</p>
          <h2 className="text-white text-2xl sm:text-3xl font-semibold">Everything you need, one place</h2>
          <p className="text-white/40 text-sm mt-2">From the start list to the service park — RallyGo keeps your team connected and informed.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {[
            {
              n: '01', label: 'Create an account', desc: 'Sign up free in seconds — no app store needed.',
              color: '#3b82f6',
              icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
            },
            {
              n: '02', label: 'Browse the calendar', desc: 'Find every UK rally — gravel, tarmac, road.',
              color: '#f59e0b',
              icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
            },
            {
              n: '03', label: 'Access live documents', desc: 'Regulations, bulletins, entry lists — always up to date.',
              color: '#E24B4A',
              icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
            },
            {
              n: '04', label: 'Plan with your team', desc: 'Fuel stops, recce notes, schedules — offline too.',
              color: '#22c55e',
              icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
            },
          ].map(step => (
            <div key={step.n} className="rounded-2xl border p-4 sm:p-5 flex flex-col gap-3"
              style={{ background: step.color + '12', borderColor: step.color + '30' }}>
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: step.color + '20', color: step.color }}>
                  {step.icon}
                </div>
                <span className="text-[11px] font-bold tabular-nums" style={{ color: step.color + 'aa' }}>{step.n}</span>
              </div>
              <div>
                <p className="text-white font-semibold text-sm leading-tight mb-1">{step.label}</p>
                <p className="text-white/45 text-xs leading-snug">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link to="/calendar" className="rl-btn-primary text-sm px-6 py-2.5 no-underline">View calendar</Link>
          {!user && <Link to="/register" className="rl-btn-ghost text-sm px-6 py-2.5 no-underline">Create free account</Link>}
        </div>
      </section>

      {/* ── News section ── */}
      {showNews && <section>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-rl-accent animate-pulse" />
            <span className="text-rl-accent text-[11px] font-semibold uppercase tracking-widest">Latest news</span>
          </div>
          <Link to="/news" className="text-white/40 hover:text-white text-xs transition-colors no-underline">All posts →</Link>
        </div>

        {loading ? (
          <div className="h-32 bg-white/5 rounded-2xl animate-pulse" />
        ) : news.length === 0 ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
            <p className="text-white/30 text-sm">No news yet — check back soon.</p>
          </div>
        ) : (
          <NewsCard post={news[0]} featured />
        )}
      </section>}

      {/* ── Next rallies ── */}
      {rallies.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-rl-accent animate-pulse" />
            <span className="text-rl-accent text-[11px] font-semibold uppercase tracking-widest">Next rallies</span>
          </div>
          <div className="space-y-3">
            {rallies.map((rally, i) =>
              i === 0 ? <FeaturedCard key={rally.id} rally={rally} /> : <RallyCard key={rally.id} rally={rally} />
            )}
          </div>
        </section>
      )}

    </main>
  )
}

function NewsCard({ post, featured }) {
  const date = post.published_at ? fmtDate(post.published_at) : ''

  if (featured) {
    return (
      <Link to="/news" className="block bg-white/3 border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-all no-underline">
        {post.image_url ? (
          <img src={post.image_url} alt={post.title} className="w-full h-52 sm:h-64 object-contain bg-black/20" />
        ) : (
          <div className="h-0.5 w-full bg-gradient-to-r from-rl-accent via-rl-accent/50 to-transparent" />
        )}
        <div className="p-6">
          {date && <p className="text-white/30 text-xs mb-3">{date}</p>}
          <h2 className="text-white font-semibold text-xl sm:text-2xl leading-snug mb-2">{post.title}</h2>
          {post.excerpt && <p className="text-white/45 text-sm leading-relaxed mb-4">{post.excerpt}</p>}
          <p className="text-white/35 text-sm leading-relaxed line-clamp-3">{post.body}</p>
        </div>
      </Link>
    )
  }

  return (
    <Link to={`/news/${post.id}`} className="block bg-white/3 border border-white/8 rounded-xl overflow-hidden hover:border-white/18 transition-all no-underline">
      <div className="flex items-stretch gap-0">
        {post.image_url && (
          <img src={post.image_url} alt={post.title} className="w-24 sm:w-32 object-contain bg-black/20 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0 px-5 py-4">
          {date && <p className="text-white/25 text-xs mb-1">{date}</p>}
          <h3 className="text-white font-medium text-sm leading-snug">{post.title}</h3>
          {post.excerpt && <p className="text-white/40 text-xs mt-1 line-clamp-2">{post.excerpt}</p>}
        </div>
      </div>
    </Link>
  )
}

function FeaturedCard({ rally }) {
  const countdown = daysUntil(rally.date)
  const stages = rally.regulations_data?.stages?.length || rally.regulations_data?.stageCount
  const distance = rally.regulations_data?.totalStageDistance

  return (
    <Link
      to={`/event/${rally.id}`}
      className="block rounded-2xl overflow-hidden border border-white/10 hover:border-white/25 transition-all no-underline group relative"
      style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f0f 100%)' }}
    >
      <div className="h-0.5 w-full bg-gradient-to-r from-rl-accent via-rl-accent/50 to-transparent" />
      <div className="p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          {rally.series && <span className="text-[10px] text-white/40 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">{rally.series}</span>}
          {countdown && <span className="text-[10px] text-white/40 ml-auto">{countdown}</span>}
        </div>
        <h2 className="text-white font-semibold text-2xl sm:text-3xl leading-tight mb-1">{rally.name}</h2>
        <p className="text-white/45 text-sm mb-5">
          {formatDateRange(rally.date, rally.end_date)}
          {rally.location && <><span className="text-white/25 mx-2">·</span>{rally.location}</>}
        </p>
        {(stages || distance) && (
          <div className="flex items-center gap-4 mb-5">
            {stages && <span className="text-white/50 text-xs">→ {stages} stages</span>}
            {distance && <span className="text-white/50 text-xs">⏱ {distance}</span>}
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="hidden sm:block text-white/30 text-xs">View documents, bulletins &amp; route</span>
          <span className="text-white text-sm font-medium group-hover:text-rl-accent transition-colors flex items-center gap-1.5 ml-auto">
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
  const countdown = daysUntil(rally.date)
  const stages = rally.regulations_data?.stages?.length || rally.regulations_data?.stageCount

  return (
    <Link to={`/event/${rally.id}`} className="block bg-rl-card border border-white/10 rounded-xl px-4 py-4 sm:px-5 hover:border-white/25 transition-all no-underline group">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {rally.series && <span className="text-white/30 text-xs">{rally.series}</span>}
            {countdown && <span className="text-white/20 text-[10px] ml-auto">{countdown}</span>}
          </div>
          <h2 className="text-white font-medium text-base leading-tight">{rally.name}</h2>
          <div className="flex items-center gap-3 mt-1 text-xs text-white/35 flex-wrap">
            <span>{formatDateRange(rally.date, rally.end_date)}</span>
            {rally.location && <span>{rally.location}</span>}
            {stages && <span>{stages} stages</span>}
          </div>
        </div>
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-white/25 group-hover:text-white/50 transition-colors flex-shrink-0">
          <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.75a.75.75 0 010-1.5h7.44L8.22 4.03a.75.75 0 010-1.06z" clipRule="evenodd" />
        </svg>
      </div>
    </Link>
  )
}
