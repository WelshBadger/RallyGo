import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import TileGrid from '../components/TileGrid'
import BulletinFeed from '../components/BulletinFeed'
import { formatDateRange } from '../lib/dateUtils'
import BackButton from '../components/BackButton'

// Public VAPID key for push subscriptions
const VAPID_PUBLIC_KEY = 'BIcwQ-AgPS8rQeybSdJEYAohASdl7C3vx9ls5N5BWx0qC_2Av_gx1k-USjFEeZmjeM-KYGua2tKWqIYNWvPWZc8'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export default function EventPage() {
  const { rallyId } = useParams()
  const [rally, setRally] = useState(null)
  const [loading, setLoading] = useState(true)
  const [newCounts, setNewCounts] = useState({})
  const [notifStatus, setNotifStatus] = useState(null) // null | 'default' | 'granted' | 'denied' | 'subscribing'
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
      // Fetch all docs and compare against localStorage "seen" timestamps
      const { data } = await supabase
        .from('rally_documents')
        .select('section, created_at')
        .eq('rally_id', rallyId)
        .order('created_at', { ascending: false })
      if (data) {
        const counts = {}
        for (const doc of data) {
          const seenKey = `rallygo:seen:${rallyId}:${doc.section}`
          const seenAt = localStorage.getItem(seenKey)
          if (!seenAt || new Date(doc.created_at) > new Date(seenAt)) {
            counts[doc.section] = (counts[doc.section] || 0) + 1
          }
        }
        setNewCounts(counts)
      }
    }

    load()
    loadNewCounts()
  }, [rallyId])

  // Check notification permission status
  // On iOS, push only works when installed to home screen (standalone mode)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  useEffect(() => {
    if (!user || !('Notification' in window) || !('serviceWorker' in navigator)) return
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    if (isIOS && !isStandalone) return
    // Check actual subscription state for this rally
    async function checkSub() {
      const permission = Notification.permission
      if (permission !== 'granted') { setNotifStatus(permission); return }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (!sub) { setNotifStatus('default'); return }
      // Check if this subscription is saved for this rally
      const { data } = await supabase
        .from('push_subscriptions')
        .select('id')
        .eq('endpoint', sub.endpoint)
        .eq('rally_id', rallyId)
        .maybeSingle()
      setNotifStatus(data ? 'granted' : 'default')
    }
    checkSub()
  }, [user, rallyId])

  async function subscribeForPush() {
    if (!user) return
    setNotifStatus('subscribing')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setNotifStatus(permission); return }

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })

      const { endpoint, keys } = sub.toJSON()
      await supabase.from('push_subscriptions').upsert({
        user_id: user.id,
        rally_id: rallyId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        app: 'rallygo',
      }, { onConflict: 'endpoint,rally_id,app' })

      setNotifStatus('granted')
    } catch {
      setNotifStatus('default')
    }
  }

  async function unsubscribeFromPush() {
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        const { endpoint } = sub.toJSON()
        await supabase.from('push_subscriptions').delete()
          .eq('endpoint', endpoint).eq('rally_id', rallyId)
        await sub.unsubscribe()
      }
      setNotifStatus('default')
    } catch {
      setNotifStatus('default')
    }
  }

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
      <BackButton to="/calendar" label="Calendar" />
    </div>
  )

  const isPast = new Date(rally.end_date || rally.date) < new Date()

  return (
    <main className="max-w-4xl mx-auto px-4 py-0">
      {/* Dark event header */}
      <div className="bg-white -mx-4 px-4 sm:px-6 pt-6 pb-0 mb-6 sm:rounded-b-2xl border-b border-white/8">
        {/* Back */}
        <div className="mb-4">
          <BackButton to="/calendar" label="Calendar" />
        </div>

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

        {/* Logo */}
        {rally.logo_url && (
          <div className="mb-3">
            <img
              src={rally.logo_url}
              alt=""
              className="h-12 w-auto object-contain opacity-90"
            />
          </div>
        )}

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

        {/* Rally Logistics deep-link — visible to everyone */}
        <div className="flex items-center justify-between py-3 border-t border-white/8">
          <div>
            <span className="text-white/60 text-xs font-medium block">Team Logistics</span>
            <span className="text-white/30 text-[10px]">Fuel, recce, schedule & team chat</span>
          </div>
          <a
            href={`https://rallylogistics.rallygo.co.uk/pack/${rallyId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rl-btn-ghost text-xs gap-1.5 flex-shrink-0"
          >
            Open →
          </a>
        </div>

        {/* Subtle granted indicator in header */}
        {user && notifStatus === 'granted' && (
          <div className="flex items-center gap-2 py-3 border-t border-white/8">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            <span className="text-white/30 text-xs">Notifications on for this event</span>
          </div>
        )}
      </div>

      {/* Push notification banner */}
      {user && notifStatus === 'default' && (
        <div className="mb-5 bg-rl-accent/10 border border-rl-accent/30 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-rl-accent/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-rl-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium">Get live bulletins instantly</p>
            <p className="text-white/45 text-xs mt-0.5">Push alerts direct to your device when organisers post updates.</p>
          </div>
          <button
            onClick={subscribeForPush}
            className="rl-btn-primary text-xs flex-shrink-0 px-4 py-2.5"
          >
            Enable
          </button>
        </div>
      )}

      {user && notifStatus === 'subscribing' && (
        <div className="mb-5 bg-rl-accent/10 border border-rl-accent/30 rounded-xl p-4 flex items-center gap-3">
          <span className="w-4 h-4 border-2 border-rl-accent/30 border-t-rl-accent rounded-full animate-spin flex-shrink-0" />
          <p className="text-white/60 text-sm">Enabling notifications…</p>
        </div>
      )}

      {user && notifStatus === 'granted' && (
        <div className="mb-5 bg-white/3 border border-white/8 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
              <path d="M5 3l14 14" stroke="none" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium">Notifications enabled</p>
            <p className="text-white/35 text-xs mt-0.5">You'll receive live bulletins for this event.</p>
          </div>
          <button
            onClick={unsubscribeFromPush}
            className="text-xs text-white/30 hover:text-white/60 border border-white/10 hover:border-white/25 px-3 py-2 rounded-lg transition-all flex-shrink-0"
          >
            Disable
          </button>
        </div>
      )}

      {user && notifStatus === 'denied' && (
        <div className="mb-5 bg-white/3 border border-white/8 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          </div>
          <p className="text-white/35 text-xs">Notifications blocked — enable them in your browser or device settings to receive live bulletins.</p>
        </div>
      )}

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
          {rally.roadbook_pdf_url && (
            <a
              href={rally.roadbook_pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 ml-4 text-xs text-white/35 hover:text-rl-accent transition-colors inline-flex items-center gap-1"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z" />
              </svg>
              Download roadbook PDF
            </a>
          )}
        </section>
      )}

      {/* Rally schedule */}
      {Array.isArray(rally.rally_schedule_files) && rally.rally_schedule_files.length > 0 && (
        <section className="mb-6 bg-white rounded-2xl border border-black/10 p-5">
          <p className="text-white/30 text-[11px] uppercase tracking-widest font-medium mb-3">Rally schedule</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {rally.rally_schedule_files.map((f) => (
              f.type === 'pdf' ? (
                <a
                  key={f.id}
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 bg-white/5 rounded-xl border border-white/10 p-3 hover:border-rl-accent transition-colors no-underline"
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5 text-rl-accent shrink-0">
                    <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z" />
                  </svg>
                  <span className="text-white text-sm truncate">{f.label || 'Schedule PDF'}</span>
                </a>
              ) : (
                <a
                  key={f.id}
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-white/5 rounded-xl border border-white/10 overflow-hidden hover:border-rl-accent transition-colors no-underline"
                >
                  <img src={f.url} alt={f.label || 'Schedule'} className="w-full h-40 object-cover" />
                  {f.label && <p className="text-white text-sm px-3 py-2 truncate">{f.label}</p>}
                </a>
              )
            ))}
          </div>
        </section>
      )}

      {/* Section tiles */}
      <section className="mb-6">
        <p className="text-white/30 text-[11px] uppercase tracking-widest font-medium mb-3">Event sections</p>
        <TileGrid rallyId={rallyId} newCounts={newCounts} sportityUrl={rally?.sportity_url} />
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
