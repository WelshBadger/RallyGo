import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatDateRange } from '../lib/dateUtils'
import { checkRallyCode, getStoredCode, storeCode, forgetCode } from '../lib/rallyAccess'
import BackButton from './BackButton'

// Wraps the Rally Info pages: competitors need the organiser's code for this rally.
// The rally's organiser and super admins go straight through.
export default function RallyCodeGate({ children }) {
  const { rallyId } = useParams()
  const { user, isSuperAdmin, loading: authLoading } = useAuth()
  const [rally, setRally] = useState(null)
  const [unlocked, setUnlocked] = useState(() => !!getStoredCode(rallyId))
  const [code, setCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setUnlocked(!!getStoredCode(rallyId))
    setRally(null)
    setError('')

    supabase.from('rallies').select('id, name, date, end_date, location, organiser_id').eq('id', rallyId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setRally(data || false) })

    // Re-check a remembered code so a changed code locks the rally again.
    // No answer (offline) keeps the device unlocked.
    const stored = getStoredCode(rallyId)
    if (stored) {
      checkRallyCode(rallyId, stored).then(ok => {
        if (cancelled || ok !== false) return
        forgetCode(rallyId)
        setUnlocked(false)
      })
    }
    return () => { cancelled = true }
  }, [rallyId])

  const isManager = !!user && (isSuperAdmin || (rally && rally.organiser_id === user.id))
  if (unlocked) return children
  if (isManager) return (
    <>
      <div className="max-w-4xl mx-auto px-4 pt-3">
        <p className="text-xs text-white/50 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
          You're signed in as the organiser, so this rally opens without a code. Competitors are asked for the rally code.
        </p>
      </div>
      {children}
    </>
  )

  // Signed-in users might be the organiser — wait until we know before asking for a code
  if (authLoading || (user && rally === null)) return (
    <div className="max-w-sm mx-auto px-4 py-16">
      <div className="h-40 bg-white/5 rounded-xl animate-pulse" />
    </div>
  )

  async function handleSubmit(e) {
    e.preventDefault()
    const entered = code.trim().toUpperCase()
    if (!entered) return
    setChecking(true)
    setError('')
    const ok = await checkRallyCode(rallyId, entered)
    setChecking(false)
    if (ok === null) { setError('Could not check the code. Check your connection and try again.'); return }
    if (!ok) { setError('That code is not right for this rally.'); return }
    storeCode(rallyId, entered)
    setUnlocked(true)
  }

  return (
    <CodePrompt
      title={rally ? rally.name : 'Rally info'}
      date={rally ? formatDateRange(rally.date, rally.end_date) : ''}
      location={rally?.location}
      code={code}
      onChange={(v) => { setCode(v); setError('') }}
      onSubmit={handleSubmit}
      checking={checking}
      error={error}
    />
  )
}

// The "enter the organiser's code" screen, shared with calendar-only events
export function CodePrompt({ title, date, location, code, onChange, onSubmit, checking, error }) {
  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <BackButton to="/calendar" label="Calendar" />
        </div>

        <div className="w-11 h-11 rounded-xl bg-rl-accent/10 flex items-center justify-center mb-4">
          <svg className="w-5 h-5 text-rl-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 018 0v4" />
          </svg>
        </div>

        <h1 className="text-2xl font-medium text-white mb-1">{title}</h1>
        {date && (
          <p className="text-white/40 text-sm mb-1">
            {date}
            {location && <><span className="text-white/20 mx-1.5">·</span>{location}</>}
          </p>
        )}
        <p className="text-white/45 text-sm mt-4 mb-5">
          Enter the access code from the rally organisers to open this event.
        </p>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="rl-label" htmlFor="rally-code">Rally code</label>
            <input
              id="rally-code"
              type="text"
              value={code}
              onChange={(e) => onChange(e.target.value)}
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              placeholder="e.g. K7M4XP"
              className="rl-input uppercase tracking-widest"
            />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={checking || !code.trim()}
            className="rl-btn-primary w-full flex items-center justify-center gap-2"
          >
            {checking ? (
              <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : 'Open rally'}
          </button>
        </form>

        <p className="text-white/30 text-xs mt-5">
          The code is in your organiser's instructions. You only need to enter it once on this device.
        </p>
      </div>
    </main>
  )
}
