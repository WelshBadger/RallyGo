import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatDistanceToNow } from '../lib/dateUtils'

const SECTION_META = {
  'pre-event': { label: 'Pre-event info', color: '#E24B4A' },
  'route': { label: 'Route information', color: '#378ADD' },
  'bulletins': { label: 'Live bulletins & documents', color: '#E24B4A' },
  'team': { label: 'Organising team', color: '#1D9E75' },
  'accommodation': { label: 'Accommodation', color: '#7F77DD' },
  'results': { label: 'Live results', color: '#BA7517' },
}

export default function SectionPage() {
  const { rallyId, section } = useParams()
  const [docs, setDocs] = useState([])
  const [rally, setRally] = useState(null)
  const [loading, setLoading] = useState(true)
  const meta = SECTION_META[section] || { label: section, color: '#E24B4A' }

  useEffect(() => {
    async function load() {
      const [{ data: rallyData }, { data: documents }] = await Promise.all([
        supabase.from('rallies').select('*').eq('id', rallyId).single(),
        supabase
          .from('rally_documents')
          .select('*')
          .eq('rally_id', rallyId)
          .eq('section', section)
          .order('created_at', { ascending: false }),
      ])
      setRally(rallyData)
      setDocs(documents || [])
      setLoading(false)
    }
    load()

    // Subscribe to new documents in this section
    const channel = supabase
      .channel(`section-${rallyId}-${section}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'rally_documents',
        filter: `rally_id=eq.${rallyId}`,
      }, (payload) => {
        if (payload.new.section === section) {
          setDocs(prev => [payload.new, ...prev])
        }
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [rallyId, section])

  return (
    <main className="max-w-3xl mx-auto px-4 py-5 sm:py-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-white/30 mb-5">
        <Link to="/" className="hover:text-white/60 no-underline transition-colors">Events</Link>
        <span>/</span>
        <Link to={`/event/${rallyId}`} className="hover:text-white/60 no-underline transition-colors">{rally?.name}</Link>
        <span>/</span>
        <span className="text-white/60">{meta.label}</span>
      </div>

      {/* Section header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-7 rounded-full" style={{ background: meta.color }} />
        <h1 className="text-xl font-medium text-white">{meta.label}</h1>
      </div>

      {/* Pre-event: auto info from regulations */}
      {!loading && section === 'pre-event' && rally?.regulations_data && (
        <div className="mb-6 space-y-3">
          <p className="text-white/30 text-[11px] uppercase tracking-widest font-medium">From regulations</p>

          <div className="bg-rl-card border border-white/10 rounded-2xl divide-y divide-white/8">
            {rally.regulations_data.rallyHQ && (
              <div className="px-4 py-4">
                <p className="text-white/35 text-[11px] uppercase tracking-wide mb-1">Rally HQ</p>
                <p className="text-white text-sm leading-snug">{rally.regulations_data.rallyHQ}</p>
              </div>
            )}
            {rally.regulations_data.organiser?.club && (
              <div className="px-4 py-4">
                <p className="text-white/35 text-[11px] uppercase tracking-wide mb-1">Organising Club</p>
                <p className="text-white text-sm">{rally.regulations_data.organiser.club}</p>
              </div>
            )}
            {rally.regulations_data.organiser?.contact && (
              <div className="px-4 py-4">
                <p className="text-white/35 text-[11px] uppercase tracking-wide mb-1">Organiser Contact</p>
                <p className="text-white text-sm">{rally.regulations_data.organiser.contact}</p>
                {rally.regulations_data.organiser.phone && (
                  <a href={`tel:${rally.regulations_data.organiser.phone}`} className="text-rl-accent text-sm mt-0.5 block">{rally.regulations_data.organiser.phone}</a>
                )}
                {rally.regulations_data.organiser.email && (
                  <a href={`mailto:${rally.regulations_data.organiser.email}`} className="text-rl-accent text-xs mt-0.5 block">{rally.regulations_data.organiser.email}</a>
                )}
              </div>
            )}
            {rally.regulations_data.clerkOfCourse && (
              <div className="px-4 py-4">
                <p className="text-white/35 text-[11px] uppercase tracking-wide mb-1">Clerk of Course</p>
                <p className="text-white text-sm">{rally.regulations_data.clerkOfCourse}</p>
              </div>
            )}
            {rally.regulations_data.reconDate && (
              <div className="px-4 py-4">
                <p className="text-white/35 text-[11px] uppercase tracking-wide mb-1">Reconnaissance</p>
                <p className="text-white text-sm">{rally.regulations_data.reconDate}</p>
              </div>
            )}
            {rally.regulations_data.entryFeesSummary && (
              <div className="px-4 py-4">
                <p className="text-white/35 text-[11px] uppercase tracking-wide mb-1">Entry Fees</p>
                <p className="text-white text-sm">{rally.regulations_data.entryFeesSummary}</p>
              </div>
            )}
            {rally.regulations_data.vehicleClasses && (
              <div className="px-4 py-4">
                <p className="text-white/35 text-[11px] uppercase tracking-wide mb-1">Vehicle Classes</p>
                <p className="text-white text-sm">{rally.regulations_data.vehicleClasses}</p>
              </div>
            )}
          </div>

          {rally.regulations_pdf_url && (
            <a
              href={rally.regulations_pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 bg-rl-card border border-white/10 rounded-xl px-4 py-3.5 hover:border-white/25 transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-white text-sm font-medium">Supplementary Regulations</p>
                <p className="text-white/35 text-xs mt-0.5">Full regulations PDF</p>
              </div>
              <svg className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors" viewBox="0 0 16 16" fill="currentColor">
                <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.75a.75.75 0 010-1.5h7.44L8.22 4.03a.75.75 0 010-1.06z" clipRule="evenodd" />
              </svg>
            </a>
          )}
        </div>
      )}

      {/* Team: officials from regulations */}
      {!loading && section === 'team' && rally?.regulations_data && (
        <div className="mb-6">
          <p className="text-white/30 text-[11px] uppercase tracking-widest font-medium mb-3">From regulations</p>
          <div className="bg-rl-card border border-white/10 rounded-2xl divide-y divide-white/8">
            {rally.regulations_data.organiser?.club && (
              <div className="px-4 py-4">
                <p className="text-white/35 text-[11px] uppercase tracking-wide mb-1">Organising Club</p>
                <p className="text-white text-sm">{rally.regulations_data.organiser.club}</p>
              </div>
            )}
            {rally.regulations_data.clerkOfCourse && (
              <div className="px-4 py-4">
                <p className="text-white/35 text-[11px] uppercase tracking-wide mb-1">Clerk of Course</p>
                <p className="text-white text-sm">{rally.regulations_data.clerkOfCourse}</p>
              </div>
            )}
            {rally.regulations_data.safetyDelegate && (
              <div className="px-4 py-4">
                <p className="text-white/35 text-[11px] uppercase tracking-wide mb-1">Safety Delegate</p>
                <p className="text-white text-sm">{rally.regulations_data.safetyDelegate}</p>
              </div>
            )}
            {rally.regulations_data.organiser?.contact && (
              <div className="px-4 py-4">
                <p className="text-white/35 text-[11px] uppercase tracking-wide mb-1">Organiser Contact</p>
                <p className="text-white text-sm">{rally.regulations_data.organiser.contact}</p>
                {rally.regulations_data.organiser.phone && (
                  <a href={`tel:${rally.regulations_data.organiser.phone}`} className="text-rl-accent text-sm mt-0.5 block">{rally.regulations_data.organiser.phone}</a>
                )}
                {rally.regulations_data.organiser.email && (
                  <a href={`mailto:${rally.regulations_data.organiser.email}`} className="text-rl-accent text-xs mt-0.5 block">{rally.regulations_data.organiser.email}</a>
                )}
              </div>
            )}
            {rally.regulations_data.keyOfficials?.map((official, i) => (
              <div key={i} className="px-4 py-4">
                <p className="text-white/35 text-[11px] uppercase tracking-wide mb-1">{official.role}</p>
                <p className="text-white text-sm">{official.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Route: stage list from regulations */}
      {!loading && section === 'route' && rally?.regulations_data?.stages?.length > 0 && (
        <div className="mb-6">
          <p className="text-white/30 text-[11px] uppercase tracking-widest font-medium mb-3">Stage list</p>
          <div className="bg-rl-card border border-white/10 rounded-xl overflow-hidden">
            <div className="divide-y divide-white/5">
              {rally.regulations_data.stages.map((stage, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-white/25 text-xs w-5 text-right">{stage.number}</span>
                    <span className="text-white text-sm">{stage.name}</span>
                  </div>
                  <span className="text-white/45 text-xs">{stage.distance}</span>
                </div>
              ))}
            </div>
            <div className="px-4 py-2.5 border-t border-white/8 flex justify-between">
              <span className="text-white/35 text-xs">Total</span>
              <span className="text-white/35 text-xs">{rally.regulations_data.totalStageDistance}</span>
            </div>
          </div>
        </div>
      )}

      {/* Documents */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />)}
        </div>
      ) : docs.length === 0 && section !== 'pre-event' && section !== 'route' && section !== 'team' ? (
        <div className="text-center py-12">
          <p className="text-white/30 text-sm">Nothing posted in this section yet.</p>
        </div>
      ) : docs.length === 0 && (section === 'pre-event' || section === 'route' || section === 'team') && !rally?.regulations_data ? (
        <div className="text-center py-12">
          <p className="text-white/30 text-sm">Nothing posted in this section yet.</p>
        </div>
      ) : docs.length > 0 ? (
        <div className="space-y-2">
          {docs.map((doc) => (
            <DocumentItem key={doc.id} doc={doc} />
          ))}
        </div>
      ) : null}
    </main>
  )
}

function DocumentItem({ doc }) {
  function handleOpen() {
    if (doc.file_url) window.open(doc.file_url, '_blank', 'noopener,noreferrer')
    else if (doc.link_url) window.open(doc.link_url, '_blank', 'noopener,noreferrer')
  }

  const hasLink = doc.file_url || doc.link_url
  const Wrapper = hasLink ? 'button' : 'div'

  return (
    <Wrapper
      onClick={hasLink ? handleOpen : undefined}
      className={`w-full text-left flex items-center gap-3 bg-rl-card border border-white/10 rounded-xl px-4 py-3.5 transition-all ${hasLink ? 'hover:border-white/25 cursor-pointer group' : ''}`}
    >
      {/* File type icon */}
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${doc.is_urgent ? 'bg-red-500/15' : 'bg-white/5'}`}>
        {doc.file_type === 'pdf' ? (
          <svg className="w-4 h-4 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        ) : doc.file_type === 'link' ? (
          <svg className="w-4 h-4 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{doc.title}</p>
        <p className="text-white/35 text-xs mt-0.5">{formatDistanceToNow(doc.created_at)}</p>
      </div>

      {/* Badges & arrow */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {doc.is_urgent && (
          <span className="text-[10px] bg-red-500/15 text-rl-accent px-2 py-0.5 rounded-full font-medium">Urgent</span>
        )}
        {hasLink && (
          <svg className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.75a.75.75 0 010-1.5h7.44L8.22 4.03a.75.75 0 010-1.06z" clipRule="evenodd" />
          </svg>
        )}
      </div>
    </Wrapper>
  )
}
