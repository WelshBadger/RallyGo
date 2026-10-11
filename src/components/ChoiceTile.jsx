import { Link } from 'react-router-dom'

const Arrow = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 16 16" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.75a.75.75 0 010-1.5h7.44L8.22 4.03a.75.75 0 010-1.06z" clipRule="evenodd" />
  </svg>
)

// NOTE: the app is a light theme, and src/index.css remaps the "white" text and
// dark background utilities. So this component sets its own colours (slate text,
// explicit hex) rather than using text-white / bg-rl-card.
//
// Large tile for the "who are you / where next" choice screens.
// `color` should be a deep, readable accent (white text sits on it).
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
      className={`choice-tile ${row ? 'choice-tile-row' : ''} group relative block overflow-hidden no-underline active:scale-[0.97] ${
        row ? 'rounded-2xl p-4 sm:p-5' : 'rounded-3xl min-h-[200px] sm:min-h-[230px] p-6 sm:p-7'
      }`}
      style={{
        '--tile': color,
        animationDelay: `${index * 110}ms`,
        backgroundColor: '#ffffff',
        backgroundImage: row
          ? `linear-gradient(100deg, ${color}1f 0%, #ffffff 65%)`
          : `linear-gradient(150deg, ${color}26 0%, #ffffff 62%)`,
        border: `1px solid ${color}38`,
      }}
    >
      {/* soft colour glow that breathes (kept to the corner, away from the text) */}
      <div
        className="choice-glow pointer-events-none absolute -top-20 -right-20 w-56 h-56 rounded-full blur-3xl"
        style={{ background: color }}
      />

      {/* racing stripes, echoing the R logo */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="choice-stripe absolute top-[-20%] right-[14%] h-[160%] w-5 -skew-x-[28deg]"
          style={{ background: `linear-gradient(180deg, ${color}00, ${color}26, ${color}00)` }}
        />
        <div
          className="choice-stripe absolute top-[-20%] right-[5%] h-[160%] w-2 -skew-x-[28deg]"
          style={{ background: `linear-gradient(180deg, ${color}00, ${color}40, ${color}00)`, animationDelay: '0.4s' }}
        />
      </div>

      {/* bright top edge */}
      <div
        className="absolute top-0 left-6 right-6 h-[3px] rounded-b-full"
        style={{ background: color }}
      />

      {row ? (
        <div className="relative flex items-center gap-4">
          <div
            className="choice-icon w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${color}1a`, color, boxShadow: `inset 0 0 0 1px ${color}40` }}
          >
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-900 text-lg sm:text-xl font-bold leading-tight tracking-tight mb-1">{label}</p>
            <p className="text-slate-600 text-sm leading-snug">{sub}</p>
          </div>
          <div
            className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-200 group-hover:translate-x-1"
            style={{ background: color, color: '#ffffff', boxShadow: `0 6px 16px ${color}40` }}
            aria-label={cta}
          >
            <Arrow />
          </div>
        </div>
      ) : (
        <div className="relative flex flex-col h-full min-h-[150px] sm:min-h-[180px]">
          <div
            className="choice-icon w-14 h-14 rounded-2xl flex items-center justify-center mb-5 flex-shrink-0"
            style={{ background: `${color}1a`, color, boxShadow: `inset 0 0 0 1px ${color}40` }}
          >
            {icon}
          </div>

          <div className="flex-1">
            <p className="text-slate-900 text-xl sm:text-2xl font-bold leading-tight tracking-tight mb-2">{label}</p>
            <p className="text-slate-600 text-sm leading-snug max-w-[30ch] sm:max-w-none">{sub}</p>
          </div>

          <div
            className="mt-5 inline-flex items-center gap-2 self-start rounded-full px-5 py-2.5 text-sm font-bold transition-all duration-200 group-hover:gap-3"
            style={{ background: color, color: '#ffffff', boxShadow: `0 6px 18px ${color}40` }}
          >
            {cta}
            <Arrow className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </div>
        </div>
      )}
    </Comp>
  )
}
