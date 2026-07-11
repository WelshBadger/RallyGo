import { useAuth } from '../context/AuthContext'
import { useNavigate, Link } from 'react-router-dom'

export default function AccountPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <main className="max-w-lg mx-auto px-4 py-8 space-y-5">

      {/* Back */}
      <Link to="/" className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/7 border border-white/12 hover:bg-white/12 hover:border-white/22 transition-all text-white/60 hover:text-white text-sm font-medium no-underline">
        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
          <path fillRule="evenodd" d="M7.78 12.53a.75.75 0 01-1.06 0L2.47 8.28a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 1.06L4.81 7h7.44a.75.75 0 010 1.5H4.81l2.97 2.97a.75.75 0 010 1.06z" clipRule="evenodd" />
        </svg>
        All events
      </Link>

      {/* Header */}
      <div className="bg-rl-card border border-white/10 rounded-2xl p-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-rl-accent/15 border border-rl-accent/25 flex items-center justify-center flex-shrink-0">
            <span className="text-rl-accent font-bold text-lg">
              {user?.email?.[0]?.toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium text-sm truncate">{user?.email}</p>
            {memberSince && <p className="text-white/35 text-xs mt-0.5">Member since {memberSince}</p>}
          </div>
        </div>
      </div>

      {/* Access status */}
      <div className="bg-rl-accent/8 border border-rl-accent/20 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-rl-accent/15 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-rl-accent">
              <path fillRule="evenodd" d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.5 5.5a.75.75 0 00-1.061-1.061L7 8.879 5.561 7.44A.75.75 0 004.5 8.5l2 2a.75.75 0 001.061 0l4-4z" clipRule="evenodd"/>
            </svg>
          </div>
          <div>
            <p className="text-rl-accent font-semibold text-sm">Free access active</p>
            <p className="text-white/50 text-xs mt-1 leading-relaxed">
              You have full access to Rally Logistics until <strong className="text-white/70">31 December 2026</strong> — no payment needed.
            </p>
          </div>
        </div>
      </div>

      {/* What's included */}
      <div className="bg-rl-card border border-white/10 rounded-2xl p-5">
        <p className="text-white/40 text-xs uppercase tracking-widest font-semibold mb-4">What's included</p>
        <div className="space-y-3">
          {[
            'Team contacts — mechanics, crew and co-driver details',
            'Rally schedule — day-by-day programme auto-populated from Final Instructions',
            'Stage notes — crew notes and tyre strategy per stage',
            'Pre-event info — sign-on, scrutineering and noise testing times',
            'Locations — service park, hotel, refuel and more with map links',
            'Fuel plan — starting fuel and refuel stops with totals',
            'Recce notes — per-stage notes from reconnaissance',
            'Live results — load any results URL directly in the app',
            'Team sharing — share your pack via QR code or link',
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="text-rl-accent mt-0.5 flex-shrink-0 text-xs">✓</span>
              <p className="text-white/60 text-sm">{item}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Future pricing */}
      <div className="bg-rl-card border border-white/10 rounded-2xl p-5">
        <p className="text-white/40 text-xs uppercase tracking-widest font-semibold mb-3">From 2027</p>
        <div className="flex items-baseline gap-1 mb-2">
          <span className="text-white font-bold text-3xl">£4.99</span>
          <span className="text-white/40 text-sm">/ year</span>
        </div>
        <p className="text-white/40 text-xs leading-relaxed">
          Full access for an entire rally season. Payment details will be added to your account page before January 2027.
        </p>
      </div>

      {/* Sign out */}
      <button onClick={handleSignOut}
        className="w-full bg-white/4 hover:bg-white/8 border border-white/10 rounded-xl py-3 text-white/50 hover:text-white/80 text-sm transition-all">
        Sign out
      </button>

    </main>
  )
}
