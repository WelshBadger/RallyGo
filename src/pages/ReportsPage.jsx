import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { AnalyticsTab } from './AdminPage'

// Private reporting for the super admin: everything happening across RallyHQ and
// Rally Logistics, from the admin_report() database function (admin-only).

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'rallies', label: 'Rallies' },
  { id: 'people', label: 'People' },
  { id: 'logistics', label: 'Logistics' },
  { id: 'visitors', label: 'Website visitors' },
]

const SERIES_COLOUR = '#2f6fd6' // validated single-series hue (light surface)

const nf = new Intl.NumberFormat('en-GB')
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
function ago(ts) {
  if (!ts) return 'never'
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return d < 60 ? `${d}d ago` : fmtDate(ts)
}

export default function ReportsPage() {
  const [tab, setTab] = useState('overview')
  const [drill, setDrill] = useState({}) // preset filter / sort for the detail tab a tile opened

  function openDetail(nextTab, preset = {}) {
    setDrill({ ...preset, at: Date.now() })
    setTab(nextTab)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data: res, error: err } = await supabase.rpc('admin_report')
    if (err) setError(err.message)
    else setData(res)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Reports</h1>
          <p className="text-white/35 text-sm">
            Everything happening across RallyHQ and Rally Logistics
            {data?.generated_at && ` · updated ${new Date(data.generated_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
          </p>
        </div>
        <button onClick={load} disabled={loading} className="rl-btn-ghost text-xs flex-shrink-0">
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setDrill({}); setTab(t.id) }}
            className={`px-3.5 py-2 rounded-lg text-sm whitespace-nowrap transition-all ${
              tab === t.id ? 'bg-rl-accent text-white font-medium' : 'text-white/50 hover:text-white hover:bg-white/5'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'visitors' ? (
        <AnalyticsTab />
      ) : error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : !data ? (
        <div className="h-64 bg-white/5 rounded-2xl animate-pulse" />
      ) : (
        <>
          {tab === 'overview' && <Overview data={data} onOpen={openDetail} />}
          {tab === 'rallies' && <RalliesReport key={drill.at || 0} rallies={data.rallies} preset={drill} />}
          {tab === 'people' && <PeopleReport key={drill.at || 0} people={data.people} preset={drill} />}
          {tab === 'logistics' && <LogisticsReport key={drill.at || 0} data={data} preset={drill} />}
        </>
      )}
    </main>
  )
}

// ─── Overview ────────────────────────────────────────────────────────────────

function Stat({ label, value, sub, onClick }) {
  const inner = (
    <>
      <p className="text-white/40 text-[11px] uppercase tracking-wide mb-1.5 pr-4">{label}</p>
      <p className="text-white text-2xl font-semibold leading-none">{typeof value === 'number' ? nf.format(value) : value}</p>
      {sub && <p className="text-white/35 text-xs mt-1.5">{sub}</p>}
      {onClick && <span className="absolute top-3 right-3 text-white/25 group-hover:text-rl-accent transition-colors" aria-hidden="true">›</span>}
    </>
  )
  return onClick ? (
    <button type="button" onClick={onClick}
      className="group relative text-left bg-rl-card border border-white/10 rounded-xl p-4 hover:border-rl-accent/50 active:scale-[0.98] transition-all">
      {inner}
    </button>
  ) : (
    <div className="relative bg-rl-card border border-white/10 rounded-xl p-4">{inner}</div>
  )
}

function Overview({ data, onOpen }) {
  const t = data.totals
  const daily = data.daily || []
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-3">People</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Accounts" value={t.accounts} sub={`${t.new_7d} new in 7 days`} onClick={() => onOpen('people', { activity: 'all' })} />
          <Stat label="Active today" value={t.active_24h} sub={`${t.active_7d} in 7 days`} onClick={() => onOpen('people', { activity: '24h' })} />
          <Stat label="Organisers" value={t.organisers} onClick={() => onOpen('people', { type: 'Organiser' })} />
          <Stat label="Guests" value={t.guests} sub="Joined packs by share link" onClick={() => onOpen('people', { type: 'Guest' })} />
        </div>
      </section>

      <section>
        <h2 className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-3">RallyHQ</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Rallies" value={t.rallies} sub={`${t.rallies_active} active · ${t.calendar_events} on calendar`} onClick={() => onOpen('rallies', { sort: 'date' })} />
          <Stat label="Devices opened with a code" value={t.code_devices} sub={`${t.code_devices_24h} in the last 24h`} onClick={() => onOpen('rallies', { sort: 'code_devices' })} />
          <Stat label="Bulletin alert sign-ups" value={t.alert_signups} onClick={() => onOpen('rallies', { sort: 'alerts' })} />
          <Stat label="Documents posted" value={t.documents} onClick={() => onOpen('rallies', { sort: 'documents' })} />
        </div>
      </section>

      <section>
        <h2 className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-3">Rally Logistics</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Packs" value={t.packs} sub={`${t.pack_members} people added to packs`} onClick={() => onOpen('logistics', {})} />
          <Stat label="Sharing location now" value={t.sharing_now} onClick={() => onOpen('logistics', { sharing: true })} />
          <Stat label="Team chat messages" value={t.chat_messages} sub={`${t.chat_7d} in 7 days`} onClick={() => onOpen('rallies', { sort: 'chat' })} />
          <Stat label="Files stored" value={t.files} sub={`${nf.format(t.files_mb)} MB`} />
        </div>
      </section>

      <section>
        <h2 className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-3">Last 30 days</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <DailyChart title="People active" rows={daily} field="active" />
          <DailyChart title="New accounts" rows={daily} field="accounts" />
          <DailyChart title="Devices opening rallies with a code (new)" rows={daily} field="code_devices" />
          <DailyChart title="Logistics packs created" rows={daily} field="packs" />
          <DailyChart title="Team chat messages" rows={daily} field="chat" />
          <DailyChart title="Files uploaded" rows={daily} field="uploads" />
        </div>
      </section>

      <p className="text-white/25 text-[11px]">
        "Active" counts signed-in people (organisers and crews). Competitors using Rally info have no account — they show as
        devices opening rallies with a code, and in Website visitors.
      </p>
    </div>
  )
}

