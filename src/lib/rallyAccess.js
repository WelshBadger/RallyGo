import { supabase } from './supabase'

// Rallies this device has unlocked with the organiser's code: { [rallyId]: code }
const KEY = 'rallyhq:unlocked'

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} }
}

function writeAll(map) {
  try { localStorage.setItem(KEY, JSON.stringify(map)) } catch { /* storage unavailable */ }
}

export function getStoredCode(rallyId) {
  return readAll()[rallyId] || null
}

export function storeCode(rallyId, code) {
  writeAll({ ...readAll(), [rallyId]: code })
}

export function forgetCode(rallyId) {
  const map = readAll()
  delete map[rallyId]
  writeAll(map)
}

// A random id for this device, so organisers can see how many devices opened their rally
function deviceId() {
  try {
    let id = localStorage.getItem('rallyhq:device')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('rallyhq:device', id)
    }
    return id
  } catch {
    return null
  }
}

// true / false from the server, or null when it couldn't be reached (offline)
export async function checkRallyCode(rallyId, code) {
  try {
    const { data, error } = await supabase.rpc('check_rally_code', { p_rally_id: rallyId, p_code: code, p_device: deviceId() })
    if (error) return null
    return data === true
  } catch {
    return null
  }
}
