import ChoiceTile from '../components/ChoiceTile'

const iconProps = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75,
  strokeLinecap: 'round', strokeLinejoin: 'round', className: 'w-6 h-6',
}

export default function ChoicePage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 sm:py-16">
      <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight mb-1">Welcome to RallyHQ</h1>
      <p className="text-white/40 text-sm mb-7">How are you taking part?</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ChoiceTile
          to="/organiser"
          color="#E24B4A"
          label="Rally organiser"
          sub="Add your rallies, upload documents and keep event information up to date."
          icon={
            <svg {...iconProps}>
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
              <path d="M9 12h6M9 16h4" />
            </svg>
          }
        />
        <ChoiceTile
          to="/competitor"
          color="#378ADD"
          label="Competitor"
          sub="Rally information from the organisers, and logistics for your crew."
          icon={
            <svg {...iconProps}>
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
          }
        />
      </div>
    </main>
  )
}
