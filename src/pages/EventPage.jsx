import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import TileGrid from '../components/TileGrid'
import BulletinFeed from '../components/BulletinFeed'
import { formatDateRange } from '../lib/dateUtils'

export default function EventPage() {
  const { rallyId } = useParams()
  const [rally, setRally] = useState(null)
  const [loading, setLoading] = useState(true)
  const [newCounts, setNewCounts] = useState({})
  const { isOrganiser, user } = useAuth()

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('rallies')
        .select('*')
        .eq('id', rallyId)
        .single()
      setRally(data)
      setLoading(false)
    }

    async function loadNewCounts() {
      // Get counts of documents posted in last 24h per section
      const since = new Date(Date.now() - 86400000).toISOString()
      const { data } = await supabase
        .from('rally_documents')
        .select('section')
        .eq('rally_id', rallyId)
        .gte('created_at', since)
      if (data) {
        const counts = data.reduce((acc, doc) => {
          acc[doc.section] = (acc[doc.section] || 0) + 1
          return acc
        }, {})
        setNewCounts(counts)
      }
    }

    load()
    loadNewCounts()
  }, [rallyId])

  if (loading) return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="h-32 bg-white/5 rounded-xl animate-pulse mb-4" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[...Array(6)].map((_, i) => <div key={i} className="h-28 bg-white/5 rounded-xl animate-pulse" />)}
      </div>
    </div>
  )

  if (!rally) return (
    <div className="max-w-4xl mx-auto px-4 py-8 text-center">
      <p className="text-white/40">Event not found.</p>
      <Link to="/" className="text-rl-accent text-sm mt-2 inline-block">← Back to events</Link>
    </div>
  )

  const isPast = new Date(rally.end_date || rally.date) < new Date()

  return (
    <main className="max-w-4xl mx-auto px-4 py-0">
      {/* Dark event header */}
      <div className="bg-[#111] -mx-4 px-4 sm:px-6 pt-6 pb-0 mb-6 sm:rounded-b-2xl border-b border-white/8">
        {/* Back */}
        <Link to="/" className="text-white/30 hover:text-white/60 text-xs flex items-center gap-1 mb-4 no-underline transition-colors">
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M7.78 12.53a.75.75 0 01-1.06 0L2.47 8.28a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 1.06L4.81 7h7.44a.75.75 0 010 1.5H4.81l2.97 2.97a.75.75 0 010 1.06z" clipRule="evenodd" />
          </svg>
          All events
        </Link>

        {/* Meta */}
        <div className="flex items-center gap-2 mb-2">
          {!isPast && (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-rl-accent bg-rl-accent/10 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-rl-accent animate-pulse" />
              Live event
            </span>
          )}
          {rally.series && (
            <span className="text-white/35 text-xs">{rally.series}</span>
          )}
        </div>

        {/* Name */}
        <h1 className="text-2xl sm:text-3xl font-medium text-white mb-2">{rally.name}</h1>

        {/* Date & location */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-white/45 text-sm mb-5">
          <span>{formatDateRange(rally.date, rally.end_date)}</span>
          <span>{rally.location}</span>
        </div>

        {/* Organiser controls */}
        {isOrganiser && (
          <div className="pb-4 border-b border-white/8 mb-1">
            <Link to={`/organiser/event/${rallyId}`} className="rl-btn-primary text-xs inline-block">
              Manage event →
            </Link>
          </div>
        )}

        {/* Rally website */}
        {rally.website_url && (
          <div className="flex items-center justify-between py-3 border-t border-white/8">
            <span className="text-white/40 text-xs">Official rally website</span>
            <a href={rally.website_url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-white/60 hover:text-white transition-colors font-medium">
              Visit website →
            </a>
          </div>
        )}

        {/* Rally Logistics button for logged-in users */}
        {user && (
          <div className="flex items-center justify-between py-3 border-t border-white/8">
            <span className="text-white/40 text-xs">Team logistics platform</span>
            <a
              href="https://rally-logistics-ea6p2dltn-carls-projects-0baeff4c.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-rl-accent hover:text-white transition-colors font-medium"
            >
              Open Rally Logistics →
            </a>
          </div>
        )}
      </div>

      {/* Login prompt for non-logged-in users */}
      {!user && (
        <div className="mb-6 bg-rl-card border border-rl-accent/30 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-white font-medium text-sm mb-0.5">Sign in to access event documents</p>
            <p className="text-white/45 text-xs">View route files, bulletins, results and more.</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Link to="/login" className="rl-btn-ghost text-xs px-4 py-2">Sign in</Link>
            <Link to="/register" className="rl-btn-primary text-xs px-4 py-2">Register</Link>
          </div>
        </div>
      )}

      {/* Regulations at a glance */}
      {rally.regulations_data && (
        <section className="mb-6">
          <p className="text-white/30 text-[11px] uppercase tracking-widest font-medium mb-3">Event at a glance</p>
          <div className="bg-rl-card border border-white/10 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-5">
            {rally.regulations_data.rallyHQ && (
              <div>
                <p className="text-white/35 text-[11px] uppercase tracking-wide mb-1">Rally HQ</p>
                <p className="text-white text-sm">{rally.regulations_data.rallyHQ}</p>
              </div>
            )}
            {rally.regulations_data.clerkOfCourse && (
              <div>
                <p className="text-white/35 text-[11px] uppercase tracking-wide mb-1">Clerk of Course</p>
                <p className="text-white text-sm">{rally.regulations_data.clerkOfCourse}</p>
              </div>
            )}
            {rally.series && (
              <div>
                <p className="text-white/35 text-[11px] uppercase tracking-wide mb-1">Championship</p>
                <p className="text-white text-sm">{rally.series}</p>
              </div>
            )}
            {rally.regulations_data.totalStageDistance && (
              <div>
                <p className="text-white/35 text-[11px] uppercase tracking-wide mb-1">Total Stage Distance</p>
                <p className="text-white text-sm">{rally.regulations_data.totalStageDistance}</p>
              </div>
            )}
            {rally.regulations_data.serviceArea && (
              <div>
                <p className="text-white/35 text-[11px] uppercase tracking-wide mb-1">Service Area</p>
                <p className="text-white text-sm">{rally.regulations_data.serviceArea}</p>
              </div>
            )}
            {rally.regulations_data.dates && (
              <div>
                <p className="text-white/35 text-[11px] uppercase tracking-wide mb-1">Dates</p>
                <p className="text-white text-sm">{rally.regulations_data.dates}</p>
              </div>
            )}
          </div>
{rally.regulations_pdf_url && (
            <a
              href={rally.regulations_pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 text-xs text-white/35 hover:text-rl-accent transition-colors inline-flex items-center gap-1"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z" />
              </svg>
              Download full regulations PDF
            </a>
          )}
        </section>
      )}

      {/* Section tiles */}
      <section className="mb-6">
        <p className="text-white/30 text-[11px] uppercase tracking-widest font-medium mb-3">Event sections</p>
        <TileGrid rallyId={rallyId} newCounts={newCounts} />
      </section>

      {/* Latest bulletins */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <p className="text-white/30 text-[11px] uppercase tracking-widest font-medium">Latest bulletins</p>
          <Link to={`/event/${rallyId}/bulletins`} className="text-white/40 hover:text-white text-xs transition-colors no-underline">
            View all →
          </Link>
        </div>
        <BulletinFeed rallyId={rallyId} limit={3} />
      </section>
    </main>
  )
}
