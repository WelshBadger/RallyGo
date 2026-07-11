import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) { toast.error(error.message); setLoading(false); return }
      toast.success('Account created — welcome!')
      navigate('/')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { toast.error(error.message); setLoading(false); return }
      navigate('/')
    }
  }

  return (
    <main className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-rl-card border border-white/10 flex items-center justify-center mx-auto mb-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-rl-accent" />
            <span className="text-white font-black text-lg tracking-tight">RL</span>
          </div>
          <h1 className="text-xl font-semibold text-white mb-1">
            {mode === 'signup' ? 'Create your account' : 'Sign in'}
          </h1>
          <p className="text-white/40 text-sm">Rally Logistics — Team management</p>
        </div>

        {mode === 'signup' && (
          <div className="bg-rl-accent/10 border border-rl-accent/25 rounded-xl px-4 py-3 mb-5 text-center">
            <p className="text-rl-accent text-sm font-semibold">Free access until 31 December 2026</p>
            <p className="text-white/40 text-xs mt-0.5">After that, just £4.99 / year</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 bg-rl-card border border-white/10 rounded-2xl p-6">
          <div>
            <label className="text-white/50 text-xs uppercase tracking-wide mb-1.5 block">Email</label>
            <input type="email" name="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
              className="rl-input" placeholder="you@example.com" required />
          </div>
          <div>
            <label className="text-white/50 text-xs uppercase tracking-wide mb-1.5 block">Password</label>
            <input type="password" name="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)}
              className="rl-input" placeholder="••••••••" required minLength={6} />
          </div>
          <button type="submit" disabled={loading} className="rl-btn-primary w-full justify-center disabled:opacity-50">
            {loading ? '…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-white/30 text-sm mt-5">
          {mode === 'signin' ? (
            <>New to Rally Logistics?{' '}
              <button onClick={() => setMode('signup')} className="text-rl-accent">Create a free account</button>
            </>
          ) : (
            <>Already have an account?{' '}
              <button onClick={() => setMode('signin')} className="text-rl-accent">Sign in</button>
            </>
          )}
        </p>
      </div>
    </main>
  )
}
