import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.30.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PROMPT = `Extract the competitor entry list from this content and return a JSON array. Each entry should have:

[
  {
    "car": "car/entry number as a string",
    "driver": "driver full name",
    "codriver": "co-driver full name or empty string",
    "class": "class or category (e.g. RC2, Junior, Class 1)",
    "vehicle": "car make and model (e.g. Ford Fiesta Rally2)",
    "club": "club or team name or empty string",
    "nationality": "nationality abbreviation or empty string"
  }
]

Return ONLY a valid JSON array, no other text. If a field is not present use an empty string. Include every competitor listed.`

// Sort entries by car number numerically (falling back to string sort)
function sortByCarNumber(entries: Record<string, string>[]): Record<string, string>[] {
  return [...entries].sort((a, b) => {
    const na = parseInt(a.car, 10)
    const nb = parseInt(b.car, 10)
    if (!isNaN(na) && !isNaN(nb)) return na - nb
    return a.car.localeCompare(b.car)
  })
}

// Detect rallies.info /webentry/ URLs and return the direct JSON API endpoint
function getRalliesInfoDataUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname === 'www.rallies.info' && u.pathname.includes('/webentry/')) {
      const dataPath = u.pathname.replace(/\/entries$/, '/entries_get.php')
      if (dataPath === u.pathname) return null
      const type = u.searchParams.get('type') || ''
      return `https://www.rallies.info${dataPath}?combined=0&mixed=0${type ? '&type=' + encodeURIComponent(type) : ''}`
    }
  } catch {
    // ignore
  }
  return null
}

