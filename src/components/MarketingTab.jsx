import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'

// Admin-only: send news by email (people who agreed) and/or "RallyHQ news" push
// notifications (devices that switched them on). Sending is done by the
// send-marketing function, which checks the caller is the super admin.

const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : ''
const today = () => new Date().toISOString().slice(0, 10)

export default function MarketingTab() {
  const [audience, setAudience] = useState(null)
  const [upcoming, setUpcoming] = useState([])
  const [history, setHistory] = useState([])
  const [form, setForm] = useState({ subject: '', message: '', link: '', linkLabel: '', email: true, push: true })
  const [sending, setSending] = useState(null) // 'test' | 'live'

  async function load() {
    const [{ data: aud }, { data: events }, { data: sends }] = await Promise.all([
      supabase.rpc('marketing_audience'),
      supabase.from('calendar_events').select('id, name, date, end_date, location, rally_id').gte('date', today()).order('date').limit(12),
      supabase.from('marketing_sends').select('*').order('created_at', { ascending: false }).limit(20),
    ])
    setAudience(aud || null)
    setUpcoming(events || [])
    setHistory(sends || [])
  }
  useEffect(() => { load() }, [])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  // Fill the message from a calendar rally
  function fillFromRally(id) {
    const ev = upcoming.find(e => e.id === id)
    if (!ev) return
    const dates = ev.end_date && ev.end_date !== ev.date ? `${fmtDate(ev.date)} – ${fmtDate(ev.end_date)}` : fmtDate(ev.date)
    setForm(f => ({
      ...f,
      subject: `Next up: ${ev.name}`,
      message: `${ev.name} is coming up on ${dates}${ev.location ? ` in ${ev.location}` : ''}.\n\nRally info and your crew's logistics pack are ready in RallyHQ.`,
      link: ev.rally_id ? `https://www.rallygo.co.uk/event/${ev.rally_id}` : 'https://www.rallygo.co.uk/calendar',
      linkLabel: 'Open in RallyHQ',
    }))
  }

  async function send(test) {
    if (!form.subject.trim() || !form.message.trim()) { toast.error('Add a subject and a message'); return }
    if (!form.email && !form.push) { toast.error('Choose email, notifications or both'); return }
    if (!test) {
      const parts = [form.email && `${audience?.emails ?? 0} emails`, form.push && `${audience?.push ?? 0} notifications`].filter(Boolean)
      if (!confirm(`Send "${form.subject}" now? This goes out as ${parts.join(' and ')} and can't be undone.`)) return
    }
    setSending(test ? 'test' : 'live')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-marketing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ ...form, link: form.link.trim() || null, test }),
      })
      const r = await res.json()
      if (!res.ok) throw new Error(r.error || 'Send failed')
      const msg = `${test ? 'Test sent' : 'Sent'}: ${r.emailCount} email${r.emailCount === 1 ? '' : 's'}, ${r.pushCount} notification${r.pushCount === 1 ? '' : 's'}`
      r.errors?.length ? toast(`${msg}. ${r.errors.join(' ')}`, { icon: '⚠️', duration: 9000 }) : toast.success(msg)
      load()
    } catch (err) {
      toast.error(err.message || 'Send failed')
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-rl-card border border-white/10 rounded-xl p-4">
          <p className="text-white/40 text-[11px] uppercase tracking-wide mb-1">Email list</p>
          <p className="text-white text-2xl font-semibold">{audience?.emails ?? '—'}</p>
          <p className="text-white/35 text-xs mt-1">agreed to hear from RallyHQ, of {audience?.accounts ?? '—'} accounts</p>
        </div>
        <div className="bg-rl-card border border-white/10 rounded-xl p-4">
          <p className="text-white/40 text-[11px] uppercase tracking-wide mb-1">News notifications</p>
          <p className="text-white text-2xl font-semibold">{audience?.push ?? '—'}</p>
          <p className="text-white/35 text-xs mt-1">devices switched on</p>
        </div>
        <div className="bg-rl-card border border-white/10 rounded-xl p-4">
          <p className="text-white/40 text-[11px] uppercase tracking-wide mb-1">Sent so far</p>
          <p className="text-white text-2xl font-semibold">{history.filter(h => !h.test).length}</p>
          <p className="text-white/35 text-xs mt-1">messages</p>
        </div>
      </div>

      <div className="bg-rl-card border border-white/10 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-white font-medium">New message</h2>
          {upcoming.length > 0 && (
            <select defaultValue="" onChange={e => { fillFromRally(e.target.value); e.target.value = '' }} className="rl-input w-auto text-sm" aria-label="Fill from a rally">
              <option value="" disabled>Fill from a rally…</option>
              {upcoming.map(ev => <option key={ev.id} value={ev.id}>{ev.name} · {fmtDate(ev.date)}</option>)}
            </select>
          )}
        </div>
        <div>
          <label className="rl-label">Subject / notification title</label>
          <input value={form.subject} onChange={set('subject')} className="rl-input" placeholder="e.g. Next up: Cambrian Rally" />
        </div>
        <div>
          <label className="rl-label">Message</label>
          <textarea value={form.message} onChange={set('message')} rows={6} className="rl-input" placeholder="Write your message. Leave a blank line between paragraphs." />
          <p className="text-white/30 text-[11px] mt-1">Notifications show the first 180 characters.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="rl-label">Link (optional)</label>
            <input value={form.link} onChange={set('link')} className="rl-input" placeholder="https://www.rallygo.co.uk/…" />
          </div>
          <div>
            <label className="rl-label">Button text</label>
            <input value={form.linkLabel} onChange={set('linkLabel')} className="rl-input" placeholder="Find out more" />
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
            <input type="checkbox" checked={form.email} onChange={set('email')} className="w-4 h-4 accent-rl-accent" />
            Email ({audience?.emails ?? 0})
          </label>
          <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
            <input type="checkbox" checked={form.push} onChange={set('push')} className="w-4 h-4 accent-rl-accent" />
            News notification ({audience?.push ?? 0})
          </label>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <button onClick={() => send(true)} disabled={!!sending} className="rl-btn-ghost text-sm">
            {sending === 'test' ? 'Sending test…' : 'Send test to me'}
          </button>
          <button onClick={() => send(false)} disabled={!!sending} className="rl-btn-primary text-sm">
            {sending === 'live' ? 'Sending…' : 'Send to everyone opted in'}
          </button>
        </div>
        <p className="text-white/30 text-[11px]">
          Emails only go to people who agreed to hear from RallyHQ, each with an unsubscribe link. Notifications only go to devices that switched on RallyHQ news.
        </p>
      </div>

      <div>
        <h2 className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-3">History</h2>
        {history.length === 0 ? (
          <p className="text-white/40 text-sm">Nothing sent yet.</p>
        ) : (
          <div className="space-y-2">
            {history.map(h => (
              <div key={h.id} className="bg-rl-card border border-white/10 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-white text-sm font-medium truncate">{h.test ? '[Test] ' : ''}{h.subject}</p>
                  <p className="text-white/35 text-xs flex-shrink-0">{new Date(h.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <p className="text-white/45 text-xs mt-0.5">{h.email_count} emails · {h.push_count} notifications</p>
                {h.errors && <p className="text-amber-600 text-xs mt-1">{h.errors}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
