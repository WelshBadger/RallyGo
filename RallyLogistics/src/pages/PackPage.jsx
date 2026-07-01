import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const SECTIONS = [
  {
    id: 'results', label: 'Results', color: '#eab308', desc: 'Live timing & results — tap to load', fullWidth: true,
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7"><path fillRule="evenodd" d="M10 1a9 9 0 100 18A9 9 0 0010 1zM5.904 9.458a1 1 0 011.414 0L9 11.14V5a1 1 0 112 0v6.14l1.682-1.682a1 1 0 111.414 1.414l-3.389 3.389a1 1 0 01-1.414 0L5.904 10.872a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
  },
  {
    id: 'team', label: 'Team', color: '#3b82f6', desc: 'Mechanics & crew contacts',
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM17.5 17c.28-.32.5-.7.5-1.13C18 13.75 14.42 12 10 12S2 13.75 2 15.87c0 .43.22.81.5 1.13h15z"/></svg>
  },
  {
    id: 'schedule', label: 'Schedule', color: '#8b5cf6', desc: 'Day-by-day programme',
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/></svg>
  },
  {
    id: 'stages', label: 'Stages', color: '#10b981', desc: 'Stage notes & tyre call',
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7"><path fillRule="evenodd" d="M12 1.586l-4 4v12.828l4-4V1.586zM3.707 3.293A1 1 0 002 4v10a1 1 0 00.293.707L6 18.414V5.586L3.707 3.293zM17.707 5.293L14 1.586v12.828l2.293 2.293A1 1 0 0018 16V6a1 1 0 00-.293-.707z" clipRule="evenodd"/></svg>
  },
  {
    id: 'pre-event', label: 'Pre-event', color: '#f59e0b', desc: 'Sign-on, scrutineering & noise',
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/><path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9.707 5.707a1 1 0 00-1.414-1.414L9 12.586l-1.293-1.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
  },
  {
    id: 'locations', label: 'Locations', color: '#06b6d4', desc: 'Service park, hotel & more',
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/></svg>
  },
  {
    id: 'fuel', label: 'Fuel', color: '#f97316', desc: 'Fuel plan per stage',
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd"/></svg>
  },
  {
    id: 'recce', label: 'Recce', color: '#ec4899', desc: 'Notes from reconnaissance',
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/></svg>
  },
]

function fmt(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function toStr(val) {
  if (!val) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'object') {
    return [val.location, val.openTime, val.notes, val.address]
      .filter(Boolean).join(' · ')
  }
  return String(val)
}

