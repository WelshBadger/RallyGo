import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { useState, useEffect } from 'react'
import Navbar from './components/Navbar'
import HomePage from './pages/HomePage'
import CalendarPage from './pages/CalendarPage'
import CalendarEventPage from './pages/CalendarEventPage'
import EventPage from './pages/EventPage'
import SectionPage from './pages/SectionPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import OrganizerDashboard from './pages/OrganizerDashboard'
import CreateEventPage from './pages/CreateEventPage'
import ManageEventPage from './pages/ManageEventPage'
import PaymentSuccessPage from './pages/PaymentSuccessPage'
import AdminPage from './pages/AdminPage'
import NewsPostPage, { NewsIndexPage } from './pages/NewsPage'

function ProtectedOrganiser({ children }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center min-h-screen"><LoadingSpinner /></div>
  if (!user) return <Navigate to="/login" replace />
  if (profile?.role !== 'organiser') return <Navigate to="/" replace />
  return children
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center min-h-screen"><LoadingSpinner /></div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function LoadingSpinner() {
  return (
    <div className="w-8 h-8 border-2 border-white/10 border-t-rl-accent rounded-full animate-spin" />
  )
}

function SplashScreen({ onDone }) {
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setFading(true), 1600)
    const t2 = setTimeout(() => onDone(), 2100)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onDone])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#0d0d14',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        transition: 'opacity 0.5s ease',
        opacity: fading ? 0 : 1,
        pointerEvents: 'none',
      }}
    >
      {/* Logo mark */}
      <div style={{
        width: 64, height: 64,
        background: 'linear-gradient(135deg, #e63946, #c1121f)',
        borderRadius: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 18,
        boxShadow: '0 0 40px rgba(230,57,70,0.35)',
      }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      </div>

      {/* Wordmark */}
      <div style={{ fontSize: 30, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px', marginBottom: 8 }}>
        Rally<span style={{ color: '#e63946' }}>Go</span>
      </div>

      {/* Tagline */}
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em' }}>
        UK Rally Motorsport
      </div>

      {/* Subtle bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: 3,
        background: 'linear-gradient(to right, transparent, #e63946, transparent)',
        animation: 'splash-bar 1.6s ease-in-out forwards',
      }} />

      <style>{`
        @keyframes splash-bar {
          from { transform: scaleX(0); opacity: 0 }
          to   { transform: scaleX(1); opacity: 1 }
        }
      `}</style>
    </div>
  )
}

export default function App() {
  const [showSplash, setShowSplash] = useState(() => !sessionStorage.getItem('splashSeen'))

  function handleSplashDone() {
    sessionStorage.setItem('splashSeen', '1')
    setShowSplash(false)
  }

  return (
    <div className="min-h-screen bg-rl-bg text-white">
      {showSplash && <SplashScreen onDone={handleSplashDone} />}
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/calendar/event/:id" element={<CalendarEventPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/event/:rallyId" element={<EventPage />} />
        <Route path="/event/:rallyId/:section" element={<ProtectedRoute><SectionPage /></ProtectedRoute>} />
        <Route path="/news" element={<NewsIndexPage />} />
        <Route path="/news/:id" element={<NewsPostPage />} />
        <Route path="/payment-success" element={<PaymentSuccessPage />} />
        <Route path="/organiser" element={
          <ProtectedOrganiser><OrganizerDashboard /></ProtectedOrganiser>
        } />
        <Route path="/organiser/create" element={
          <ProtectedOrganiser><CreateEventPage /></ProtectedOrganiser>
        } />
        <Route path="/organiser/event/:rallyId" element={
          <ProtectedOrganiser><ManageEventPage /></ProtectedOrganiser>
        } />
        <Route path="/admin" element={
          <ProtectedOrganiser><AdminPage /></ProtectedOrganiser>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
