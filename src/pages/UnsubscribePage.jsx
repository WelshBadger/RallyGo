import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// One-click unsubscribe from the link at the bottom of every RallyHQ marketing email
export default function UnsubscribePage() {
  const [params] = useSearchParams()
  const token = params.get('t')
  const [state, setState] = useState('working') // working | done | invalid | error

  useEffect(() => {
    if (!token || !/^[0-9a-f-]{36}$/i.test(token)) { setState('invalid'); return }
    supabase.rpc('marketing_unsubscribe', { p_token: token }).then(({ data, error }) => {
      if (error) setState('error')
      else setState(data ? 'done' : 'invalid')
    })
  }, [token])

  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm text-center">
        <img src="/icons/logo-circle.png" alt="" width="56" height="56" className="w-14 h-14 mx-auto mb-5" />
        {state === 'working' && <p className="text-white/50 text-sm">Unsubscribing…</p>}
        {state === 'done' && (
          <>
            <h1 className="text-xl font-semibold text-white mb-2">You're unsubscribed</h1>
            <p className="text-white/50 text-sm">You won't get any more news emails from RallyHQ. Emails about your account (like password resets) still arrive.</p>
          </>
        )}
        {state === 'invalid' && (
          <>
            <h1 className="text-xl font-semibold text-white mb-2">Link not recognised</h1>
            <p className="text-white/50 text-sm">This unsubscribe link isn't valid. Use the link from the most recent email, or email us and we'll take you off the list.</p>
          </>
        )}
        {state === 'error' && (
          <>
            <h1 className="text-xl font-semibold text-white mb-2">Something went wrong</h1>
            <p className="text-white/50 text-sm">We couldn't unsubscribe you just now. Please check your connection and try the link again.</p>
          </>
        )}
        <Link to="/" className="inline-block mt-6 text-sm text-rl-accent no-underline">Go to RallyHQ</Link>
      </div>
    </main>
  )
}
