import { Link } from 'react-router-dom'
import PageHero from '../components/PageHero'

export default function NotFoundPage() {
  return (
    <>
      <PageHero title="Page not found" sub="That page doesn't exist or has moved." />
      <main className="max-w-md mx-auto px-4 py-8 text-center">
        <Link to="/" className="rl-btn-primary inline-block">Back to events</Link>
      </main>
    </>
  )
}
