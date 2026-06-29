import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
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

export default function App() {
  return (
    <div className="min-h-screen bg-rl-bg text-white">
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/calendar/event/:id" element={<CalendarEventPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/event/:rallyId" element={<EventPage />} />
        <Route path="/event/:rallyId/:section" element={<ProtectedRoute><SectionPage /></ProtectedRoute>} />
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
