import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 no-underline group">
      {/* Mark: stacked chevrons suggesting speed/stages */}
      <svg width="22" height="20" viewBox="0 0 22 20" fill="none" className="flex-shrink-0">
        <path d="M2 10 L8 3 L14 10 L8 17 Z" fill="#E24B4A" opacity="0.9" />
        <path d="M8 10 L14 3 L20 10 L14 17 Z" fill="#E24B4A" opacity="0.45" />
      </svg>
      <span className="text-white font-semibold text-base tracking-tight">
        Rally<span className="text-rl-accent">Go</span>
      </span>
    </Link>
  )
}

export default function Navbar() {
  const { user, profile, signOut, isOrganiser } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  async function handleSignOut() {
    setMenuOpen(false)
    await signOut()
    toast.success('Signed out')
    navigate('/')
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.[0]?.toUpperCase() || '?'

  return (
    <>
      <nav className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-[#111]/95 backdrop-blur-md shadow-[0_1px_0_0_rgba(255,255,255,0.06)]'
          : 'bg-transparent'
      }`}>
        {/* Animated accent line */}
        <div className="absolute bottom-0 left-0 right-0 h-px overflow-hidden">
          <div className={`navbar-glow absolute inset-0 bg-rl-accent/30 transition-opacity duration-300 ${scrolled ? 'opacity-100' : 'opacity-0'}`} />
          <div className="navbar-shimmer absolute top-0 left-0" />
        </div>

        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Logo />

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            <NavLink to="/" active={isActive('/')}>Calendar</NavLink>
            {isOrganiser && (
              <NavLink to="/organiser" active={isActive('/organiser')}>Dashboard</NavLink>
            )}
          </div>

          {/* Desktop right */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-rl-accent/20 border border-rl-accent/30 flex items-center justify-center">
                    <span className="text-rl-accent text-[10px] font-semibold">{initials}</span>
                  </div>
                  <span className="text-white/40 text-xs max-w-[140px] truncate">
                    {profile?.full_name || user.email}
                  </span>
                </div>
                <button onClick={handleSignOut} className="rl-btn-ghost text-xs px-3 py-1.5">
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-white/50 hover:text-white text-sm transition-colors">Sign in</Link>
                <Link to="/register" className="rl-btn-primary text-xs px-4 py-2">Register</Link>
              </>
            )}
          </div>

          {/* Mobile: avatar or hamburger */}
          <button
            className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-all"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
              <rect y="2" width="18" height="1.5" rx="0.75" />
              <rect y="8.25" width="18" height="1.5" rx="0.75" />
              <rect y="14.5" width="18" height="1.5" rx="0.75" />
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex flex-col">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />

          {/* Panel — slides up from bottom */}
          <div className="absolute bottom-0 left-0 right-0 bg-[#161616] border-t border-white/10 rounded-t-2xl overflow-hidden">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/15" />
            </div>

            {/* User info */}
            {user && (
              <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8">
                <div className="w-9 h-9 rounded-full bg-rl-accent/20 border border-rl-accent/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-rl-accent text-xs font-semibold">{initials}</span>
                </div>
                <div className="min-w-0">
                  {profile?.full_name && (
                    <p className="text-white text-sm font-medium truncate">{profile.full_name}</p>
                  )}
                  <p className="text-white/40 text-xs truncate">{user.email}</p>
                </div>
              </div>
            )}

            {/* Nav links */}
            <div className="px-3 py-3 space-y-1">
              <MobileNavLink to="/" active={isActive('/')} onClick={() => setMenuOpen(false)} icon={
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2 6.5L8 2l6 4.5V14a.5.5 0 01-.5.5h-3.75v-3.75h-3.5V14.5H2.5A.5.5 0 012 14V6.5z" />
                </svg>
              }>Calendar</MobileNavLink>

              {isOrganiser && (
                <MobileNavLink to="/organiser" active={isActive('/organiser')} onClick={() => setMenuOpen(false)} icon={
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <rect x="2" y="2" width="5.5" height="5.5" rx="1" />
                    <rect x="8.5" y="2" width="5.5" height="5.5" rx="1" />
                    <rect x="2" y="8.5" width="5.5" height="5.5" rx="1" />
                    <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1" />
                  </svg>
                }>Dashboard</MobileNavLink>
              )}
            </div>

            {/* Account actions */}
            <div className="px-3 pb-4 pt-1 border-t border-white/8">
              {user ? (
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-white/50 hover:text-white hover:bg-white/5 transition-all text-sm"
                >
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6" />
                  </svg>
                  Sign out
                </button>
              ) : (
                <div className="space-y-2 pt-2">
                  <Link
                    to="/login"
                    onClick={() => setMenuOpen(false)}
                    className="block text-center w-full py-3 rounded-xl border border-white/10 text-white/70 text-sm hover:border-white/25 transition-all no-underline"
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setMenuOpen(false)}
                    className="block text-center w-full py-3 rounded-xl bg-rl-accent text-white text-sm font-medium hover:bg-rl-accent/90 transition-all no-underline"
                  >
                    Register
                  </Link>
                </div>
              )}
            </div>

            {/* Safe area spacer */}
            <div className="h-safe-bottom" style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
          </div>
        </div>
      )}
    </>
  )
}

function NavLink({ to, active, children }) {
  return (
    <Link
      to={to}
      className={`px-3 py-1.5 rounded-lg text-sm transition-all no-underline ${
        active
          ? 'text-white bg-white/8 font-medium'
          : 'text-white/50 hover:text-white hover:bg-white/5'
      }`}
    >
      {children}
    </Link>
  )
}

function MobileNavLink({ to, active, onClick, icon, children }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm transition-all no-underline ${
        active
          ? 'text-white bg-white/8 font-medium'
          : 'text-white/50 hover:text-white hover:bg-white/5'
      }`}
    >
      <span className={active ? 'text-rl-accent' : 'text-white/30'}>{icon}</span>
      {children}
    </Link>
  )
}
