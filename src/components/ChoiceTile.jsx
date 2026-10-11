import { Link } from 'react-router-dom'

// Large tile for the "who are you / where next" choice screens.
// Pass `to` for an in-app route or `href` for an external link.
// `index` staggers the entrance animation (0, 1, 2 ...).
export default function ChoiceTile({ to, href, color, icon, label, sub, cta = 'Enter', index = 0 }) {
  const Comp = href ? 'a' : Link
  const compProps = href ? { href } : { to }
  return (
    <Comp
      {...compProps}
      className="choice-tile group relative block overflow-hidden rounded-3xl no-underline border border-white/10 min-h-[200px] sm:min-h-[230px] p-6 sm:p-7 active:scale-[0.97] transition-transform duration-200"
      style={{
        '--tile': color,
        animationDelay: `${index * 110}ms`,
        background: `linear-gradient(145deg, ${color}2e 0%, #222222 55%, #1a1a1a 100%)`,
      }}
    >
      {/* soft colour glow that breathes */}
      <div
        className="choice-glow pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full blur-3xl"
        style={{ background: color }}
      />

      {/* racing stripes, echoing the R logo */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="choice-stripe absolute top-[-20%] right-[18%] h-[160%] w-5 -skew-x-[28deg]"
          style={{ background: `linear-gradient(180deg, ${color}00, ${color}66, ${color}00)` }}
        />
        <div
          className="choice-stripe absolute top-[-20%] right-[8%] h-[160%] w-2 -skew-x-[28deg]"
          style={{ background: `linear-gradient(180deg, ${color}00, ${color}99, ${color}00)`, animationDelay: '0.4s' }}
        />
      </div>

      {/* bright top edge */}
      <div
        className="absolute top-0 left-6 right-6 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
      />

      <div className="relative flex flex-col h-full min-h-[150px] sm:min-h-[180px]">
        <div
          className="choice-icon w-14 h-14 rounded-2xl flex items-center justify-center mb-5 flex-shrink-0"
          style={{ background: `${color}26`, color, boxShadow: `0 0 0 1px ${color}55, 0 8px 24px ${color}33` }}
        >
          {icon}
        </div>

        <div className="flex-1">
          <p className="text-white text-xl sm:text-2xl font-semibold leading-tight tracking-tight mb-2">{label}</p>
          <p className="text-white/55 text-sm leading-snug max-w-[26ch] sm:max-w-none">{sub}</p>
        </div>

        <div className="mt-5 inline-flex items-center gap-2 self-start rounded-full px-4 py-2 text-sm font-semibold text-white transition-all duration-200 group-hover:gap-3"
          style={{ background: color, boxShadow: `0 6px 20px ${color}55` }}
        >
          {cta}
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5">
            <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.75a.75.75 0 010-1.5h7.44L8.22 4.03a.75.75 0 010-1.06z" clipRule="evenodd" />
          </svg>
        </div>
      </div>
    </Comp>
  )
}
