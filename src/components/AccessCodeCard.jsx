import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return [...bytes].map(b => ALPHABET[b % ALPHABET.length]).join('')
}

// Organiser's view of the code competitors need to open this rally's info.
export default function AccessCodeCard({ rallyId }) {
  const [saved, setSaved] = useState(null)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('rally_access_codes').select('code').eq('rally_id', rallyId).maybeSingle()
      .then(({ data }) => {
        setSaved(data?.code || '')
        setDraft(data?.code || '')
        setLoading(false)
      })
  }, [rallyId])

  async function save(code) {
    const value = code.trim().toUpperCase()
    if (value.length < 4) return toast.error('Code must be at least 4 characters')
    setSaving(true)
    const { error } = await supabase.from('rally_access_codes')
      .upsert({ rally_id: rallyId, code: value, updated_at: new Date().toISOString() }, { onConflict: 'rally_id' })
    setSaving(false)
    if (error) return toast.error('Could not save the code')
    setSaved(value)
    setDraft(value)
    toast.success('Access code saved')
  }

  function regenerate() {
    if (saved && !confirm('Create a new code? Competitors will need the new code the next time they open this rally with signal.')) return
    save(randomCode())
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(saved)
      toast.success('Code copied')
    } catch {
      toast.error('Could not copy')
    }
  }

  const changed = draft.trim().toUpperCase() !== saved

  return (
    <div className="bg-rl-card border border-white/10 rounded-xl p-4 mb-5">
      <div className="mb-3">
        <h2 className="text-white font-medium text-sm">Competitor access code</h2>
        <p className="text-white/35 text-xs mt-0.5">
          Competitors enter this code once to open your rally's information. Share it in your regulations or final instructions.
        </p>
      </div>
      {loading ? (
        <div className="h-10 bg-white/5 rounded-lg animate-pulse" />
      ) : (
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            aria-label="Competitor access code"
            className="rl-input flex-1 min-w-[140px] uppercase tracking-widest font-medium"
          />
          {changed ? (
            <button type="button" onClick={() => save(draft)} disabled={saving} className="rl-btn-primary text-xs px-4">
              {saving ? 'Saving…' : 'Save'}
            </button>
          ) : (
            <button type="button" onClick={copy} disabled={!saved} className="rl-btn-ghost text-xs px-4">Copy</button>
          )}
          <button type="button" onClick={regenerate} disabled={saving} className="rl-btn-ghost text-xs px-4">New code</button>
        </div>
      )}
    </div>
  )
}
