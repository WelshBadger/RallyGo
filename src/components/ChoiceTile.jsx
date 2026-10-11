import { Link } from 'react-router-dom'

const Arrow = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 16 16" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.75a.75.75 0 010-1.5h7.44L8.22 4.03a.75.75 0 010-1.06z" clipRule="evenodd" />
  </svg>
)

// Large tile for the "who are you / where next" choice screens.
// Pass `to` for an in-app route or `href` for an external link.
// `index` staggers the entrance animation (0, 1, 2 ...).
// `layout` is 'card' (tall tile, the opening screen) or 'row' (wide strip, second-level screens).
export default function ChoiceTile({ to, href, color, icon, label, sub, cta = 'Enter', index = 0, layout = 'card' }) {
  const Comp = href ? 'a' : Link
  const compProps = href ? { href } : { to }
  const row = layout === 'row'

  return (
    <Comp
      {...compProps}
      className={`choice-tile ${row ? 'choice-tile-row' : ''} group relative block overflow-hidden no-underline border border-white/10 active:scale-[0.97] ${
        row ? 'rounded-2xl p-4 sm:p-5' : 'rounded-3xl min-h-[200px] sm:min-h-[230px] p-6 sm:p-7'
      }`}
      style={{
        '--tile': color,
        animationDelay: `${index * 110}ms`,
        background: row
          ? `linear-gradient(100deg, ${color}22 0%, #1f1f1f 55%, #181818 100%)`
          : `linear-gradient(145deg, ${color}22 0%, #1f1f1f 50%, #181818 100%)`,
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
          style={{ background: `linear-gradient(180deg, ${color}00, ${color}38, ${color}00)` }}
        />
        <div
          className="choice-stripe absolute top-[-20%] right-[8%] h-[160%] w-2 -skew-x-[28deg]"
          style={{ background: `linear-gradient(180deg, ${color}00, ${color}55, ${color}00)`, animationDelay: '0.4s' }}
        />
      </div>

      {/* bright top edge */}
      <div
        className="absolute top-0 left-6 right-6 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
      />

      {row ? (
        <div className="relative flex items-center gap-4">
          <div
            className="choice-icon w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${color}26`, color, boxShadow: `0 0 0 1px ${color}55, 0 8px 24px ${color}33` }}
          >
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-lg sm:text-xl font-semibold leading-tight tracking-tight mb-1">{label}</p>
            <p className="text-white/85 text-sm leading-snug">{sub}</p>
          </div>
          <div
            className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-200 group-hover:translate-x-1"
            style={{ background: color, color: '#0f0f0f', boxShadow: `0 6px 18px ${color}55` }}
            aria-label={cta}
          >
            <Arrow />
          </div>
        </div>
      ) : (
        <div className="relative flex flex-col h-full min-h-[150px] sm:min-h-[180px]">
          <div
            className="choice-icon w-14 h-14 rounded-2xl flex items-center justify-center mb-5 flex-shrink-0"
            style={{ background: `${color}26`, color, boxShadow: `0 0 0 1px ${color}55, 0 8px 24px ${color}33` }}
          >
            {icon}
          </div>

          <div className="flex-1">
            <p className="text-white text-xl sm:text-2xl font-semibold leading-tight tracking-tight mb-2">{label}</p>
            <p className="text-white/85 text-sm leading-snug max-w-[28ch] sm:max-w-none">{sub}</p>
          </div>

          <div
            className="mt-5 inline-flex items-center gap-2 self-start rounded-full px-4 py-2 text-sm font-bold transition-all duration-200 group-hover:gap-3"
            style={{ background: color, color: '#0f0f0f', boxShadow: `0 6px 20px ${color}55` }}
          >
            {cta}
            <Arrow className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </div>
        </div>
      )}
    </Comp>
  )
}