// One series per chart: a column per day, hover/tap for the exact figure.
function DailyChart({ title, rows, field }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...rows.map(r => r[field] || 0))
  const total = rows.reduce((n, r) => n + (r[field] || 0), 0)
  const shown = hover != null ? rows[hover] : null
  return (
    <div className="bg-rl-card border border-white/10 rounded-xl p-4">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p className="text-white text-sm font-medium">{title}</p>
        <p className="text-white/40 text-xs flex-shrink-0">
          {shown
            ? `${new Date(shown.day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}: ${nf.format(shown[field] || 0)}`
            : `${nf.format(total)} in 30 days`}
        </p>
      </div>
      <div className="relative h-24 flex items-end gap-[2px] border-b border-white/10" onMouseLeave={() => setHover(null)}>
        <span className="absolute -top-0.5 left-0 text-[10px] text-white/30">{nf.format(max)}</span>
        {rows.map((r, i) => {
          const v = r[field] || 0
          return (
            <button
              key={r.day}
              type="button"
              aria-label={`${r.day}: ${v}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onClick={() => setHover(i)}
              className="flex-1 h-full flex items-end justify-center group"
            >
              <span
                className="w-full max-w-[24px] rounded-t transition-opacity"
                style={{
                  height: v ? `${Math.max(4, (v / max) * 100)}%` : '0',
                  background: SERIES_COLOUR,
                  opacity: hover == null || hover === i ? 1 : 0.45,
                }}
              />
            </button>
          )
        })}
      </div>
      <div className="flex justify-between text-[10px] text-white/30 mt-1">
        <span>{rows[0] && new Date(rows[0].day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
        <span>Today</span>
      </div>
    </div>
  )
}

// ─── Tables ──────────────────────────────────────────────────────────────────

function Table({ columns, rows, empty = 'Nothing yet.', initialSort }) {
  const [sort, setSort] = useState(initialSort || null) // { key, dir }
  if (!rows.length) return <p className="text-white/40 text-sm py-8 text-center">{empty}</p>
  const col = sort && columns.find(c => c.key === sort.key)
  const value = (c, r) => (c.sortValue ? c.sortValue(r) : r[c.key])
  const sorted = col ? [...rows].sort((a, b) => {
    const va = value(col, a), vb = value(col, b)
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va ?? '').localeCompare(String(vb ?? ''))
    return sort.dir === 'asc' ? cmp : -cmp
  }) : rows
  function toggle(c) {
    setSort(s => s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: c.num ? 'desc' : 'asc' })
  }
  return (
    <div className="bg-rl-card border border-white/10 rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10">
            {columns.map(c => (
              <th key={c.key} aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                className={`px-3 py-2.5 text-[11px] uppercase tracking-wide font-medium whitespace-nowrap ${c.num ? 'text-right' : 'text-left'}`}>
                <button type="button" onClick={() => toggle(c)} className={`uppercase tracking-wide ${sort?.key === c.key ? 'text-white' : 'text-white/40 hover:text-white/70'}`}>
                  {c.label}{sort?.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i} className="border-b border-white/5 last:border-0">
              {columns.map(c => (
                <td key={c.key} className={`px-3 py-2.5 whitespace-nowrap ${c.num ? 'text-right tabular-nums text-white/70' : 'text-white/80'}`}>
                  {c.render ? c.render(r) : (c.num ? nf.format(r[c.key] ?? 0) : (r[c.key] ?? '—'))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RalliesReport({ rallies, preset = {} }) {
  const initialSort = preset.sort ? { key: preset.sort, dir: preset.sort === 'date' ? 'desc' : 'desc' } : null
  return (
    <Table
      rows={rallies}
      initialSort={initialSort}
      empty="No rallies yet."
      columns={[
        { key: 'name', label: 'Rally', render: r => <span className="font-medium text-white">{r.name}</span> },
        { key: 'date', label: 'Date', render: r => fmtDate(r.date), sortValue: r => r.date || '' },
        { key: 'organiser', label: 'Organiser' },
        { key: 'status', label: 'Status' },
        { key: 'code_devices', label: 'Code devices', num: true, render: r => `${nf.format(r.code_devices)}${r.code_devices_24h ? ` (${r.code_devices_24h} today)` : ''}` },
        { key: 'code_opens', label: 'Opens', num: true },
        { key: 'alerts', label: 'Alerts', num: true },
        { key: 'packs', label: 'Packs', num: true },
        { key: 'chat', label: 'Chat', num: true },
        { key: 'entries', label: 'Entries', num: true },
        { key: 'documents', label: 'Docs', num: true },
        { key: 'roadbooks', label: 'Roadbooks', num: true },
        { key: 'stage_maps', label: 'Stage maps', num: true },
        { key: 'route_files', label: 'Route files', num: true },
        { key: 'hidden_sections', label: 'Sections off', num: true },
      ]}
    />
  )
}

const ACTIVITY = {
  all: { label: 'Any activity', test: () => true },
  '24h': { label: 'Active in last 24h', test: p => p.last_seen && Date.now() - new Date(p.last_seen) < 864e5 },
  '7d': { label: 'Active in last 7 days', test: p => p.last_seen && Date.now() - new Date(p.last_seen) < 7 * 864e5 },
  new7d: { label: 'Joined in last 7 days', test: p => Date.now() - new Date(p.joined) < 7 * 864e5 },
}

function PeopleReport({ people, preset = {} }) {
  const [q, setQ] = useState('')
  const [type, setType] = useState(preset.type || 'All')
  const [activity, setActivity] = useState(preset.activity || 'all')
  const types = useMemo(() => ['All', ...new Set(people.map(p => p.type))], [people])
  const rows = people.filter(p =>
    (type === 'All' || p.type === type) &&
    ACTIVITY[activity].test(p) &&
    (!q || `${p.name} ${p.email || ''}`.toLowerCase().includes(q.toLowerCase()))
  )
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or email…" className="rl-input flex-1 min-w-[180px]" />
        <select value={type} onChange={e => setType(e.target.value)} className="rl-input w-40" aria-label="Account type">
          {types.map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={activity} onChange={e => setActivity(e.target.value)} className="rl-input w-48" aria-label="Activity">
          {Object.entries(ACTIVITY).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}
        </select>
      </div>
      <p className="text-white/35 text-xs">{rows.length} of {people.length}</p>
      <Table
        rows={rows}
        initialSort={activity === '24h' || activity === '7d' ? { key: 'last_seen', dir: 'desc' } : null}
        columns={[
          { key: 'name', label: 'Name', render: r => <span className="font-medium text-white">{r.name}</span> },
          { key: 'email', label: 'Email', render: r => r.email || '—' },
          { key: 'type', label: 'Type' },
          { key: 'joined', label: 'Joined', render: r => fmtDate(r.joined), sortValue: r => r.joined || '' },
          { key: 'last_seen', label: 'Last active', render: r => ago(r.last_seen), sortValue: r => r.last_seen || '' },
          { key: 'packs', label: 'Packs', num: true },
          { key: 'marketing', label: 'Marketing OK', render: r => r.marketing ? 'Yes' : '—' },
        ]}
      />
    </div>
  )
}

function LogisticsReport({ data, preset = {} }) {
  const [sharingOnly, setSharingOnly] = useState(!!preset.sharing)
  const rows = sharingOnly ? data.packs.filter(p => p.sharing > 0) : data.packs
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-white/35 text-xs">Most recently updated first. "Sharing" = crew members whose location updated in the last 15 minutes.</p>
        <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer">
          <input type="checkbox" checked={sharingOnly} onChange={e => setSharingOnly(e.target.checked)} className="w-4 h-4 accent-rl-accent" />
          Only packs sharing location now
        </label>
      </div>
      <Table
        rows={rows}
        empty="No packs yet."
        columns={[
          { key: 'rally', label: 'Rally', render: r => <span className="font-medium text-white">{r.rally}</span> },
          { key: 'kind', label: 'Type' },
          { key: 'owner', label: 'Owner' },
          { key: 'car', label: 'Car', render: r => r.car || '—' },
          { key: 'members', label: 'Members', num: true },
          { key: 'sharing', label: 'Sharing', num: true },
          { key: 'created', label: 'Created', render: r => fmtDate(r.created), sortValue: r => r.created || '' },
          { key: 'updated', label: 'Last change', render: r => ago(r.updated || r.created), sortValue: r => r.updated || r.created || '' },
        ]}
      />
    </div>
  )
}
