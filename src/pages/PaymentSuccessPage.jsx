import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function PaymentSuccessPage() {
  const [params] = useSearchParams()
  const rallyId = params.get('rally_id')
  const [rally, setRally] = useState(null)

  useEffect(() => {
    if (!rallyId) return
    // Small delay to let the Stripe webhook activate the rally
    const timer = setTimeout(async () => {
      const { data } = await supabase.from('rallies').select('*').eq('id', rallyId).single()
      setRally(data)
    }, 2000)
    return () => clearTimeout(timer)
  }, [rallyId])

  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center">
        {/* Success icon */}
        <div className="w-16 h-16 bg-green-500/15 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-2xl font-medium text-white mb-2">Payment confirmed</h1>
        <p className="text-white/45 text-sm mb-7">
          Your event is now live on RallyHQ. Start uploading documents from your dashboard.
        </p>

        <div className="flex flex-col gap-3">
          {rallyId && (
            <Link to={`/organiser/event/${rallyId}`} className="rl-btn-primary justify-center flex">
              Manage event →
            </Link>
          )}
          <Link to="/organiser" className="rl-btn-ghost justify-center flex">
            Go to dashboard
          </Link>
        </div>
      </div>
    </main>
  )
}
