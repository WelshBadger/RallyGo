import { useLocation, useNavigate } from 'react-router-dom'

// Shown once after registering, before the first pack opens.
// Payment is not taken yet — access is free until the end of 2026.
export default function SubscriptionPage() {
  const navigate = useNavigate()
  const returnTo = useLocation().state?.returnTo || '/'

  return (
    <main className="max-w-sm mx-auto px-4 py-10 space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white mb-1">Your subscription</h1>
        <p className="text-white/40 text-sm">Rally Logistics is a subscription service for crews.</p>
      </div>

      <div className="bg-rl-accent/8 border border-rl-accent/20 rounded-2xl p-5">
        <p className="text-rl-accent font-semibold text-sm">Free access active</p>
        <p className="text-white/50 text-xs mt-1 leading-relaxed">
          You have full access until <strong className="text-white/70">31 December 2026</strong> — no payment needed.
        </p>
      </div>

      <div className="bg-rl-card border border-white/10 rounded-2xl p-5">
        <p className="text-white/40 text-xs uppercase tracking-widest font-semibold mb-3">From 2027</p>
        <div className="flex items-baseline gap-1 mb-2">
          <span className="text-white text-2xl font-bold">£4.99</span>
          <span className="text-white/40 text-sm">/ year</span>
        </div>
        <p className="text-white/40 text-xs leading-relaxed">Full access for an entire season. Cancel any time.</p>
      </div>

      <button onClick={() => navigate(returnTo, { replace: true })} className="rl-btn-primary w-full justify-center">
        Continue
      </button>
    </main>
  )
}
