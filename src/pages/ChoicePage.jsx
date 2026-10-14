import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

const Arrow = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 17L17 7M8 7h9v9" />
  </svg>
)

// A rally stage drawn as a line: start dot, finish dot. Purely decorative.
const Route = ({ d, start, finish }) => (
  <svg className="slab-route" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <path d={d} pathLength="1" />
    <circle cx={start[0]} cy={start[1]} r="7" />
    <circle cx={finish[0]} cy={finish[1]} r="7" />
  </svg>
)

const SLABS = [
  {
    id: 'organiser',
    to: '/organiser',
    word: 'Organiser',
    line: 'Add your rallies, upload documents and keep everyone up to date.',
    route: <Route d="M-10 232 C70 250 96 120 168 138 S262 252 318 176 S384 70 420 52" start={[36, 244]} finish={[372, 92]} />,
  },
  {
    id: 'competitor',
    to: '/competitor',
    word: 'Competitor',
    line: 'Rally info from the organisers, and logistics for your crew.',
    route: <Route d="M-10 70 C60 40 110 150 190 140 S300 40 340 118 S400 230 420 250" start={[30, 62]} finish={[360, 160]} />,
  },
]

export default function ChoicePage() {
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(null)

  // Tap: the chosen slab swallows the screen, then the next page opens,
  // so it feels like you've gone somewhere.
  function choose(e, slab) {
    if (leaving) return e.preventDefault()
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    e.preventDefault()
    setLeaving(slab.id)
    setTimeout(() => navigate(slab.to), 380)
  }

  return (
    <main className="slab-page">
      <div className="slab-title">
        <h1 className="display">Choose your role</h1>
        <p>How are you taking part?</p>
      </div>

      <div className={`slab-stack ${leaving ? 'is-leaving' : ''}`}>
        {SLABS.map(slab => (
          <Link
            key={slab.id}
            to={slab.to}
            onClick={e => choose(e, slab)}
            className={`slab slab-${slab.id} ${leaving === slab.id ? 'is-chosen' : ''}`}
          >
            {slab.route}
            <p className="slab-word display">{slab.word}</p>
            <p className="slab-line">{slab.line}</p>
            <span className="slab-go"><Arrow /></span>
          </Link>
        ))}
      </div>
    </main>
  )
}
