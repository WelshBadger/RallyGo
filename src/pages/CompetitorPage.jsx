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
    <main className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
      <div className="mb-5">
        <BackButton to="/" label="Back" />
      </div>

      <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight mb-1">Competitor</h1>
      <p className="text-white/40 text-sm mb-7">What do you need?</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ChoiceTile
          to="/calendar"
          color="#E24B4A"
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
