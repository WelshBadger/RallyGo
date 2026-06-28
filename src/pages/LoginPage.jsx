import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = location.state?.returnTo || '/'

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
    <main className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 mb-8 no-underline">
          <span className="w-2 h-2 rounded-full bg-rl-accent" />
          <span className="text-white font-medium">RallyGo</span>
        </Link>

        <h1 className="text-2xl font-medium text-white mb-1">Sign in</h1>
        <p className="text-white/40 text-sm mb-7">
          New here? <Link to="/register" className="text-white/70 hover:text-white transition-colors no-underline">Create a free account</Link>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="rl-label">Email</label>
            <input
              type="email"
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
  )
}