export default function PackPage() {
  const { rallyId } = useParams()
  const { user } = useAuth()
  const [rally, setRally] = useState(null)
  const [pack, setPack] = useState(null)
  const [tab, setTab] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [shareUrl, setShareUrl] = useState(null)

  useEffect(() => {
    async function load() {
      const [{ data: r }, { data: p }] = await Promise.all([
        supabase.from('rallies').select('*').eq('id', rallyId).single(),
        supabase.from('logistics_packs').select('*').eq('rally_id', rallyId).eq('user_id', user.id).maybeSingle(),
      ])
      setRally(r)
      if (p) {
        setPack(p)
      } else {
        const stages = r?.regulations_data?.stages || []
        const newPack = {
          rally_id: rallyId,
          user_id: user.id,
          team_members: [],
          fuel_schedule: stages.map(s => ({ stage: s.number, name: s.name, distance: s.distance, fuel: '', notes: '' })),
          recce_notes: Object.fromEntries(stages.map(s => [s.number, ''])),
          stage_notes: Object.fromEntries(stages.map(s => [s.number, ''])),
          schedule_notes: '',
        }
        const { data: created } = await supabase.from('logistics_packs').insert(newPack).select().single()
        setPack(created)
      }
      setLoading(false)
    }
    load()
  }, [rallyId, user.id])

  const save = useCallback(async (updates) => {
    if (!pack?.id) return
    setSaving(true)
    const { data, error } = await supabase.from('logistics_packs')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', pack.id)
      .select().single()
    if (error) { toast.error('Save failed'); setSaving(false); return }
    setPack(data)
    setSaving(false)
    toast.success('Saved')
  }, [pack?.id])

  function copyShareLink() {
    const url = `${window.location.origin}/shared/${pack.share_code}`
    setShareUrl(url)
    navigator.clipboard.writeText(url).then(() => toast.success('Share link copied!'))
  }

  if (loading) return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
      <div className="h-20 bg-white/5 rounded-2xl animate-pulse" />
      <div className="h-12 bg-white/5 rounded-xl animate-pulse" />
      <div className="h-64 bg-white/5 rounded-xl animate-pulse" />
    </div>
  )

  if (!rally) return <div className="text-center py-16 text-white/30">Rally not found.</div>

  const fi = rally.final_instructions_data || {}
  const regs = rally.regulations_data || {}
  const stages = regs.stages || []

  return (
    <main className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6">
        <Link to="/" className="text-white/30 hover:text-white/60 text-xs flex items-center gap-1 mb-4 no-underline transition-colors">
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M7.78 12.53a.75.75 0 01-1.06 0L2.47 8.28a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 1.06L4.81 7h7.44a.75.75 0 010 1.5H4.81l2.97 2.97a.75.75 0 010 1.06z" clipRule="evenodd" />
          </svg>
          All events
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            {rally.series && <p className="text-white/30 text-xs mb-1">{rally.series}</p>}
            <h1 className="text-xl font-semibold text-white">{rally.name}</h1>
            <p className="text-white/40 text-sm mt-0.5">{fmt(rally.date)}{rally.end_date && rally.end_date !== rally.date ? ` – ${fmt(rally.end_date)}` : ''}{rally.location && ` · ${rally.location}`}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {saving && <span className="text-white/25 text-xs">Saving…</span>}
            <button onClick={copyShareLink} className="rl-btn-ghost text-xs gap-1.5">
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                <path fillRule="evenodd" d="M11.5 2.5a1 1 0 100 2 1 1 0 000-2zM4.5 7a1 1 0 100 2 1 1 0 000-2zm7 5a1 1 0 100 2 1 1 0 000-2zM9 3.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM5.5 11a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM12.5 13.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
              </svg>
              Share with team
            </button>
          </div>
        </div>
        {shareUrl && (
          <div className="mt-3 bg-rl-accent/10 border border-rl-accent/25 rounded-lg px-3 py-2.5 flex items-center gap-2">
            <span className="text-rl-accent text-xs flex-1 truncate">{shareUrl}</span>
            <button onClick={() => setShareUrl(null)} className="text-white/30 hover:text-white text-xs">✕</button>
          </div>
        )}
      </div>

      {/* Tile grid — home dashboard */}
      {!tab && (
        <div className="grid grid-cols-2 gap-3">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setTab(s.id)}
              style={{ background: s.color + '18', borderColor: s.color + '45' }}
              className={`border rounded-2xl p-5 text-left flex transition-all hover:scale-[1.02] active:scale-[0.98] ${
                s.fullWidth
                  ? 'col-span-2 flex-row items-center gap-5 min-h-[90px]'
                  : 'flex-col justify-between min-h-[140px]'
              }`}
            >
              <div style={{ color: s.color }} className={s.fullWidth ? 'flex-shrink-0' : ''}>{s.icon}</div>
              <div className={s.fullWidth ? 'flex-1' : ''}>
                <p className={`text-white font-semibold leading-tight ${s.fullWidth ? 'text-xl' : 'text-base'}`}>{s.label}</p>
                <p className="text-white/40 text-xs mt-1 leading-snug">{s.desc}</p>
              </div>
              {s.fullWidth && (
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5 flex-shrink-0" style={{ color: s.color + 'aa' }}>
                  <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.75a.75.75 0 010-1.5h7.44L8.22 4.03a.75.75 0 010-1.06z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Section view */}
      {tab && (
        <>
          <button
            onClick={() => setTab(null)}
            className="w-full flex items-center gap-3 px-4 py-3 mb-5 bg-white/5 hover:bg-white/8 border border-white/10 hover:border-white/20 rounded-xl transition-all text-left group"
          >
            <svg className="w-4 h-4 text-white/40 group-hover:text-white/70 transition-colors flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M7.78 12.53a.75.75 0 01-1.06 0L2.47 8.28a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 1.06L4.81 7h7.44a.75.75 0 010 1.5H4.81l2.97 2.97a.75.75 0 010 1.06z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="text-white/35 text-[10px] uppercase tracking-widest font-medium">Back to</p>
              <p className="text-white/80 text-sm font-medium leading-tight">{rally.name} overview</p>
            </div>
          </button>
          {(() => {
            const s = SECTIONS.find(x => x.id === tab)
            return s ? (
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: s.color + '20', color: s.color }}>
                  <div className="w-5 h-5 [&>svg]:w-5 [&>svg]:h-5">{s.icon}</div>
                </div>
                <h2 className="text-white font-semibold text-lg">{s.label}</h2>
              </div>
            ) : null
          })()}
          {tab === 'results'   && <ResultsTab pack={pack} onSave={save} />}
          {tab === 'team'      && <TeamTab pack={pack} onSave={save} />}
          {tab === 'schedule'  && <ScheduleTab pack={pack} rally={rally} fi={fi} onSave={save} />}
          {tab === 'stages'    && <StagesTab pack={pack} stages={stages} onSave={save} />}
          {tab === 'pre-event' && <PreEventTab fi={fi} rally={rally} />}
          {tab === 'locations' && <LocationsTab pack={pack} fi={fi} rally={rally} onSave={save} />}
          {tab === 'fuel'      && <FuelTab pack={pack} onSave={save} />}
          {tab === 'recce'     && <RecceTab pack={pack} stages={stages} onSave={save} />}
        </>
      )}
    </main>
  )
}

