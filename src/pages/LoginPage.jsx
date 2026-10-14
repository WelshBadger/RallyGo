import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

import PageHero from '../components/PageHero'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = location.state?.returnTo || '/organiser'

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      await signIn(email, password)
      toast.success('Welcome back!')
      navigate(returnTo, { replace: true })
    } catch (err) {
      toast.error(err.message || 'Sign in failed. Check your email and password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
    <PageHero back={{ to: '/', label: 'Back' }} title="Organiser sign in" sub="Sign in to add and manage your rallies." />
    <main className="flex justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Sign in / Register */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-white/5 rounded-xl mb-6">
          <Link to="/login" state={location.state} className={`py-2 rounded-lg text-sm font-medium text-center no-underline transition-all ${true ? 'bg-rl-accent text-white' : 'text-white/50 hover:text-white'}`}>Sign in</Link>
          <Link to="/register" state={location.state} className={`py-2 rounded-lg text-sm font-medium text-center no-underline transition-all ${false ? 'bg-rl-accent text-white' : 'text-white/50 hover:text-white'}`}>Register</Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="rl-label">Email</label>
            <input
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="rl-input"
            />
          </div>

          <div>
            <label className="rl-label">Password</label>
            <input
              type="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="rl-input"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="rl-btn-primary w-full justify-center flex items-center gap-2 mt-2"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
    </>
  )
}
