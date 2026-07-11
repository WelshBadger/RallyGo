import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatDistanceToNow } from '../lib/dateUtils'
import BackButton from '../components/BackButton'

const SECTION_META = {
  'pre-event':  { label: 'Pre-event info',          color: '#E24B4A' },
  'route':      { label: 'Route information',        color: '#378ADD' },
  'bulletins':  { label: 'Live bulletins & documents', color: '#E24B4A' },
  'recce':      { label: 'Recce',                   color: '#10b981' },
  'team':       { label: 'Organising team',          color: '#1D9E75' },
  'accommodation': { label: 'Accommodation',         color: '#7F77DD' },
  'results':    { label: 'Live results',             color: '#BA7517' },
  'entry-list':  { label: 'Entry list',               color: '#0EA5A0' },
  'rally-guide': { label: 'Rally Guide',              color: '#f97316' },
}

export default function SectionPage() {
  const { rallyId, section } = useParams()
  const [docs, setDocs] = useState([])
  const [rally, setRally] = useState(null)
  const [loading, setLoading] = useState(true)
  const meta = SECTION_META[section] || { label: section, color: '#E24B4A' }

  useEffect(() => {
    // Mark this section as seen
    localStorage.setItem(`rallygo:seen:${rallyId}:${section}`, new Date().toISOString())

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
      {/* Back */}
      <div className="mb-5">
        <BackButton to={`/event/${rallyId}`} label={rally?.name || 'Event'} />
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

          {/* Final Instructions extracted info */}
          {rally.final_instructions_data && (
            <div className="bg-rl-card border border-white/10 rounded-2xl divide-y divide-white/8">
              {rally.final_instructions_data.signingOn?.length > 0 && (
                <div className="px-4 py-4">
                  <p className="text-white/35 text-[11px] uppercase tracking-wide mb-2">Signing On</p>
                  <div className="space-y-1">
                    {rally.final_instructions_data.signingOn.map((s, i) => (
                      <div key={i} className="flex flex-wrap gap-x-3 text-sm">
                        <span className="text-white font-medium">{s.day}</span>
                        <span className="text-white/60">{s.times}</span>
                        {s.location && <span className="text-white/40">{s.location}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {rally.final_instructions_data.scrutineering?.length > 0 && (
                <div className="px-4 py-4">
                  <p className="text-white/35 text-[11px] uppercase tracking-wide mb-2">Scrutineering</p>
                  <div className="space-y-1">
                    {rally.final_instructions_data.scrutineering.map((s, i) => (
                      <div key={i} className="flex flex-wrap gap-x-3 text-sm">
                        <span className="text-white font-medium">{s.day}</span>
                        <span className="text-white/60">{s.times}</span>
                        {s.location && <span className="text-white/40">{s.location}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {rally.final_instructions_data.noiseTesting?.limit && (
                <div className="px-4 py-4">
                  <p className="text-white/35 text-[11px] uppercase tracking-wide mb-1">Noise Limit</p>
                  <p className="text-white text-sm">{rally.final_instructions_data.noiseTesting.limit}
                    {rally.final_instructions_data.noiseTesting.method && <span className="text-white/45"> · {rally.final_instructions_data.noiseTesting.method}</span>}
                  </p>
                  {rally.final_instructions_data.noiseTesting.location && (
                    <p className="text-white/40 text-xs mt-0.5">{rally.final_instructions_data.noiseTesting.location}</p>
                  )}
                </div>
              )}
              {rally.final_instructions_data.serviceArea?.location && (
                <div className="px-4 py-4">
                  <p className="text-white/35 text-[11px] uppercase tracking-wide mb-1">Service Area</p>
                  <p className="text-white text-sm">{rally.final_instructions_data.serviceArea.location}</p>
                  {rally.final_instructions_data.serviceArea.notes && (
                    <p className="text-white/40 text-xs mt-0.5">{rally.final_instructions_data.serviceArea.notes}</p>
                  )}
                </div>
              )}
              {rally.final_instructions_data.importantNotes?.length > 0 && (
                <div className="px-4 py-4">
                  <p className="text-white/35 text-[11px] uppercase tracking-wide mb-2">Important Notes</p>
                  <ul className="space-y-1">
                    {rally.final_instructions_data.importantNotes.map((note, i) => (
                      <li key={i} className="text-white/70 text-sm flex gap-2"><span className="text-white/25 flex-shrink-0">·</span>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* PDF download links */}
          <div className="space-y-2">
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
            {rally.final_instructions_pdf_url && (
              <a
                href={rally.final_instructions_pdf_url}
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
                  <p className="text-white text-sm font-medium">Final Instructions</p>
                  <p className="text-white/35 text-xs mt-0.5">Full final instructions PDF</p>
                </div>
                <svg className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors" viewBox="0 0 16 16" fill="currentColor">
                  <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.75a.75.75 0 010-1.5h7.44L8.22 4.03a.75.75 0 010-1.06z" clipRule="evenodd" />
                </svg>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Recce: dates and rules from regulations */}
      {!loading && section === 'recce' && rally?.regulations_data && (
        (() => {
          const recce = rally.regulations_data.recce
          const reconDate = rally.regulations_data.reconDate
          const hasDates = recce?.dates?.length > 0
          const hasAny = hasDates || recce?.speedLimit || recce?.passes || recce?.notes || reconDate
          if (!hasAny) return null
          return (
            <div className="mb-6">
              <p className="text-white/30 text-[11px] uppercase tracking-widest font-medium mb-3">From regulations</p>
              <div className="bg-rl-card border border-white/10 rounded-2xl divide-y divide-white/8">
                {hasDates ? (
                  <div className="px-4 py-4">
                    <p className="text-white/35 text-[11px] uppercase tracking-wide mb-2">Recce sessions</p>
                    <div className="space-y-3">
                      {recce.dates.map((d, i) => (
                        <div key={i}>
                          <p className="text-white text-sm font-medium">{d.day}</p>
                          {d.times && <p className="text-white/60 text-sm">{d.times}</p>}
                          {d.startLocation && <p className="text-white/40 text-xs mt-0.5">{d.startLocation}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : reconDate ? (
                  <div className="px-4 py-4">
                    <p className="text-white/35 text-[11px] uppercase tracking-wide mb-1">Recce date</p>
                    <p className="text-white text-sm">{reconDate}</p>
                  </div>
                ) : null}
                {recce?.speedLimit && (
                  <div className="px-4 py-4">
                    <p className="text-white/35 text-[11px] uppercase tracking-wide mb-1">Speed limit</p>
                    <p className="text-white text-sm">{recce.speedLimit}</p>
                  </div>
                )}
                {recce?.passes && (
                  <div className="px-4 py-4">
                    <p className="text-white/35 text-[11px] uppercase tracking-wide mb-1">Passes allowed</p>
                    <p className="text-white text-sm">{recce.passes}</p>
                  </div>
                )}
                {recce?.notes && (
                  <div className="px-4 py-4">
                    <p className="text-white/35 text-[11px] uppercase tracking-wide mb-1">Notes</p>
                    <p className="text-white text-sm leading-relaxed">{recce.notes}</p>
                  </div>
                )}
              </div>
            </div>
          )
        })()
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

      {/* Route: schedule + stage tiles */}
      {!loading && section === 'route' && rally?.regulations_data && (
        <div className="mb-6 space-y-6">

          {/* Schedule */}
          {rally.regulations_data.schedule?.length > 0 && (
            <div>
              <p className="text-white/30 text-[11px] uppercase tracking-widest font-medium mb-3">Schedule</p>
              <div className="bg-rl-card border border-white/10 rounded-xl overflow-hidden">
                {Object.entries(
                  rally.regulations_data.schedule.reduce((groups, item) => {
                    const day = item.day || 'Event'
                    if (!groups[day]) groups[day] = []
                    groups[day].push(item)
                    return groups
                  }, {})
                ).map(([day, items], gi) => (
                  <div key={gi}>
                    <div className="px-4 py-2 bg-white/4 border-b border-white/8">
                      <p className="text-white/50 text-[11px] uppercase tracking-wider font-medium">{day}</p>
                    </div>
                    <div className="divide-y divide-white/5">
                      {items.map((item, i) => (
                        <div key={i} className="flex gap-4 px-4 py-3">
                          <span className="text-white/35 text-xs w-14 flex-shrink-0 pt-0.5">{item.time}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm leading-snug">{item.event}</p>
                            {item.location && (
                              <p className="text-white/35 text-xs mt-0.5">{item.location}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stage tiles */}
          {rally.regulations_data.stages?.length > 0 && (
            <div>
              <p className="text-white/30 text-[11px] uppercase tracking-widest font-medium mb-3">
                Stage list
                {rally.regulations_data.totalStageDistance && (
                  <span className="ml-2 normal-case text-white/20">{rally.regulations_data.totalStageDistance} total</span>
                )}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {rally.regulations_data.stages.map((stage) => {
                  const mapDoc = docs.find(d => d.stage_number === stage.number)
                  const Wrapper = mapDoc ? 'a' : 'div'
                  const wrapperProps = mapDoc
                    ? { href: mapDoc.file_url || mapDoc.link_url, target: '_blank', rel: 'noopener noreferrer' }
                    : {}
                  return (
                    <Wrapper
                      key={stage.number}
                      {...wrapperProps}
                      className={`group bg-rl-card border rounded-xl p-4 flex flex-col gap-2 no-underline transition-all ${
                        mapDoc
                          ? 'border-rl-accent/30 hover:border-rl-accent/60 cursor-pointer'
                          : 'border-white/10'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <span className="text-white/20 text-xs font-medium">SS{stage.number}</span>
                        {mapDoc ? (
                          <svg className="w-3.5 h-3.5 text-rl-accent" viewBox="0 0 16 16" fill="currentColor">
                            <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.75a.75.75 0 010-1.5h7.44L8.22 4.03a.75.75 0 010-1.06z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5 text-white/15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 2C5.24 2 3 4.24 3 7c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5zm0 6.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
                          </svg>
                        )}
                      </div>
                      <p className="text-white text-sm font-medium leading-snug">{stage.name}</p>
                      <div className="flex items-center justify-between mt-auto pt-1">
                        <span className="text-white/40 text-xs">{stage.distance}</span>
                        {mapDoc ? (
                          <span className="text-rl-accent text-[10px]">View map</span>
                        ) : (
                          <span className="text-white/20 text-[10px]">Map pending</span>
                        )}
                      </div>
                    </Wrapper>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Entry list */}
      {!loading && section === 'entry-list' && (
        <EntryListView entries={rally?.entry_list_data} docs={docs} />
      )}

      {/* Documents */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />)}
        </div>
      ) : docs.length === 0 && !['pre-event', 'route', 'team', 'entry-list'].includes(section) ? (
        <div className="text-center py-12">
          <p className="text-white/30 text-sm">Nothing posted in this section yet.</p>
        </div>
      ) : docs.length === 0 && ['pre-event', 'route', 'team'].includes(section) && !rally?.regulations_data ? (
        <div className="text-center py-12">
          <p className="text-white/30 text-sm">Nothing posted in this section yet.</p>
        </div>
      ) : docs.length === 0 && section === 'entry-list' && !rally?.entry_list_data ? (
        <div className="text-center py-12">
          <p className="text-white/30 text-sm">Entry list not yet published.</p>
        </div>
      ) : docs.length > 0 && section !== 'entry-list' ? (
        <div className="space-y-2">
          {docs.map((doc) => (
            <DocumentItem key={doc.id} doc={doc} />
          ))}
        </div>
      ) : null}
    </main>
  )
}

function EntryListView({ entries, docs }) {
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('All')

  const classes = useMemo(() => {
    if (!entries?.length) return []
    return ['All', ...Array.from(new Set(entries.map(e => e.class).filter(Boolean))).sort()]
  }, [entries])

  const filtered = useMemo(() => {
    if (!entries?.length) return []
    return entries.filter(e => {
      const q = search.toLowerCase()
      const matchSearch = !q || e.car?.toLowerCase().includes(q) || e.driver?.toLowerCase().includes(q) || e.codriver?.toLowerCase().includes(q) || e.vehicle?.toLowerCase().includes(q) || e.club?.toLowerCase().includes(q)
      const matchClass = classFilter === 'All' || e.class === classFilter
      return matchSearch && matchClass
    })
  }, [entries, search, classFilter])

  if (!entries?.length) return null

  return (
    <div className="mb-6 space-y-4">
      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M9.965 11.026a5 5 0 111.06-1.06l2.755 2.754a.75.75 0 11-1.06 1.06l-2.755-2.754zM10.5 7a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            placeholder="Search driver, car number, vehicle…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="rl-input pl-9 text-sm"
          />
        </div>
        {classes.length > 1 && (
          <select
            value={classFilter}
            onChange={e => setClassFilter(e.target.value)}
            className="rl-input text-sm sm:w-40"
          >
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {/* Count */}
      <p className="text-white/30 text-xs">
        {filtered.length === entries.length
          ? `${entries.length} entries`
          : `${filtered.length} of ${entries.length} entries`}
      </p>

      {/* Table */}
      {filtered.length === 0 ? (
        <p className="text-white/25 text-sm text-center py-8">No entries match your search.</p>
      ) : (
        <div className="bg-rl-card border border-white/10 rounded-xl overflow-hidden">
          {/* Mobile: card list */}
          <div className="sm:hidden divide-y divide-white/8">
            {filtered.map((e, i) => (
              <div key={i} className="px-4 py-3.5 flex items-center gap-3">
                <span className="text-[#0EA5A0] font-bold text-lg w-10 flex-shrink-0 text-center">{e.car}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{e.driver}</p>
                  {e.codriver && <p className="text-white/50 text-xs truncate">{e.codriver}</p>}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {e.class && <span className="text-[10px] text-white/40 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full whitespace-nowrap">{e.class.replace(/^Class\s*/i, '')}</span>}
                    {e.vehicle && <span className="text-white/30 text-[10px]">{e.vehicle}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/3">
                  {['#', 'Driver', 'Co-driver', 'Class', 'Vehicle', 'Sponsor'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-white/35 text-xs font-medium uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((e, i) => (
                  <tr key={i} className="hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3 text-[#0EA5A0] font-bold">{e.car}</td>
                    <td className="px-4 py-3 text-white font-medium">{e.driver}</td>
                    <td className="px-4 py-3 text-white/60">{e.codriver}</td>
                    <td className="px-4 py-3">
                      {e.class && <span className="text-[11px] text-white/50 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full whitespace-nowrap">{e.class.replace(/^Class\s*/i, '')}</span>}
                    </td>
                    <td className="px-4 py-3 text-white/50">{e.vehicle}</td>
                    <td className="px-4 py-3 text-white/35 text-xs max-w-[140px] truncate">{e.club}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PDF download if also uploaded */}
      {docs?.filter(d => d.file_url || d.link_url).map(doc => (
        <a key={doc.id} href={doc.file_url || doc.link_url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-3 bg-rl-card border border-white/10 rounded-xl px-4 py-3.5 hover:border-white/25 transition-all group no-underline">
          <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-white text-sm font-medium">{doc.title}</p>
            <p className="text-white/35 text-xs mt-0.5">Download PDF</p>
          </div>
          <svg className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.75a.75.75 0 010-1.5h7.44L8.22 4.03a.75.75 0 010-1.06z" clipRule="evenodd" />
          </svg>
        </a>
      ))}
    </div>
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
