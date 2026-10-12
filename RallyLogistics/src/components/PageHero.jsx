import { Link } from 'react-router-dom'

const BackIcon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
    <path fillRule="evenodd" d="M7.78 12.53a.75.75 0 01-1.06 0L2.47 8.28a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 1.06L4.81 7h7.44a.75.75 0 010 1.5H4.81l2.97 2.97a.75.75 0 010 1.06z" clipRule="evenodd" />
  </svg>
)

// Orange page header cut on the R-logo angle. Used at the top of the simple screens.
// back: { to, label }   action: { to, label }
export default function PageHero({ title, sub, back, action }) {
  return (
    <div className="hero-orange">
      {back && (back.onClick
        ? <button type="button" onClick={back.onClick} className="back" style={{ border: 0, cursor: 'pointer', font: 'inherit', fontWeight: 700, fontSize: 14 }}><BackIcon /> {back.label}</button>
        : <Link to={back.to} className="back"><BackIcon /> {back.label}</Link>)}
      <h1 className={`display ${title.length > 12 ? 'long' : ''}`}>{title}</h1>
      {sub && <p>{sub}</p>}
      {action && <Link to={action.to} className="hero-cta">{action.label}</Link>}
    </div>
  )
}
