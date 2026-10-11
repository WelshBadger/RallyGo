import ChoiceTile from '../components/ChoiceTile'

const iconProps = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75,
  strokeLinecap: 'round', strokeLinejoin: 'round', className: 'w-6 h-6',
}

export default function ChoicePage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10 sm:py-16">
      <div className="choice-hero mb-8 sm:mb-10 text-center sm:text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#FF9641] mb-3">RallyHQ</p>
        <h1 className="text-3xl sm:text-5xl font-bold text-white tracking-tight leading-[1.05] mb-3">
          Choose your role
        </h1>
        <p className="text-white/80 text-sm sm:text-base">How are you taking part?</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
        <ChoiceTile
          index={0}
          cta="Organise"
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
          index={1}
          cta="Compete"
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