// ─── Results Tab ─────────────────────────────────────────────────────────────

function ResultsTab({ pack, onSave }) {
  const [url, setUrl] = useState(pack?.results_url || '')
  const [liveUrl, setLiveUrl] = useState(pack?.results_url || '')
  const [editing, setEditing] = useState(!pack?.results_url)
  const [iframeError, setIframeError] = useState(false)

  function loadUrl() {
    const trimmed = url.trim()
    if (!trimmed) return
    onSave({ results_url: trimmed })
    setLiveUrl(trimmed)
    setEditing(false)
    setIframeError(false)
  }

  return (
    <div className="space-y-4">
      {/* URL bar */}
      <div className="bg-rl-card border border-white/10 rounded-xl p-4">
        {editing ? (
          <div className="space-y-3">
            <p className="text-white/40 text-sm">Paste the live results or timing URL for this event</p>
            <div className="flex gap-2">
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && loadUrl()}
                placeholder="https://results.example.com/..."
                className="rl-input flex-1 text-sm"
                autoFocus
              />
              <button onClick={loadUrl} disabled={!url.trim()} className="rl-btn-primary text-sm px-4">Load</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-rl-accent animate-pulse flex-shrink-0" />
            <p className="text-white/50 text-xs truncate flex-1">{liveUrl}</p>
            <button onClick={() => setEditing(true)} className="text-white/30 hover:text-white/70 text-xs transition-colors flex-shrink-0">Change</button>
            <a href={liveUrl} target="_blank" rel="noopener noreferrer"
              className="text-white/30 hover:text-white/70 text-xs transition-colors flex-shrink-0 no-underline">
              ↗ Open
            </a>
          </div>
        )}
      </div>

      {/* Iframe */}
      {liveUrl && !editing && (
        iframeError ? (
          <div className="bg-rl-card border border-white/10 rounded-xl p-8 text-center space-y-4">
            <p className="text-white/40 text-sm">This results page can't be embedded — it blocks external frames.</p>
            <a href={liveUrl} target="_blank" rel="noopener noreferrer"
              className="rl-btn-primary text-sm inline-block no-underline">
              Open results in new tab ↗
            </a>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden border border-white/10"
            style={{ height: 'calc(100vh - 300px)', minHeight: '400px' }}>
            <iframe
              key={liveUrl}
              src={liveUrl}
              className="w-full h-full bg-white"
              title="Live results"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              onError={() => setIframeError(true)}
            />
          </div>
        )
      )}
    </div>
  )
}

// ─── Team Tab ───────────────────────────────────────────────────────────────

