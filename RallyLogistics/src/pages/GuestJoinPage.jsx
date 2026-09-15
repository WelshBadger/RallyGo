import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

// A name is "real" if the crew would recognise it — not a placeholder we filled in.
function isRealName(n) {
  const s = (n || '').trim().toLowerCase()
  return !!s && s !== 'guest' && s !== 'member'
}

// Join a pack straight from a link — no sign-up form. The visitor gets an
// anonymous Supabase session (a real auth user, so RLS and roles still work),
// a display name, and an editor seat on the pack.
export default function GuestJoinPage() {
  const { shareCode } = useParams()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()

  const [pack, setPack] = useState(null)
  const [rallyName, setRallyName] = useState('')
  const [loading, setLoading] = useState(true)
  const [myName, setMyName] = useState('')
  const [name, setName] = useState('')
  const [joining, setJoining] = useState(false)
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    let live = true
    async function load() {
      const { data: p } = await supabase
        .from('logistics_packs')
        .select('id, rally_id, calendar_event_id, custom_name, car_number')
        .eq('share_code', shareCode)
        .maybeSingle()
      if (!live) return
      setPack(p || null)
      if (p?.rally_id) {
        const { data: r } = await supabase.from('rallies').select('name').eq('id', p.rally_id).maybeSingle()
        if (live) setRallyName(r?.name || '')
      } else if (p?.calendar_event_id) {
        const { data: c } = await supabase.from('calendar_events').select('name').eq('id', p.calendar_event_id).maybeSingle()
        if (live) setRallyName(c?.name || '')
      } else if (p?.custom_name) {
        setRallyName(p.custom_name)
      }
      setLoading(false)
    }
    load()
    return () => { live = false }
  }, [shareCode])

  // Someone coming back on an existing session still needs a proper name on file
  useEffect(() => {
    if (!user) return
    let live = true
    supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
      .then(({ data }) => {
        if (!live) return
        const n = data?.full_name || ''
        setMyName(n)
        if (isRealName(n)) setName(n)
      })
    return () => { live = false }
  }, [user])

  const needsName = !user || !isRealName(myName)

  async function join() {
    if (needsName && !name.trim()) { toast.error('Pop your name in so the team knows who you are'); return }
    setJoining(true)
    try {
      if (!user) {
        const { error } = await supabase.auth.signInAnonymously()
        if (error) {
          if (/anonymous/i.test(error.message || '')) {
            setBlocked(true)
            setJoining(false)
            return
          }
          throw error
        }
      }
      const { data: packId, error: rpcError } = await supabase.rpc('join_pack_with_code', {
        p_code: shareCode,
        p_name: name.trim() || null,
      })
      if (rpcError) throw rpcError
      toast.success('You\'re in')
      navigate(`/pack/team/${packId}`, { replace: true })
    } catch (err) {
      toast.error(err.message || 'Could not join')
      setJoining(false)
    }
  }

  if (loading || authLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-white/10 border-t-rl-accent rounded-full animate-spin" />
    </div>
  )

  if (!pack) return (
    <div className="max-w-md mx-auto px-4 py-16 text-center space-y-3">
      <h1 className="text-white text-lg font-semibold">Link not recognised</h1>
      <p className="text-white/40 text-sm">That invite link doesn't match a rally pack. Ask whoever sent it for a fresh one.</p>
    </div>
  )

  return (
    <main className="max-w-md mx-auto px-4 py-12 space-y-5">
      <div className="text-center space-y-1.5">
        <p className="text-white/35 text-xs uppercase tracking-wide">You've been invited to</p>
        <h1 className="text-white text-2xl font-semibold leading-tight">{rallyName || 'a rally pack'}</h1>
        {pack.car_number && <p className="text-white/40 text-sm">Car #{pack.car_number}</p>}
      </div>

      {blocked ? (
        <div className="bg-rl-card border border-amber-500/30 rounded-xl p-4 space-y-2">
          <p className="text-white text-sm font-medium">Guest access is switched off</p>
          <p className="text-white/50 text-xs">
            Anonymous sign-ins need turning on for this app before invite links work without an account.
            In the meantime you can <Link to="/login" className="text-rl-accent">sign in or register</Link>, or
            open the read-only version of this pack.
          </p>
          <Link to={`/shared/${shareCode}`} className="rl-btn-ghost text-xs inline-flex no-underline">View read-only</Link>
        </div>
      ) : (
        <div className="bg-rl-card border border-white/10 rounded-xl p-4 space-y-3">
          {needsName ? (
            <div>
              <p className="text-white/35 text-[10px] uppercase tracking-wide mb-1">Your name</p>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') join() }}
                placeholder="e.g. Stephen Waugh"
                className="rl-input text-sm w-full"
                autoFocus
              />
              <p className="text-white/30 text-[11px] mt-1.5">This is how you'll show up to the rest of the crew.</p>
            </div>
          ) : (
            <p className="text-white/60 text-sm">You'll join as <span className="text-white font-medium">{myName}</span>.</p>
          )}

          <button onClick={join} disabled={joining} className="rl-btn-primary w-full justify-center">
            {joining ? 'Joining…' : needsName ? 'Join the team' : 'Join this pack'}
          </button>

          {!user && (
            <p className="text-white/30 text-[11px] text-center">
              No account, no password — you go straight in. Stay on this device and this browser to keep your place.
            </p>
          )}
        </div>
      )}

      <div className="text-center space-y-2">
        <Link to={`/shared/${shareCode}`} className="text-white/35 hover:text-white/70 text-xs no-underline">
          Just want a look? Open the read-only version
        </Link>
        {!user && (
          <p className="text-white/25 text-[11px]">
            Already have an account? <Link to="/login" className="text-rl-accent">Sign in</Link>
          </p>
        )}
      </div>
    </main>
  )
}
