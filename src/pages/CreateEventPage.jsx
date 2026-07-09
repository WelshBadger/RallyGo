import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const EVENT_PRICE = parseInt(import.meta.env.VITE_EVENT_PRICE_PENCE || '5000')
const PRICE_DISPLAY = `£${(EVENT_PRICE / 100).toFixed(2)}`

export default function CreateEventPage() {
  const { user, isSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    date: '',
    endDate: '',
    location: '',
    series: '',
  })
  const [loading, setLoading] = useState(false)

  function update(field) {
    return (e) => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)

    try {
      if (isSuperAdmin) {
        // Super admin: create rally as active directly, no payment
        const { data: rally, error } = await supabase
          .from('rallies')
          .insert({
            name: form.name,
            date: form.date,
            end_date: form.endDate || null,
            location: form.location,
            series: form.series || null,
            organiser_id: user.id,
            status: 'active',
          })
          .select()
          .single()
        if (error) throw error
        toast.success('Rally created!')
        navigate(`/organiser/event/${rally.id}`)
        return
      }

      // 1. Create rally as draft
      const { data: rally, error } = await supabase
        .from('rallies')
        .insert({
          name: form.name,
          date: form.date,
          end_date: form.endDate || null,
          location: form.location,
          series: form.series || null,
          organiser_id: user.id,
          status: 'draft',
        })
        .select()
        .single()

      if (error) throw error

      // 2. Call Supabase Edge Function to create Stripe checkout session
      const { data: checkoutData, error: fnErr } = await supabase.functions.invoke('create-checkout', {
        body: {
          rallyId: rally.id,
          rallyName: rally.name,
          returnUrl: `${window.location.origin}/payment-success?rally_id=${rally.id}`,
          cancelUrl: `${window.location.origin}/organiser/create`,
        },
      })

      if (fnErr) throw fnErr

      // 3. Redirect to Stripe
      if (checkoutData?.url) {
        window.location.href = checkoutData.url
      } else {
        throw new Error('No checkout URL returned')
      }
    } catch (err) {
      toast.error(err.message || 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2 text-xs text-white/30 mb-6">
        <Link to="/organiser" className="hover:text-white/60 no-underline transition-colors">Dashboard</Link>
        <span>/</span>
        <span className="text-white/60">New event</span>
      </div>

      <h1 className="text-2xl font-medium text-white mb-1">Create an event</h1>
      <p className="text-white/40 text-sm mb-7">
        {isSuperAdmin
          ? 'Super admin — rally will be created as active immediately.'
          : `Fill in your event details. You'll be taken to a secure payment page (${PRICE_DISPLAY} per event) to activate it.`}
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="rl-label">Event name *</label>
          <input
            type="text"
            value={form.name}
            onChange={update('name')}
            required
            placeholder="e.g. Rallye des Highlands 2026"
            className="rl-input"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="rl-label">Start date *</label>
            <input
              type="date"
              value={form.date}
              onChange={update('date')}
              required
              className="rl-input"
            />
          </div>
          <div>
            <label className="rl-label">End date</label>
            <input
              type="date"
              value={form.endDate}
              onChange={update('endDate')}
              min={form.date}
              className="rl-input"
            />
          </div>
        </div>

        <div>
          <label className="rl-label">Location *</label>
          <input
            type="text"
            value={form.location}
            onChange={update('location')}
            required
            placeholder="e.g. Inverness, Scotland"
            className="rl-input"
          />
        </div>

        <div>
          <label className="rl-label">Championship / series <span className="text-white/25 normal-case font-normal">(optional)</span></label>
          <input
            type="text"
            value={form.series}
            onChange={update('series')}
            placeholder="e.g. British Rally Championship"
            className="rl-input"
          />
        </div>

        {/* Price summary — hidden for super admin */}
        {!isSuperAdmin && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-white text-sm font-medium">Event activation fee</p>
              <p className="text-white/40 text-xs mt-0.5">One-time per event. Includes all features.</p>
            </div>
            <span className="text-white text-xl font-medium">{PRICE_DISPLAY}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="rl-btn-primary w-full flex items-center justify-center gap-2 py-3"
        >
          {loading ? (
            <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          ) : isSuperAdmin ? (
            <>Create rally &rarr;</>
          ) : (
            <>Continue to payment &rarr;</>
          )}
        </button>
      </form>
    </main>
  )
}
