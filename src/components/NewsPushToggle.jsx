import { useEffect, useState } from 'react'
import { newsPushStatus, enableNewsPush, disableNewsPush } from '../lib/newsPush'

// Switch for "RallyHQ news" notifications (rally announcements, the next rally, etc.)
export default function NewsPushToggle() {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { newsPushStatus().then(setStatus).catch(() => setStatus('unsupported')) }, [])

  async function toggle() {
    setBusy(true)
    try { setStatus(status === 'on' ? await disableNewsPush() : await enableNewsPush()) } catch { /* leave as is */ }
    setBusy(false)
  }

  if (!status || status === 'unsupported') return null

  return (
    <div className="bg-rl-card border border-white/10 rounded-xl p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-white text-sm font-medium">RallyHQ news notifications</p>
        <p className="text-white/40 text-xs mt-0.5">
          {status === 'ios-browser'
            ? 'On iPhone, add RallyHQ to your home screen first (Share → Add to Home Screen), then switch this on there.'
            : status === 'blocked'
              ? "Notifications are blocked for this site — allow them in your phone or browser settings."
              : 'Occasional news from RallyHQ, like the next rally. Separate from rally bulletin alerts.'}
        </p>
      </div>
      {(status === 'on' || status === 'off') && (
        <button onClick={toggle} disabled={busy}
          className={`flex-shrink-0 text-xs font-medium px-3 py-2 rounded-lg border transition-all ${
            status === 'on' ? 'border-rl-accent/40 bg-rl-accent/10 text-rl-accent' : 'border-white/15 text-white/60 hover:text-white'
          }`}>
          {busy ? '…' : status === 'on' ? 'On' : 'Off'}
        </button>
      )}
    </div>
  )
}