function TeamTab({ pack, onSave }) {
  const [members, setMembers] = useState(pack?.team_members || [])
  const [dirty, setDirty] = useState(false)

  function addMember() {
    setMembers(m => [...m, { name: '', role: '', phone: '', notes: '' }])
    setDirty(true)
  }

  function update(i, field, val) {
    setMembers(m => m.map((x, idx) => idx === i ? { ...x, [field]: val } : x))
    setDirty(true)
  }

  function remove(i) {
    setMembers(m => m.filter((_, idx) => idx !== i))
    setDirty(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-medium">Team members</h2>
          <p className="text-white/35 text-xs mt-0.5">Names, roles and contact numbers for your whole team</p>
        </div>
        <button onClick={addMember} className="rl-btn-primary text-xs">+ Add member</button>
      </div>

      {members.length === 0 ? (
        <div className="text-center py-12 bg-rl-card border border-white/8 rounded-xl">
          <p className="text-white/30 text-sm mb-3">No team members yet</p>
          <button onClick={addMember} className="rl-btn-ghost text-xs">Add first member</button>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((m, i) => (
            <div key={i} className="bg-rl-card border border-white/10 rounded-xl p-4">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-white/35 text-[10px] uppercase tracking-wide mb-1 block">Name</label>
                  <input value={m.name} onChange={e => update(i, 'name', e.target.value)}
                    placeholder="Full name" className="rl-input text-sm" />
                </div>
                <div>
                  <label className="text-white/35 text-[10px] uppercase tracking-wide mb-1 block">Role</label>
                  <input value={m.role} onChange={e => update(i, 'role', e.target.value)}
                    placeholder="e.g. Lead mechanic" className="rl-input text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/35 text-[10px] uppercase tracking-wide mb-1 block">Phone</label>
                  <input value={m.phone} onChange={e => update(i, 'phone', e.target.value)}
                    placeholder="+44 7700 900000" className="rl-input text-sm" type="tel" />
                </div>
                <div>
                  <label className="text-white/35 text-[10px] uppercase tracking-wide mb-1 block">Notes</label>
                  <input value={m.notes} onChange={e => update(i, 'notes', e.target.value)}
                    placeholder="e.g. Arrives Friday evening" className="rl-input text-sm" />
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <button onClick={() => remove(i)} className="text-red-400/50 hover:text-red-400 text-xs transition-colors">Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {dirty && (
        <button onClick={() => { onSave({ team_members: members }); setDirty(false) }}
          className="rl-btn-primary w-full justify-center">
          Save team
        </button>
      )}
    </div>
  )
}

// ─── Schedule Tab ────────────────────────────────────────────────────────────

function ScheduleTab({ pack, fi, onSave }) {
  const [notes, setNotes] = useState(pack?.schedule_notes || '')
  const [dirty, setDirty] = useState(false)
  const schedule = fi?.schedule || []
  const signingOn = fi?.signingOn || []

  return (
    <div className="space-y-6">
      {schedule.length > 0 && (
        <div>
          <h2 className="text-white font-medium mb-3">Official schedule <span className="text-white/25 text-xs font-normal ml-1">from Final Instructions</span></h2>
          <div className="bg-rl-card border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-white/5">
                {schedule.map((item, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 text-white/35 text-xs whitespace-nowrap w-24">{toStr(item.day)}</td>
                    <td className="px-4 py-3 text-rl-accent font-mono text-xs whitespace-nowrap w-20">{toStr(item.time)}</td>
                    <td className="px-4 py-3 text-white text-sm">{toStr(item.event)}</td>
                    {item.location && <td className="px-4 py-3 text-white/35 text-xs hidden sm:table-cell">{toStr(item.location)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-white font-medium mb-2">Team schedule notes</h2>
        <p className="text-white/35 text-xs mb-3">Add your own timings, reminders and logistics notes here</p>
        <textarea value={notes} onChange={e => { setNotes(e.target.value); setDirty(true) }}
          rows={8} placeholder={"Friday\n14:00 – Load van\n16:00 – All crew arrive\n18:00 – Signing on (car 3)\n\nSaturday\n06:00 – Tyres fitted\n07:30 – Parc ferme opens"}
          className="rl-textarea" />
        {dirty && (
          <button onClick={() => { onSave({ schedule_notes: notes }); setDirty(false) }}
            className="rl-btn-primary mt-3">Save notes</button>
        )}
      </div>
    </div>
  )
}

// ─── Stages Tab ──────────────────────────────────────────────────────────────

function StagesTab({ pack, stages, onSave }) {
  const [stageNotes, setStageNotes] = useState(pack?.stage_notes || {})
  const [dirty, setDirty] = useState(false)

  function update(num, val) {
    setStageNotes(n => ({ ...n, [num]: val }))
    setDirty(true)
  }

  if (stages.length === 0) {
    return <div className="text-center py-16 text-white/30 text-sm">Stage information will appear here once the organiser uploads the regulations.</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-medium">Stage notes</h2>
          <p className="text-white/35 text-xs mt-0.5">Stage info from regulations — add your own crew notes per stage</p>
        </div>
        {dirty && (
          <button onClick={() => { onSave({ stage_notes: stageNotes }); setDirty(false) }}
            className="rl-btn-primary text-xs">Save notes</button>
        )}
      </div>
      <div className="space-y-2">
        {stages.map(s => (
          <div key={s.number} className="bg-rl-card border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-rl-accent font-bold text-lg w-10 text-center">SS{s.number}</span>
              <div className="flex-1">
                <p className="text-white font-medium text-sm">{s.name}</p>
                {s.distance && <p className="text-white/35 text-xs">{s.distance}</p>}
              </div>
            </div>
            <textarea value={stageNotes[s.number] || ''} onChange={e => update(s.number, e.target.value)}
              placeholder="Crew notes, hazards, tyre strategy…"
              rows={2} className="rl-textarea text-xs" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Pre-Event Tab ───────────────────────────────────────────────────────────

function PreEventTab({ fi, rally }) {
  const noiseLimit = fi?.noiseLimit
  const noiseTesting = fi?.noiseTesting
  const signingOn = fi?.signingOn || []
  const scrutineering = fi?.scrutineering || []
  const rawServiceArea = fi?.serviceArea || rally?.regulations_data?.serviceArea
  const serviceAreaLocation = typeof rawServiceArea === 'object'
    ? [rawServiceArea.location, rawServiceArea.openTime].filter(Boolean).join(' · ')
    : toStr(rawServiceArea)
  const serviceAreaNotes = typeof rawServiceArea === 'object' ? rawServiceArea.notes : null
  const importantNotes = fi?.importantNotes || []

  if (!fi || Object.keys(fi).length === 0) {
    return (
      <div className="text-center py-16 bg-rl-card border border-white/8 rounded-xl">
        <p className="text-white/30 text-sm">Pre-event information will appear here once the organiser uploads the Final Instructions on RallyGo.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {(noiseLimit || noiseTesting) && (
        <div className="bg-rl-card border border-rl-accent/25 rounded-xl p-5">
          <p className="text-rl-accent text-[11px] uppercase tracking-widest font-semibold mb-1">Noise limit</p>
          {noiseLimit
            ? <p className="text-white text-3xl font-bold">{toStr(noiseLimit)}</p>
            : noiseTesting?.limit && <p className="text-white text-3xl font-bold">{toStr(noiseTesting.limit)}</p>
          }
          {noiseTesting && (noiseTesting.times || noiseTesting.location) && (
            <div className="mt-2 space-y-0.5">
              {noiseTesting.times && <p className="text-white/50 text-sm">{noiseTesting.times}</p>}
              {noiseTesting.location && <p className="text-white/35 text-xs">{noiseTesting.location}</p>}
            </div>
          )}
        </div>
      )}

      {serviceAreaLocation && (
        <div className="bg-rl-card border border-white/10 rounded-xl px-4 py-3.5">
          <p className="text-white/35 text-xs uppercase tracking-wide mb-1.5">Service area</p>
          <p className="text-white text-sm font-medium mb-1">{serviceAreaLocation}</p>
          {serviceAreaNotes && <p className="text-white/40 text-xs leading-relaxed">{serviceAreaNotes}</p>}
        </div>
      )}

      {signingOn.length > 0 && (
        <div>
          <h3 className="text-white/60 text-xs uppercase tracking-widest font-semibold mb-3">Signing on</h3>
          <div className="bg-rl-card border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-white/8 bg-white/3">
                <th className="text-left px-4 py-2.5 text-white/30 text-xs font-medium">Cars</th>
                <th className="text-left px-4 py-2.5 text-white/30 text-xs font-medium">Location</th>
                <th className="text-left px-4 py-2.5 text-white/30 text-xs font-medium">Time</th>
              </tr></thead>
              <tbody className="divide-y divide-white/5">
                {signingOn.map((row, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 text-white text-sm">{toStr(row.carRange || row.cars || row.competitors || row.day || '-')}</td>
                    <td className="px-4 py-2.5 text-white/60 text-sm">{toStr(row.location || '-')}</td>
                    <td className="px-4 py-2.5 text-rl-accent font-mono text-sm font-medium">{toStr(row.time || row.times || '-')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {scrutineering.length > 0 && (
        <div>
          <h3 className="text-white/60 text-xs uppercase tracking-widest font-semibold mb-3">Scrutineering</h3>
          <div className="bg-rl-card border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-white/8 bg-white/3">
                <th className="text-left px-4 py-2.5 text-white/30 text-xs font-medium">Cars</th>
                <th className="text-left px-4 py-2.5 text-white/30 text-xs font-medium">Location</th>
                <th className="text-left px-4 py-2.5 text-white/30 text-xs font-medium">Time</th>
              </tr></thead>
              <tbody className="divide-y divide-white/5">
                {scrutineering.map((row, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 text-white text-sm">{toStr(row.carRange || row.cars || row.competitors || row.day || '-')}</td>
                    <td className="px-4 py-2.5 text-white/60 text-sm">{toStr(row.location || '-')}</td>
                    <td className="px-4 py-2.5 text-rl-accent font-mono text-sm font-medium">{toStr(row.time || row.times || '-')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {importantNotes.length > 0 && (
        <div>
          <h3 className="text-white/60 text-xs uppercase tracking-widest font-semibold mb-3">Important notes</h3>
          <ul className="space-y-2">
            {importantNotes.map((note, i) => (
              <li key={i} className="flex gap-2 text-sm text-white/70 bg-rl-card border border-white/8 rounded-lg px-4 py-3">
                <span className="text-rl-accent mt-0.5 flex-shrink-0">→</span>
                <span>{toStr(note)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Fuel Tab ────────────────────────────────────────────────────────────────

const DEFAULT_START_ROW = { id: 'start', label: 'Fuel at start', location: '', fuel: '', notes: '' }

function FuelTab({ pack, onSave }) {
  const [start, setStart] = useState(() =>
    pack?.fuel_schedule?.find(r => r.id === 'start') || { ...DEFAULT_START_ROW }
  )
  const [refuels, setRefuels] = useState(() =>
    (pack?.fuel_schedule || []).filter(r => r.id !== 'start')
  )
  const [dirty, setDirty] = useState(false)

  function save(nextStart, nextRefuels) {
    onSave({ fuel_schedule: [nextStart, ...nextRefuels] })
    setDirty(false)
  }

  function updateStart(field, val) {
    const next = { ...start, [field]: val }
    setStart(next)
    setDirty(true)
  }

  function updateRefuel(i, field, val) {
    const next = refuels.map((r, idx) => idx === i ? { ...r, [field]: val } : r)
    setRefuels(next)
    setDirty(true)
  }

  function addRefuel() {
    const next = [...refuels, { id: `refuel-${Date.now()}`, label: `Refuel ${refuels.length + 1}`, location: '', fuel: '', notes: '' }]
    setRefuels(next)
    setDirty(true)
  }

  function deleteRefuel(i) {
    const next = refuels
      .filter((_, idx) => idx !== i)
      .map((r, idx) => ({ ...r, label: `Refuel ${idx + 1}` }))
    setRefuels(next)
    setDirty(true)
  }

  const totalFuel = [start, ...refuels].reduce((sum, r) => sum + (parseFloat(r.fuel) || 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-medium">Fuel plan</h2>
          <p className="text-white/35 text-xs mt-0.5">Starting fuel plus refuel stops</p>
        </div>
        {dirty && (
          <button onClick={() => save(start, refuels)} className="rl-btn-primary text-xs">Save</button>
        )}
      </div>

      {totalFuel > 0 && (
        <div className="bg-rl-accent/10 border border-rl-accent/25 rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-white/60 text-sm">Total fuel</span>
          <span className="text-rl-accent font-bold text-xl">{totalFuel.toFixed(1)} L</span>
        </div>
      )}

      <FuelCard label="Fuel at start" data={start} onChange={updateStart} fixed />

      {refuels.map((r, i) => (
        <FuelCard key={r.id} label={r.label} data={r}
          onChange={(field, val) => updateRefuel(i, field, val)}
          onDelete={() => deleteRefuel(i)} />
      ))}

      <button
        onClick={addRefuel}
        className="w-full border border-dashed border-white/15 rounded-xl py-3.5 text-white/35 hover:text-white/60 hover:border-white/25 text-sm transition-all"
      >
        + Add refuel stop
      </button>
    </div>
  )
}

function FuelCard({ label, data, onChange, onDelete, fixed }) {
  return (
    <div className="bg-rl-card border border-white/10 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-white font-medium text-sm">{label}</p>
        {!fixed && (
          <button onClick={onDelete} className="text-white/20 hover:text-red-400 transition-colors text-xs">
            Remove
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-white/35 text-xs mb-1">Location</p>
          <input value={data.location || ''} onChange={e => onChange('location', e.target.value)}
            placeholder="Where" className="rl-input text-sm w-full" />
        </div>
        <div>
          <p className="text-white/35 text-xs mb-1">Litres</p>
          <input type="number" value={data.fuel || ''} onChange={e => onChange('fuel', e.target.value)}
            placeholder="0" min="0" step="0.5" className="rl-input text-sm w-full" />
        </div>
      </div>
      <div>
        <p className="text-white/35 text-xs mb-1">Notes</p>
        <input value={data.notes || ''} onChange={e => onChange('notes', e.target.value)}
          placeholder="e.g. after SS4, left side of road" className="rl-input text-sm w-full" />
      </div>
    </div>
  )
}

// ─── Recce Tab ───────────────────────────────────────────────────────────────

function RecceTab({ pack, stages, onSave }) {
  const [notes, setNotes] = useState(pack?.recce_notes || {})
  const [dirty, setDirty] = useState(false)

  function update(num, val) {
    setNotes(n => ({ ...n, [num]: val }))
    setDirty(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-medium">Recce notes</h2>
          <p className="text-white/35 text-xs mt-0.5">Per-stage notes from reconnaissance — visible to the whole team</p>
        </div>
        {dirty && (
          <button onClick={() => { onSave({ recce_notes: notes }); setDirty(false) }}
            className="rl-btn-primary text-xs">Save notes</button>
        )}
      </div>

      {stages.length === 0 ? (
        <textarea value={notes.general || ''} onChange={e => update('general', e.target.value)}
          placeholder="General recce notes…" rows={12} className="rl-textarea" />
      ) : (
        <div className="space-y-2">
          {stages.map(s => (
            <div key={s.number} className="bg-rl-card border border-white/10 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-rl-accent font-bold text-base w-10 text-center">SS{s.number}</span>
                <div>
                  <p className="text-white font-medium text-sm">{s.name}</p>
                  {s.distance && <p className="text-white/30 text-xs">{s.distance}</p>}
                </div>
              </div>
              <textarea value={notes[s.number] || ''} onChange={e => update(s.number, e.target.value)}
                placeholder="Hazards, cuts, surface changes, notes for pacenotes…"
                rows={3} className="rl-textarea text-xs" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Locations Tab ───────────────────────────────────────────────────────────

const PIN_TYPES = [
  { id: 'postcode', label: 'Postcode', placeholder: 'e.g. CA3 8RE' },
  { id: 'w3w',      label: '///what3words', placeholder: 'e.g. filled.count.soap' },
  { id: 'apple',    label: 'Apple Maps', placeholder: 'Paste link from Apple Maps share' },
]

function pinUrl(type, value) {
  if (!value) return null
  if (type === 'postcode') return `https://maps.apple.com/?q=${encodeURIComponent(value)}`
  if (type === 'w3w') {
    const clean = value.replace(/^\/\/\//, '')
    return `https://what3words.com/${clean}`
  }
  return value // apple maps URL as-is
}

const LOCATION_FIELDS = [
  { key: 'hotel',       label: 'Accommodation' },
  { key: 'hq',          label: 'HQ / start' },
  { key: 'servicepark', label: 'Service park' },
  { key: 'refuel',      label: 'Refuel' },
  { key: 'noise',       label: 'Noise / scrutineering' },
  { key: 'trailerpark', label: 'Trailer park' },
  { key: 'hospital',    label: 'Nearest hospital' },
]

function PinBadge({ type, value }) {
  if (!value) return null
  const url = pinUrl(type, value)
  const labels = {
    postcode: 'Postcode',
    w3w: '///w3w',
    apple: 'Maps',
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full no-underline"
      style={{ background: 'rgba(6,182,212,0.12)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.25)' }}>
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5">
        <path fillRule="evenodd" d="M11.854 8.354a.5.5 0 000-.708l-3-3a.5.5 0 10-.708.708L10.293 7.5H1.5a.5.5 0 000 1h8.793l-2.147 2.146a.5.5 0 00.708.708l3-3z" clipRule="evenodd"/>
      </svg>
      {labels[type] || type} · {value}
    </a>
  )
}

function LocationsTab({ pack, fi, rally, onSave }) {
  const rawLocs = pack?.locations || {}
  const [locs, setLocs] = useState(() => {
    if (typeof rawLocs === 'string') return {}
    return rawLocs
  })
  const [editing, setEditing] = useState(null) // key being edited
  const [draft, setDraft] = useState({ type: 'postcode', value: '' })
  const [dirty, setDirty] = useState(false)

  function openEdit(key) {
    const existing = locs[key] || {}
    setDraft({ type: existing.type || 'postcode', value: existing.value || '' })
    setEditing(key)
  }

  function savePin(key) {
    const next = { ...locs, [key]: { type: draft.type, value: draft.value.trim() } }
    if (!draft.value.trim()) {
      delete next[key]
    }
    setLocs(next)
    setEditing(null)
    onSave({ locations: next })
  }

  function removePin(key) {
    const next = { ...locs }
    delete next[key]
    setLocs(next)
    onSave({ locations: next })
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-white font-medium">Locations</h2>
        <p className="text-white/35 text-xs mt-0.5">Add map pins — tap any to open in Maps</p>
      </div>

      {LOCATION_FIELDS.map(({ key, label }) => {
        const pin = locs[key]
        const isEditing = editing === key

        return (
          <div key={key} className="bg-rl-card border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-white/70 text-sm font-medium">{label}</p>
              <div className="flex items-center gap-2">
                {pin && !isEditing && (
                  <button onClick={() => removePin(key)}
                    className="text-white/20 hover:text-red-400 text-xs transition-colors">Remove</button>
                )}
                {!isEditing && (
                  <button onClick={() => openEdit(key)}
                    className="text-rl-accent hover:text-white text-xs transition-colors">
                    {pin ? 'Edit' : '+ Add pin'}
                  </button>
                )}
              </div>
            </div>

            {pin && !isEditing && <PinBadge type={pin.type} value={pin.value} />}

            {isEditing && (
              <div className="space-y-3 mt-2">
                <div className="flex gap-2">
                  {PIN_TYPES.map(pt => (
                    <button key={pt.id}
                      onClick={() => setDraft(d => ({ ...d, type: pt.id }))}
                      className={`flex-1 py-1.5 rounded-lg text-xs border transition-all ${
                        draft.type === pt.id
                          ? 'bg-rl-accent/15 border-rl-accent/40 text-rl-accent'
                          : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'
                      }`}>
                      {pt.label}
                    </button>
                  ))}
                </div>
                <input
                  value={draft.value}
                  onChange={e => setDraft(d => ({ ...d, value: e.target.value }))}
                  placeholder={PIN_TYPES.find(p => p.id === draft.type)?.placeholder}
                  className="rl-input text-sm w-full"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button onClick={() => savePin(key)} className="rl-btn-primary text-xs flex-1 justify-center">Save</button>
                  <button onClick={() => setEditing(null)} className="rl-btn-ghost text-xs px-4">Cancel</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}