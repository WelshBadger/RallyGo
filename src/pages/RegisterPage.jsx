import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export default function RegisterPage() {
  const [form, setForm] = useState({ fullName: '', email: '', password: '', role: 'competitor', carNumber: '' })
  const [loading, setLoading] = useState(false)
  const { signUp } = useAuth()
  const navigate = useNavigate()

  function update(field) {
    return (e) => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      await signUp(form.email, form.password, form.fullName, form.role, form.carNumber)
      toast.success('Account created! Check your email to confirm.')
      navigate('/', { replace: true })
    } catch (err) {
      toast.error(err.message || 'Registration failed')
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

        <h1 className="text-2xl font-medium text-white mb-1">Create account</h1>
        <p className="text-white/40 text-sm mb-7">
          Already registered? <Link to="/login" className="text-white/70 hover:text-white transition-colors no-underline">Sign in</Link>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Role selector */}
          <div>
            <label className="rl-label">I am a</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'competitor', label: 'Competitor' },
                { value: 'organiser', label: 'Organiser' },
              ].map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, role: r.value }))}
                  className={`py-2.5 rounded-lg text-sm font-medium border transition-all ${
                    form.role === r.value
                      ? 'bg-rl-accent border-rl-accent text-white'
                      : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:border-white/25'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="rl-label">Full name</label>
            <input
              type="text"
              value={form.fullName}
              onChange={update('fullName')}
              required
              placeholder="John Smith"
              className="rl-input"
            />
          </div>

          <div>
            <label className="rl-label">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={update('email')}
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
              value={form.password}
              onChange={update('password')}
              required
              autoComplete="new-password"
              placeholder="Min. 8 characters"
              className="rl-input"
            />
          </div>

          {form.role === 'competitor' && (
            <div>
              <label className="rl-label">Car / competitor number <span className="text-white/25 normal-case">(optional)</span></label>
              <input
                type="text"
                value={form.carNumber}
                onChange={update('carNumber')}
                placeholder="e.g. 14"
                className="rl-input"
              />
            </div>
          )}

          {form.role === 'organiser' && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-white/50">
              As an organiser, you'll be able to create events and upload documents. A per-event fee applies when publishing.
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="rl-btn-primary w-full flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : 'Create account'}
          </button>
        </form>
      </div>
    </main>
  )
}
