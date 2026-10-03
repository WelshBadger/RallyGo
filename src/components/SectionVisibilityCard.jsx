import { useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { RALLY_INFO_SECTIONS, LOGISTICS_TILES } from '../lib/sectionLists'

// Organiser ticks which parts of the rally appear — in RallyHQ's rally info and in
// every crew's Rally Logistics pack. Unticked keys are stored as "hidden" lists, so
// everything stays visible until someone switches it off.
export default function SectionVisibilityCard({ rally, setRally }) {
  const [saving, setSaving] = useState(null)

  async function toggle(column, key, show) {
    const current = Array.isArray(rally[column]) ? rally[column] : []
    const next = show ? current.filter(k => k !== key) : [...new Set([...current, key])]
    setSaving(column + key)
    const { error } = await supabase.from('rallies').update({ [column]: next }).eq('id', rally.id)
    setSaving(null)
    if (error) return toast.error('Could not save that change')
    setRally(r => ({ ...r, [column]: next }))
  }

  function Group({ title, sub, column, items }) {
    const hidden = Array.isArray(rally[column]) ? rally[column] : []
    return (
      <div>
        <p className="text-white text-sm font-medium">{title}</p>
        <p className="text-white/35 text-xs mt-0.5 mb-3">{sub}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
          {items.map(item => {
            const shown = !hidden.includes(item.key)
            return (
              <label key={item.key} className="flex items-center gap-2.5 py-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={shown}
                  disabled={saving === column + item.key}
                  onChange={e => toggle(column, item.key, e.target.checked)}
                  className="w-4 h-4 accent-rl-accent flex-shrink-0"
                />
                <span className={`text-sm ${shown ? 'text-white/80' : 'text-white/35 line-through'}`}>{item.label}</span>
              </label>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-rl-card border border-white/10 rounded-xl p-5 mb-5 space-y-6">
      <div>
        <h2 className="text-white font-medium text-sm">Sections included in this rally</h2>
        <p className="text-white/35 text-xs mt-0.5">Untick anything this rally doesn't use. Changes apply straight away.</p>
      </div>
      <Group
        title="Rally info (RallyHQ)"
        sub="What competitors see when they open this rally with the code."
        column="hidden_sections"
        items={RALLY_INFO_SECTIONS}
      />
      <Group
        title="Rally Logistics tiles"
        sub="Tiles every crew's pack shows for this rally. Crews can hide more for themselves, but can't bring back what you hide."
        column="hidden_logistics_tiles"
        items={LOGISTICS_TILES}
      />
    </div>
  )
}
