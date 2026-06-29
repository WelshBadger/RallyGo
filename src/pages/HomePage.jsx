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
  const [news, setNews]       = useState([])
  const [rallies, setRallies] = useState([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  useEffect(() => {
    async function load() {
      const [{ data: newsData }, { data: rallyData }] = await Promise.all([
        supabase.from('news_posts').select('*').eq('status', 'published').order('published_at', { ascending: false }).limit(3),
        supabase.from('rallies').select('*').eq('status', 'active').order('date', { ascending: true }),
      ])
      setNews(newsData || [])
      setRallies(rallyData || [])
      setLoading(false)
    }
    load()
  }, [])

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 sm:py-12 space-y-14">

      {/* ── News section ── */}
      <section>
        <div className="flex items-center gap-2 mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-rl-accent animate-pulse" />
          <span className="text-rl-accent text-[11px] font-semibold uppercase tracking-widest">Latest news</span>
        </div>

        {loading ? (
          <div className="space-y-3">
            <div className="h-32 bg-white/5 rounded-2xl animate-pulse" />
            <div className="h-20 bg-white/5 rounded-xl animate-pulse" />
          </div>
        ) : news.length === 0 ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
            <p className="text-white/30 text-sm">No news yet — check back soon.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <NewsCard post={news[0]} featured />
            {news.slice(1).map(post => <NewsCard key={post.id} post={post} />)}
          </div>
        )}
      </section>

      {/* ── How it works ── */}
      <section>
        <div className="flex items-center gap-2 mb-6">
          <span className="text-white/30 text-[11px] font-semibold uppercase tracking-widest">How RallyGo works</span>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            {
              icon: (
                <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              ),
              title: 'Official documents',
              body: 'Regulations, final instructions and bulletins — all in one place, always up to date.',
            },
            {
              icon: (
                <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              ),
              title: 'Route & stages',
              body: 'Stage maps, road sections and service park info at your fingertips on the day.',
            },
            {
              icon: (
                <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              ),
              title: 'Full UK calendar',
              body: 'Every major rally in the 2026 season, colour-coded by surface with countdowns.',
            },
          ].map(item => (
            <div key={item.title} className="bg-white/3 border border-white/8 rounded-xl p-5">
              <div className="w-9 h-9 rounded-lg bg-rl-accent/10 border border-rl-accent/20 flex items-center justify-center text-rl-accent mb-4">
                {item.icon}
              </div>
              <h3 className="text-white font-medium text-sm mb-1.5">{item.title}</h3>
              <p className="text-white/40 text-xs leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Link to="/calendar" className="rl-btn-primary text-sm px-5 py-2.5 no-underline">View calendar</Link>
          {!user && <Link to="/register" className="rl-btn-ghost text-sm px-5 py-2.5 no-underline">Create account</Link>}
        </div>
      </section>

      {/* ── Active events ── */}
      {rallies.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-rl-accent animate-pulse" />
            <span className="text-rl-accent text-[11px] font-semibold uppercase tracking-widest">Live events</span>
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
      <div className="bg-white/3 border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-all">
        <div className="h-0.5 w-full bg-gradient-to-r from-rl-accent via-rl-accent/50 to-transparent" />
        <div className="p-6">
          {date && <p className="text-white/30 text-xs mb-3">{date}</p>}
          <h2 className="text-white font-semibold text-xl sm:text-2xl leading-snug mb-2">{post.title}</h2>
          {post.excerpt && <p className="text-white/45 text-sm leading-relaxed mb-4">{post.excerpt}</p>}
          <p className="text-white/35 text-sm leading-relaxed line-clamp-3">{post.body}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white/3 border border-white/8 rounded-xl px-5 py-4 hover:border-white/18 transition-all">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {date && <p className="text-white/25 text-xs mb-1">{date}</p>}
          <h3 className="text-white font-medium text-sm leading-snug">{post.title}</h3>
          {post.excerpt && <p className="text-white/40 text-xs mt-1 truncate">{post.excerpt}</p>}
        </div>
      </div>
    </div>
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
      <div className="h-0.5 w-full bg-gradient-to-r from-rl-accent via-rl-accent/50 to-transparent" />
      <div className="p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          {!isPast && (
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-rl-accent bg-rl-accent/10 border border-rl-accent/20 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-rl-accent animate-pulse" />Live
            </span>
          )}
          {rally.series && <span className="text-[10px] text-white/40 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">{rally.series}</span>}
          {countdown && !isPast && <span className="text-[10px] text-white/40 ml-auto">{countdown}</span>}
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
            <span className="flex items-center gap-1 text-[10px] font-semibold text-rl-accent">
              <span className="w-1.5 h-1.5 rounded-full bg-rl-accent animate-pulse" />Live
            </span>
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