// sneakattackrally.com "ARA Entry Lists" (American Rally Association). The page is
// built in the browser from data/season.json + data/allEntries.json, so read those.
// The rally is picked by the ?search= term, matched against each event's search tokens.
async function fetchAraEntries(url: string): Promise<Record<string, string>[] | null> {
  let u: URL
  try { u = new URL(url) } catch { return null }
  if (!/(^|\.)sneakattackrally\.com$/.test(u.hostname) || !u.pathname.includes('/ARACombinerThing/')) return null

  const base = `${u.origin}${u.pathname.slice(0, u.pathname.indexOf('/ARACombinerThing/'))}/ARACombinerThing/data/`
  const get = async (file: string) => {
    const res = await fetch(`${base}${file}?v=${Date.now()}`, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error(`Entry list site returned ${res.status}`)
    return res.json()
  }
  const [season, allEntries] = await Promise.all([get('season.json'), get('allEntries.json')])
  if (!Array.isArray(season) || !Array.isArray(allEntries)) throw new Error('Unexpected data from the entry list site')

  const q = (u.searchParams.get('search') || '').toLowerCase().trim()
  if (!q) throw new Error('This entry list link has no ?search= part, so the rally can’t be identified. Copy the link with the rally selected.')
  const event = season.find((e: any) => (e.search || []).some((t: string) => q.includes(t.toLowerCase()) || t.toLowerCase().includes(q)))
    || season.find((e: any) => String(e.title || '').toLowerCase().includes(q))
  if (!event) throw new Error(`No rally matching "${q}" on the entry list site`)

  // Running order, as the site shows it: the official start order once published
  // (first day), otherwise seeded by ARA speed factor (alt factor when there's none).
  // The car number is the running position; the ARA door number is kept as `door`.
  const title = String(event.title)
  const mine = allEntries.filter((e: any) => e.rally === title || String(e.rally || '').startsWith(`${title} - `))
  if (mine.length === 0) throw new Error(`No entries listed yet for ${title}`)

  let startOrder: Map<number, number> | null = null
  try {
    const orders = await get(`${event.season}/startOrders.json`)
    const day = Array.isArray(orders) ? orders.find((o: any) => o.slug === event.name) : null
    if (day?.entries?.length) startOrder = new Map(day.entries.map((x: any) => [Number(x.uid), Number(x.order)]))
  } catch { /* no start order published yet */ }

  const speed = (e: any) => Number(e.driver?.sf) || Number(e.driver?.sfAlt) || 0
  const ranked = [...mine].sort((a: any, b: any) => {
    if (!!a.waitlist !== !!b.waitlist) return a.waitlist ? 1 : -1
    if (startOrder) {
      const oa = startOrder.get(Number(a.driverUID)) ?? Infinity
      const ob = startOrder.get(Number(b.driverUID)) ?? Infinity
      if (oa !== ob) return oa - ob
    }
    return speed(b) - speed(a) || (a.regOrder ?? 0) - (b.regOrder ?? 0)
  })

  return ranked.map((e: any, i: number) => ({
    car: String(i + 1),
    door: String(e.number ?? ''),
    driver: [e.driverF, e.driverL].filter(Boolean).join(' ').trim(),
    codriver: [e.codriverF, e.codriverL].filter(Boolean).join(' ').trim(),
    class: String(e.carClass ?? ''),
    vehicle: String(e.car ?? '').trim(),
    club: String(e.driver?.tn ?? '').trim(),
    nationality: '',
  }))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { rallyId, pdfBase64, url, text } = await req.json()
    if (!rallyId) throw new Error('Missing rallyId')
    if (!pdfBase64 && !url && !text) throw new Error('Provide pdfBase64, url, or text')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Only the rally's organiser (or the super admin) may replace its entry list
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) throw new Error('Please sign in again')
    const [{ data: rally }, { data: profile }] = await Promise.all([
      supabase.from('rallies').select('organiser_id').eq('id', rallyId).maybeSingle(),
      supabase.from('user_profiles').select('is_super_admin').eq('id', user.id).maybeSingle(),
    ])
    if (!rally) throw new Error('Rally not found')
    if (rally.organiser_id !== user.id && !profile?.is_super_admin) throw new Error('You can only update rallies you added')

    let messageContent: any[] = []
    let directEntries: Record<string, string>[] | null = null

    if (pdfBase64) {
      messageContent = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
        { type: 'text', text: PROMPT },
      ]
    } else if (text) {
      messageContent = [{ type: 'text', text: `${PROMPT}\n\nEntry list content:\n\n${text.slice(0, 40000)}` }]
    } else {
      // Check for rallies.info — fetch JSON directly, no AI needed
      const ralliesInfoUrl = getRalliesInfoDataUrl(url)
      directEntries = await fetchAraEntries(url)
      if (directEntries) {
        // ARA entry list site handled above
      } else if (ralliesInfoUrl) {
        const res = await fetch(ralliesInfoUrl, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) throw new Error(`rallies.info returned ${res.status}`)
        const raw: any[] = await res.json()
        if (!Array.isArray(raw)) throw new Error('Unexpected response from rallies.info')
        directEntries = raw.map(e => ({
          car: String(e.no ?? ''),
          driver: String(e.pe_name_d ?? '').trim(),
          codriver: String(e.pe_name_n ?? '').trim(),
          class: String(e.ca_class ?? ''),
          vehicle: [String(e.ca_make ?? ''), String(e.ca_model ?? '')].map(s => s.trim()).filter(Boolean).join(' '),
          club: String(e.pe_club_d ?? '').trim(),
          nationality: '',
        })).filter(e => e.car || e.driver)

        if (directEntries.length === 0) throw new Error('No entries found at this rallies.info URL')
        directEntries = sortByCarNumber(directEntries)
      } else {
        // Generic URL fetch — works for server-rendered pages only
        let pageText = ''
        try {
          const res = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-GB,en;q=0.5',
            },
            signal: AbortSignal.timeout(10000),
          })
          const html = await res.text()
          pageText = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim()
            .slice(0, 40000)
          if (pageText.length < 200) {
            throw new Error('PAGE_JS_RENDERED')
          }
        } catch (e: any) {
          if (e.message === 'PAGE_JS_RENDERED') throw new Error('This page requires JavaScript to load — please use PDF upload or paste the entry list text instead.')
          throw new Error(`Could not fetch URL: ${e.message}`)
        }
        messageContent = [{ type: 'text', text: `${PROMPT}\n\nPage content:\n\n${pageText}` }]
      }
    }

    let normalised: Record<string, string>[]

    if (directEntries) {
      normalised = directEntries
    } else {
      const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '' })
      const response = await client.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 8096,
        messages: [{ role: 'user', content: messageContent }],
      })

      const content = response.content[0]
      if (content.type !== 'text') throw new Error('Unexpected AI response type')

      const raw = content.text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()

      let entries: Record<string, string>[]
      try {
        entries = JSON.parse(raw)
        if (!Array.isArray(entries)) throw new Error('Not an array')
      } catch {
        throw new Error('AI could not parse the entry list from this content — try a different source')
      }

      normalised = entries.map(e => ({
        car: String(e.car ?? ''),
        driver: String(e.driver ?? ''),
        codriver: String(e.codriver ?? ''),
        class: String(e.class ?? ''),
        vehicle: String(e.vehicle ?? ''),
        club: String(e.club ?? ''),
        nationality: String(e.nationality ?? ''),
      })).filter(e => e.car || e.driver)

      if (normalised.length === 0) throw new Error('No entries found in this content')
      normalised = sortByCarNumber(normalised)
    }

    const { error } = await supabase.from('rallies').update({ entry_list_data: normalised }).eq('id', rallyId)
    if (error) throw error

    return new Response(JSON.stringify({ data: normalised, count: normalised.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
