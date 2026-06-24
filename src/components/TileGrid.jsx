import { Link } from 'react-router-dom'

const SECTIONS = [
  {
    key: 'pre-event',
    label: 'Pre-event info',
    sub: 'Entry list · Schedule · Regs',
    color: '#E24B4A',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
      </svg>
    ),
  },
  {
    key: 'route',
    label: 'Route information',
    sub: 'Maps · Road book · Stages',
    color: '#378ADD',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <circle cx="6" cy="19" r="3" /><circle cx="18" cy="5" r="3" /><path d="M12 19h4.5a3.5 3.5 0 000-7h-8a3.5 3.5 0 010-7H12" />
      </svg>
    ),
  },
  {
    key: 'bulletins',
    label: 'Live bulletins',
    sub: 'Official notices · Decisions',
    color: '#E24B4A',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M2 12a10 10 0 1020 0 10 10 0 00-20 0" /><path d="M12 8v4l3 3" />
      </svg>
    ),
  },
  {
    key: 'team',
    label: 'Organising team',
    sub: 'Contacts · Radio channels',
    color: '#1D9E75',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    key: 'accommodation',
    label: 'Accommodation',
    sub: 'Hotels · Service park info',
    color: '#7F77DD',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
      </svg>
    ),
  },
  {
    key: 'results',
    label: 'Live results',
    sub: 'Stage times · Overall',
    color: '#BA7517',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M6 9H4.5a2.5 2.5 0 010-5H6" /><path d="M18 9h1.5a2.5 2.5 0 000-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0012 0V2z" />
      </svg>
    ),
  },
]

export default function TileGrid({ rallyId, newCounts = {} }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
      {SECTIONS.map((section) => {
        const newCount = newCounts[section.key] || 0
        return (
          <Link
            key={section.key}
            to={`/event/${rallyId}/${section.key}`}
            className="group relative bg-rl-card border border-white/10 rounded-2xl p-4 sm:p-4 hover:border-white/25 active:scale-[0.97] transition-all duration-150 no-underline min-h-[120px] flex flex-col"
          >
            {/* Coloured accent strip */}
            <div
              className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl"
              style={{ background: section.color }}
            />

            {/* New badge */}
            {newCount > 0 && (
              <span className="absolute top-3 right-3 bg-rl-accent text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none">
                {newCount}
              </span>
            )}

            {/* Icon */}
            <div className="mb-3 mt-1 flex-shrink-0" style={{ color: section.color }}>
              {section.icon}
            </div>

            {/* Label */}
            <div className="flex-1">
              <p className="text-white text-sm font-medium leading-tight mb-1">{section.label}</p>
              <p className="text-white/40 text-[11px] leading-tight hidden sm:block">{section.sub}</p>
            </div>

            {/* Arrow */}
            <div className="absolute bottom-3.5 right-3.5 text-white/20 group-hover:text-white/50 transition-colors">
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.75a.75.75 0 010-1.5h7.44L8.22 4.03a.75.75 0 010-1.06z" clipRule="evenodd" />
              </svg>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
