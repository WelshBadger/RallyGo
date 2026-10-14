import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatDateRange } from '../lib/dateUtils'
import PageHero from '../components/PageHero'

const STATUS_STYLES = {
  draft: 'bg-white/8 text-white/40',
  active: 'bg-green-500/15 text-green-400',
  archived: 'bg-white/5 text-white/25',
}

export default function OrganizerDashboard() {
  const [rallies, setRallies] = useState([])
  const [loading, setLoading] = useState(true)
  const { user, profile } = useAuth()

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('rallies')
        .select('*')
        .eq('organiser_id', user.id)
        .order('date', { ascending: false })
      setRallies(data || [])
      setLoading(false)
    }
    load()
  }, [user])

  return (
    <>
    <PageHero
      title="Organiser dashboard"
      sub={`Welcome back, ${profile?.full_name || user.email}`}
      action={{ to: '/organiser/create', label: 'New event' }}
    />
    <main className="max-w-4xl mx-auto px-4 py-8">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          { label: 'Total events', value: rallies.length },
          { label: 'Active now', value: rallies.filter(r => r.status === 'active').length },
          { label: 'Archived', value: rallies.filter(r => r.status === 'archived').length },
        ].map((stat) => (
          <div key={stat.label} className="bg-rl-card border border-white/10 rounded-xl p-4">
            <p className="text-white/40 text-xs mb-1">{stat.label}</p>
            <p className="text-white text-2xl font-medium">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Events list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-white/5 rounded-xl animate-pulse" />)}
        </div>
      ) : rallies.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-white/10 rounded-xl">
          <p className="text-white/30 text-sm mb-3">No events yet</p>
          <Link to="/organiser/create" className="rl-btn-primary inline-block">Create your first event</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {rallies.map((rally) => (
            <div
              key={rally.id}
              className="bg-rl-card border border-white/10 rounded-xl p-4 sm:p-5 flex items-center justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${STATUS_STYLES[rally.status] || STATUS_STYLES.draft}`}>
                    {rally.status}
                  </span>
                </div>
                <h2 className="text-white font-medium text-sm sm:text-base truncate">{rally.name}</h2>
                <p className="text-white/35 text-xs mt-0.5">{formatDateRange(rally.date, rally.end_date)} · {rally.location}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Link to={`/event/${rally.id}`} className="rl-btn-ghost text-xs px-3 py-2">View</Link>
                <Link to={`/organiser/event/${rally.id}`} className="rl-btn-primary text-xs px-3 py-2">Manage</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
    </>
  )
}
