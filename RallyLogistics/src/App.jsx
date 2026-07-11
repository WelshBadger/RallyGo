import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import LoginPage from './pages/LoginPage'
import RallySelectPage from './pages/RallySelectPage'
import PackPage from './pages/PackPage'
import SharedPackPage from './pages/SharedPackPage'
import AccountPage from './pages/AccountPage'
import NotFoundPage from './pages/NotFoundPage'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-6 h-6 border-2 border-white/10 border-t-rl-accent rounded-full animate-spin" /></div>
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/shared/:shareCode" element={<SharedPackPage />} />
        <Route path="/" element={<PrivateRoute><RallySelectPage /></PrivateRoute>} />
        <Route path="/pack/:rallyId" element={<PrivateRoute><PackPage /></PrivateRoute>} />
        <Route path="/account" element={<PrivateRoute><AccountPage /></PrivateRoute>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  )
}
