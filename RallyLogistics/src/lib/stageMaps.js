// Stage numbers a map's label covers: "SS3", "Stage 3", "ss1/6", "SS12/14/16",
// "SS 4 & 9", "ss13,15" → [3], [3], [1, 6], [12, 14, 16], [4, 9], [13, 15]
function stagesInLabel(label) {
  const nums = []
  const re = /\b(?:ss|stage)\s*((?:\d+)(?:\s*(?:\/|,|&|\+|and)\s*\d+)*)/gi
  let m
  while ((m = re.exec(label)) !== null) {
    m[1].split(/\s*(?:\/|,|&|\+|and)\s*/i).forEach(n => nums.push(String(Number(n))))
  }
  return nums
}

// Finds the organiser's map for a stage. Maps from the "Stage maps & route" card can
// carry a stage number; otherwise they're matched by label (including repeat passes
// like "ss1/6") or the stage name. A repeat pass with no map of its own uses the map
// of an earlier stage with the same name. Stage-tagged documents in the Event
// schedule section are the last resort.
export function stageMapFor(stage, rally, docs = []) {
  const num = String(stage.number)
  const maps = Array.isArray(rally?.stage_maps) ? rally.stage_maps : []

  const find = (n, name) => {
    const tagged = maps.find(m => m.stage != null && String(m.stage) === n)
    if (tagged) return tagged
    const byNumber = maps.find(m => stagesInLabel(String(m.label || '')).includes(n))
    if (byNumber) return byNumber
    const nm = String(name || '').toLowerCase().trim()
    return nm.length > 3 ? maps.find(m => String(m.label || '').toLowerCase().includes(nm)) : null
  }

  let map = find(num, stage.name)
  if (!map) {
    const stages = Array.isArray(rally?.regulations_data?.stages) ? rally.regulations_data.stages : []
    const name = String(stage.name || '').toLowerCase().trim()
    const twin = name && stages.find(s => String(s.number) !== num && String(s.name || '').toLowerCase().trim() === name && find(String(s.number), null))
    if (twin) map = find(String(twin.number), null)
  }
  if (map) return { url: map.url, type: map.type }

  const doc = docs.find(d => String(d.stage_number) === num && (d.file_url || d.link_url))
  if (doc) return { url: doc.file_url || doc.link_url, type: doc.file_type }

  return null
}
