// Finds the organiser's map for a stage. Maps from the "Stage maps & route" card can
// carry a stage number; older uploads are matched by their label ("SS3", "SS 3",
// "Stage 3" or the stage name). Stage-tagged documents in the Event schedule
// section are the last resort.
export function stageMapFor(stage, rally, docs = []) {
  const num = String(stage.number)
  const maps = Array.isArray(rally?.stage_maps) ? rally.stage_maps : []

  const tagged = maps.find(m => m.stage != null && String(m.stage) === num)
  if (tagged) return { url: tagged.url, type: tagged.type }

  const byLabel = maps.find(m => {
    const label = String(m.label || '').toLowerCase()
    if (new RegExp(`\\b(ss|stage)\\s*0*${num}\\b`).test(label)) return true
    const name = String(stage.name || '').toLowerCase().trim()
    return name.length > 3 && label.includes(name)
  })
  if (byLabel) return { url: byLabel.url, type: byLabel.type }

  const doc = docs.find(d => String(d.stage_number) === num && (d.file_url || d.link_url))
  if (doc) return { url: doc.file_url || doc.link_url, type: doc.file_type }

  return null
}
