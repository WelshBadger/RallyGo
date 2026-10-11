import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { LOGISTICS_URL } from '../lib/config'

const Arrow = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 17L17 7M8 7h9v9" />
  </svg>
)

const Back = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
    <path fillRule="evenodd" d="M7.78 12.53a.75.75 0 01-1.06 0L2.47 8.28a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 1.06L4.81 7h7.44a.75.75 0 010 1.5H4.81l2.97 2.97a.75.75 0 010 1.06z" clipRule="evenodd" />
  </svg>
)

export default function CompetitorPage() {
  const [showNews, setShowNews] = useState(false)

  useEffect(() => {
    supabase.from('site_settings').select('show_news_on_homepage').eq('id', 1).single()
      .then(({ data }) => setShowNews(!!data?.show_news_on_homepage))
  }, [])

  return (
    <main>
      {/* Lands on the orange you just tapped, so it reads as the next step in one journey */}
      <div className="hero-orange">
        <Link to="/" className="back"><Back /> Back</Link>
        <h1 className="display">Competitor</h1>
        <p>Find a rally, or open your crew's pack.</p>
      </div>

      <div className="row-stack">
        <Link to="/calendar" className="row-slab">
          <p className="display">Rally info</p>
          <p>The rally calendar and official event information. Open a rally with the code from its organisers.</p>
          <span className="slab-go"><Arrow /></span>
        </Link>
        <a href={LOGISTICS_URL} className="row-slab">
          <p className="display">Rally logistics</p>
          <p>Your crew's pack: fuel, recce, schedule, set-up and team chat. Sign in to open a rally.</p>
          <span className="slab-go"><Arrow /></span>
        </a>
      </div>

      {showNews && (
        <Link to="/news" className="inline-block m-6 text-sm font-semibold no-underline" style={{ color: '#2b2b2b' }}>
          Latest news
        </Link>
      )}
    </main>
  )
}
