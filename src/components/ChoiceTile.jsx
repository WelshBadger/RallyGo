import { Link } from 'react-router-dom'

// Large tile for the "who are you / where next" choice screens.
// Pass `to` for an in-app route or `href` for an external link.
export default function ChoiceTile({ to, href, color, icon, label, sub }) {
  const Comp = href ? 'a' : Link
  const compProps = href ? { href } : { to }
  return (
    <Comp
      {...compProps}
      className="group relative bg-rl-card border border-white/10 rounded-2xl p-5 sm:p-6 hover:border-white/25 active:scale-[0.97] transition-all duration-150 no-underline min-h-[168px] flex flex-col"
    >
      <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl" style={{ background: color }} />

      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 mt-1 flex-shrink-0"
        style={{ background: color + '1f', color }}
      >
        {icon}
      </div>

      <div className="flex-1 pr-5">
        <p className="text-white text-lg font-semibold leading-tight mb-1.5">{label}</p>
        <p className="text-white/45 text-sm leading-snug">{sub}</p>
      </div>

      <div className="absolute bottom-4 right-4 text-white/20 group-hover:text-white/50 transition-colors">
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
          <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.75a.75.75 0 010-1.5h7.44L8.22 4.03a.75.75 0 010-1.06z" clipRule="evenodd" />
        </svg>
      </div>
    </Comp>
  )
}
