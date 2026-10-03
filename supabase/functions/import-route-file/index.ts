import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Copies an organiser's KMZ/KML route file from a link into our rally-docs bucket
// and saves it on the rally. Fetching server-side avoids the organiser's site
// blocking the browser, and our copy is cached offline by the apps.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_BYTES = 25 * 1024 * 1024

// Google My Maps share links → the map's KML export
function resolveUrl(raw: string): string {
  const u = new URL(raw)
  if (/(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname.startsWith('/maps/d/')) {
    const mid = u.searchParams.get('mid')
    if (mid) return `https://www.google.com/maps/d/kml?mid=${encodeURIComponent(mid)}&forcekml=1`
  }
  return u.toString()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { rallyId, url } = await req.json()
    if (!rallyId || !url) throw new Error('Provide rallyId and url')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Only the rally's organiser (or the super admin)
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) throw new Error('Please sign in again')
    const [{ data: rally }, { data: profile }] = await Promise.all([
      supabase.from('rallies').select('organiser_id').eq('id', rallyId).maybeSingle(),
      supabase.from('user_profiles').select('is_super_admin').eq('id', user.id).maybeSingle(),
    ])
    if (!rally) throw new Error('Rally not found')
    if (rally.organiser_id !== user.id && !profile?.is_super_admin) throw new Error('You can only update rallies you added')

    let target: string
    try { target = resolveUrl(String(url).trim()) } catch { throw new Error('That doesn’t look like a web link') }
    if (!/^https?:\/\//i.test(target)) throw new Error('That doesn’t look like a web link')

    const res = await fetch(target, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RallyHQ route import)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) throw new Error(`The link returned an error (${res.status})`)
    const declared = Number(res.headers.get('content-length') || 0)
    if (declared > MAX_BYTES) throw new Error('That file is too big (over 25 MB)')
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length > MAX_BYTES) throw new Error('That file is too big (over 25 MB)')

    // KMZ is a zip ("PK"); KML is XML text
    let ext: 'kmz' | 'kml'
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) ext = 'kmz'
    else if (/<kml[\s>]/i.test(new TextDecoder().decode(bytes.slice(0, 4096)))) ext = 'kml'
    else throw new Error('That link isn’t a KMZ or KML file — check it downloads the file itself, not a web page')

    const path = `${rallyId}/route_${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('rally-docs').upload(path, bytes, {
      contentType: ext === 'kmz' ? 'application/vnd.google-earth.kmz' : 'application/vnd.google-earth.kml+xml',
      upsert: true,
    })
    if (upErr) throw upErr
    const { data: { publicUrl } } = supabase.storage.from('rally-docs').getPublicUrl(path)

    const { error } = await supabase.from('rallies').update({ route_kmz_url: publicUrl }).eq('id', rallyId)
    if (error) throw error

    return new Response(JSON.stringify({ url: publicUrl, type: ext, bytes: bytes.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
