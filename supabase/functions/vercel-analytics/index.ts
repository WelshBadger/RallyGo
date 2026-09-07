// Vercel Web Analytics proxy
//
// The Vercel access token is account-wide (it can redeploy or delete projects),
// so it must never reach the browser. It lives here as a function secret.
//
// Deploy with --no-verify-jwt: the functions gateway rejects this project's
// ES256 asymmetric JWTs (UNAUTHORIZED_ASYMMETRIC_JWT), so the auth check is
// done inside the function instead, against user_profiles.is_super_admin.
//
// Required secrets: VERCEL_TOKEN, VERCEL_PROJECT_RALLYGO,
//                   VERCEL_PROJECT_LOGISTICS, VERCEL_TEAM_ID (optional)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PROJECTS: Record<string, string> = {
  rallygo:   Deno.env.get('VERCEL_PROJECT_RALLYGO')   ?? '',
  logistics: Deno.env.get('VERCEL_PROJECT_LOGISTICS') ?? '',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

async function vercel(path: string, params: Record<string, unknown>) {
  const token = Deno.env.get('VERCEL_TOKEN')
  if (!token) throw new Error('VERCEL_TOKEN secret is not set on this function')

  const url = new URL('https://api.vercel.com' + path)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  const text = await res.text()

  if (!res.ok) {
    throw new Error(`Vercel ${res.status} on ${path} — ${text.slice(0, 300)}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Vercel returned non-JSON on ${path} — ${text.slice(0, 200)}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── Auth (done here, not at the gateway) ──
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!jwt) return json({ error: 'Not authenticated' }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: { user }, error: userErr } = await admin.auth.getUser(jwt)
    if (userErr || !user) return json({ error: 'Not authenticated' }, 401)

    const { data: profile } = await admin
      .from('user_profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .single()

    if (!profile?.is_super_admin) return json({ error: 'Not authorised' }, 403)

    // ── Query ──
    const body = await req.json().catch(() => ({}))
    const app   = body.app   ?? 'rallygo'
    const since = body.since
    const until = body.until
    const by    = body.by    ?? 'requestPath'

    const projectId = PROJECTS[app]
    if (!projectId) {
      return json({ error: `No Vercel project id configured for "${app}". Set VERCEL_PROJECT_${String(app).toUpperCase()}.` }, 400)
    }

    const base = {
      projectId,
      teamId: Deno.env.get('VERCEL_TEAM_ID') || undefined,
      since,
      until,
    }

    // Settled, not all — a failure in one endpoint shouldn't blank the panel.
    const [totals, breakdown] = await Promise.allSettled([
      vercel('/v1/query/web-analytics/visits/count', base),
      vercel('/v1/query/web-analytics/visits/aggregate', { ...base, by, limit: 20 }),
    ])

    return json({
      app,
      since,
      until,
      totals:    totals.status    === 'fulfilled' ? totals.value    : null,
      breakdown: breakdown.status === 'fulfilled' ? breakdown.value : null,
      errors: [
        totals.status    === 'rejected' ? String(totals.reason?.message    ?? totals.reason)    : null,
        breakdown.status === 'rejected' ? String(breakdown.reason?.message ?? breakdown.reason) : null,
      ].filter(Boolean),
    })
  } catch (err) {
    return json({ error: (err as Error).message }, 400)
  }
})
