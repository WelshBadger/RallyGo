import { Link } from 'react-router-dom'

export default function BackButton({ to, label = 'Back' }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/7 border border-white/12 hover:bg-white/12 hover:border-white/22 transition-all text-white/60 hover:text-white text-sm font-medium no-underline"
    >
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
        <path fillRule="evenodd" d="M7.78 12.53a.75.75 0 01-1.06 0L2.47 8.28a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 1.06L4.81 7h7.44a.75.75 0 010 1.5H4.81l2.97 2.97a.75.75 0 010 1.06z" clipRule="evenodd" />
      </svg>
      {label}
    </Link>
  )
}
