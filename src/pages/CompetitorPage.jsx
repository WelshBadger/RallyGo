import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { LOGISTICS_URL } from '../lib/config'
import BackButton from '../components/BackButton'
import ChoiceTile from '../components/ChoiceTile'

const iconProps = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75,
  strokeLinecap: 'round', strokeLinejoin: 'round', className: 'w-6 h-6',
}

export default function CompetitorPage() {
  const [showNews, setShowNews] = useState(false)

  useEffect(() => {
    supabase.from('site_settings').select('show_news_on_homepage').eq('id', 1).single()
      .then(({ data }) => setShowNews(!!data?.show_news_on_homepage))
  }, [])

  return (
    <main className="choice-slide max-w-2xl mx-auto px-4 py-8 sm:py-12">
      <div className="mb-5">
        <BackButton to="/" label="Back" />
      </div>

      {/* Banner so this feels like a new place, not a repeat of the opening screen */}
      <div
        className="relative overflow-hidden rounded-3xl border border-white/10 px-6 py-6 sm:px-8 sm:py-8 mb-5"
        style={{ background: 'linear-gradient(120deg, #378ADD40 0%, #222222 70%)' }}
      >
        <div className="choice-glow pointer-events-none absolute -top-20 -left-10 w-64 h-64 rounded-full blur-3xl" style={{ background: '#378ADD' }} />
        <div className="relative">
          <span className="inline-block rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white mb-3" style={{ background: '#378ADD' }}>
            Competitor
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight leading-tight mb-1">What do you need?</h1>
          <p className="text-white/55 text-sm">Find a rally, or open your crew's pack.</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <ChoiceTile
          layout="row"
          index={0}
          cta="View rallies"
          to="/calendar"
          color="#378ADD"
          label="Rally info"
          sub="Rally calendar and official event information. Open a rally with the code from its organisers."
          icon={
            <svg {...iconProps}>
              <rect x="3" y="4" width="18" height="17" rx="2" />
              <path d="M3 9h18M8 2v4M16 2v4" />
            </svg>
          }
        />
        <ChoiceTile
          layout="row"
          index={1}
          cta="Open pack"
          href={LOGISTICS_URL}
          color="#1D9E75"
          label="Rally logistics"
          sub="Your crew's pack: fuel, recce, schedule, set-up and team chat. Sign in to open a rally."
          icon={
            <svg {...iconProps}>
              <path d="M1 3h15v13H1z" />
              <path d="M16 8h4l3 3v5h-7z" />
              <circle cx="5.5" cy="18.5" r="2.5" />
              <circle cx="18.5" cy="18.5" r="2.5" />
            </svg>
          }
        />
      </div>

      {showNews && (
        <Link to="/news" className="inline-block mt-6 text-white/40 hover:text-white text-sm transition-colors no-underline">
          Latest news →
        </Link>
      )}
    </main>
  )
}
