import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <main className="max-w-md mx-auto px-4 py-24 text-center">
      <p className="text-white/20 text-6xl font-bold mb-4">404</p>
      <h1 className="text-white text-xl font-semibold mb-2">Page not found</h1>
      <p className="text-white/40 text-sm mb-8">The page you're looking for doesn't exist or has been moved.</p>
      <Link to="/" className="rl-btn-primary inline-block">Back to home</Link>
    </main>
  )
}
