import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 no-underline group">
      <img src="/icons/logo-circle.png" alt="" width="28" height="28" className="w-7 h-7 flex-shrink-0" />
      <span className="text-white font-semibold text-base tracking-tight">
        Rally<span className="text-rl-accent">HQ</span>
      </span>
    </Link>
  )
}

export default function Navbar() {
  const { user, profile, signOut, isOrganiser, isSuperAdmin } = useAuth()
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
      {/* paddingTop keeps the bar below the phone's status bar / notch (installed app) */}
      <nav style={{ paddingTop: 'var(--safe-top, env(safe-area-inset-top, 0px))' }} className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/95 backdrop-blur-md shadow-[0_1px_0_0_rgba(255,255,255,0.06)]'
          : 'bg-white'
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
            {(isOrganiser || isSuperAdmin) && (
              <NavLink to="/organiser" active={isActive('/organiser')}>Dashboard</NavLink>
            )}
            {isSuperAdmin && (
              <NavLink to="/admin" active={isActive('/admin')}>Admin</NavLink>
            )}
            {isSuperAdmin && (
              <NavLink to="/reports" active={isActive('/reports')}>Reports</NavLink>
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
                <Link to="/login" className="text-white/50 hover:text-white text-sm transition-colors">Organiser sign in</Link>
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
          <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-white/10 rounded-t-2xl overflow-hidden">
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
              }>Home</MobileNavLink>

              {(isOrganiser || isSuperAdmin) && (
                <MobileNavLink to="/organiser" active={isActive('/organiser')} onClick={() => setMenuOpen(false)} icon={
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <rect x="2" y="2" width="5.5" height="5.5" rx="1" />
                    <rect x="8.5" y="2" width="5.5" height="5.5" rx="1" />
                    <rect x="2" y="8.5" width="5.5" height="5.5" rx="1" />
                    <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1" />
                  </svg>
                }>Dashboard</MobileNavLink>
              )}
              {isSuperAdmin && (
                <MobileNavLink to="/admin" active={isActive('/admin')} onClick={() => setMenuOpen(false)} icon={
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 2a1 1 0 011 1v1.5h2.5a1 1 0 011 1v8a1 1 0 01-1 1H4.5a1 1 0 01-1-1v-8a1 1 0 011-1H7V3a1 1 0 011-1zM6 7h4M6 10h2" />
                  </svg>
                }>Admin</MobileNavLink>
              )}
              {isSuperAdmin && (
                <MobileNavLink to="/reports" active={isActive('/reports')} onClick={() => setMenuOpen(false)} icon={
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2 14h12M4 11V7M8 11V3M12 11V6" />
                  </svg>
                }>Reports</MobileNavLink>
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
                <div className="pt-2">
                  <Link
                    to="/login"
                    onClick={() => setMenuOpen(false)}
                    className="block text-center w-full py-3 rounded-xl border border-white/10 text-white/70 text-sm hover:border-white/25 transition-all no-underline"
                  >
                    Organiser sign in
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
