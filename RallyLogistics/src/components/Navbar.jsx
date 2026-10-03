import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
  const { user } = useAuth()
  return (
    <nav style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }} className="border-b border-white/8 bg-rl-bg/95 backdrop-blur sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 no-underline">
          <img src="/icons/logo-circle.png" alt="" width="28" height="28" className="w-7 h-7 flex-shrink-0" />
          <div>
            <span className="font-semibold text-sm leading-none" style={{ color: '#fff' }}>Rally Logistics</span>
            <p className="text-white/30 text-[10px] leading-none mt-0.5">by RallyHQ</p>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <a href="https://www.rallygo.co.uk/competitor" className="text-xs no-underline" style={{ color: 'rgba(255,255,255,0.75)' }}>‹ RallyHQ</a>
          {user ? (
            <Link to="/account"
              className="w-11 h-11 rounded-full bg-rl-accent/15 border border-rl-accent/25 flex items-center justify-center no-underline hover:bg-rl-accent/25 transition-colors"
              title={user.email}>
              <span className="text-rl-accent font-bold text-sm">
                {user.email?.[0]?.toUpperCase()}
              </span>
            </Link>
          ) : (
            <Link to="/login" className="rl-btn-primary text-xs px-3 py-1.5">Sign in</Link>
          )}
        </div>
      </div>
    </nav>
  )
}
