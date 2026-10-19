// Marketing send — super admin only. Emails people who agreed to hear from RallyHQ
// (with a one-click unsubscribe link) via Resend, and/or sends a "RallyHQ news"
// push notification to devices that switched news notifications on.
//
// Deploy with verify_jwt = false (this project's ES256 tokens are rejected by the
// gateway); the caller is checked here against user_profiles.is_super_admin.
// Secrets: RESEND_API_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const SITE = 'https://www.rallygo.co.uk'
const FROM = 'RallyHQ <noreply@rallygo.co.uk>'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

function emailHtml(subject: string, message: string, link: string | null, linkLabel: string, unsubUrl: string) {
  const paras = message.trim().split(/\n{2,}/).map(p => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1f2937">${esc(p).replace(/\n/g, '<br>')}</p>`).join('')
  const button = link
    ? `<p style="margin:22px 0"><a href="${esc(link)}" style="display:inline-block;background:#FF9641;color:#1f1d1b;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:8px">${esc(linkLabel || 'Find out more')}</a></p>`
    : ''
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#303030;padding:18px 24px"><img src="${SITE}/icons/logo-circle.png" width="36" height="36" alt="RallyHQ" style="vertical-align:middle"> <span style="color:#ffffff;font-size:18px;font-weight:700;vertical-align:middle;margin-left:8px">Rally<span style="color:#FF9641">HQ</span></span></td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#111827">${esc(subject)}</h1>
${paras}${button}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#6b7280">
You are getting this because you agreed to hear from RallyHQ. <a href="${unsubUrl}" style="color:#6b7280">Unsubscribe</a> at any time.
</td></tr></table></td></tr></table></body></html>`
}

function emailText(subject: string, message: string, link: string | null, unsubUrl: string) {
  return `${subject}\n\n${message.trim()}\n${link ? `\n${link}\n` : ''}\n—\nYou are getting this because you agreed to hear from RallyHQ. Unsubscribe: ${unsubUrl}\n`
}

function base64urlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=')
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0))
}

function uint8ArrayToBase64url(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function signJwt(claims: Record<string, unknown>, privateKeyBytes: Uint8Array): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' }
  const enc = (obj: unknown) => uint8ArrayToBase64url(
    new TextEncoder().encode(JSON.stringify(obj))
  )
  const signingInput = `${enc(header)}.${enc(claims)}`

  const key = await crypto.subtle.importKey(
    'raw',
    privateKeyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  ).catch(() =>
    crypto.subtle.importKey(
      'jwk',
      {
        kty: 'EC', crv: 'P-256',
        d: uint8ArrayToBase64url(privateKeyBytes),
        x: '', y: ''
      },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    )
  )

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput)
  )

  return `${signingInput}.${uint8ArrayToBase64url(new Uint8Array(sig))}`
}

async function sendPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKeyRaw: Uint8Array
): Promise<Response> {
  const url = new URL(subscription.endpoint)
  const audience = `${url.protocol}//${url.host}`

  const expiry = Math.floor(Date.now() / 1000) + 12 * 3600
  const jwt = await signJwt(
    { aud: audience, exp: expiry, sub: 'mailto:carl@carlwilliamson.co.uk' },
    vapidPrivateKeyRaw
  )

  const serverKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']
  ) as CryptoKeyPair

  const serverPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverKeys.publicKey)
  )

  const clientPublicKey = await crypto.subtle.importKey(
    'raw', base64urlToUint8Array(subscription.p256dh),
    { name: 'ECDH', namedCurve: 'P-256' }, false, []
  )

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: clientPublicKey },
      serverKeys.privateKey, 256
    )
  )

  const authSecret = base64urlToUint8Array(subscription.auth)
  const salt = crypto.getRandomValues(new Uint8Array(16))

  const hkdf = async (ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number) => {
    const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
    const bits = await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8
    )
    return new Uint8Array(bits)
  }

  const concat = (...arrays: Uint8Array[]) => {
    const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0))
    let offset = 0
    for (const a of arrays) { out.set(a, offset); offset += a.length }
    return out
  }

  const keyInfo = concat(new TextEncoder().encode('Content-Encoding: aes128gcm\0'))
  const nonceInfo = concat(new TextEncoder().encode('Content-Encoding: nonce\0'))

  const prk = await hkdf(
    sharedSecret,
    concat(authSecret, new TextEncoder().encode('WebPush: info\0'), base64urlToUint8Array(subscription.p256dh), serverPublicKeyRaw),
    new Uint8Array(0),
    32
  )

  const contentEncKey = await hkdf(prk, salt, keyInfo, 16)
  const nonce = await hkdf(prk, salt, nonceInfo, 12)

  const encKey = await crypto.subtle.importKey('raw', contentEncKey, 'AES-GCM', false, ['encrypt'])

  const plaintext = new TextEncoder().encode(payload)
  const paddedPayload = concat(plaintext, new Uint8Array([2]))

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, encKey, paddedPayload)
  )

  const rs = 4096
  const header = concat(
    salt,
    new Uint8Array([0, 0, 16, 0]),
    new Uint8Array([serverPublicKeyRaw.length]),
    serverPublicKeyRaw
  )
  const rsBytes = new DataView(header.buffer, salt.length, 4)
  rsBytes.setUint32(0, rs, false)

  const body = concat(header, ciphertext)

  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt}, k=${vapidPublicKey}`,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
    },
    body,
  })
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

    // ── Super admin only ──
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return json({ error: 'Not authenticated' }, 401)
    const { data: me } = await supabase.from('user_profiles').select('is_super_admin').eq('id', user.id).maybeSingle()
    if (!me?.is_super_admin) return json({ error: 'Not authorised' }, 403)

    const body = await req.json()
    const subject = String(body.subject ?? '').trim()
    const message = String(body.message ?? '').trim()
    const link = body.link ? String(body.link).trim() : null
    const linkLabel = String(body.linkLabel ?? '').trim()
    const doEmail = !!body.email
    const doPush = !!body.push
    const test = !!body.test
    if (!subject || !message) return json({ error: 'Add a subject and a message' }, 400)
    if (link && !/^https:\/\//i.test(link)) return json({ error: 'The link must start with https://' }, 400)
    if (!doEmail && !doPush) return json({ error: 'Choose email, notifications or both' }, 400)

    const errors: string[] = []
    let emailCount = 0
    let pushCount = 0

    // ── Email ──
    if (doEmail) {
      const apiKey = Deno.env.get('RESEND_API_KEY')
      if (!apiKey) {
        errors.push('Email not sent: the RESEND_API_KEY secret is not set')
      } else {
        let recipients: string[]
        if (test) {
          recipients = user.email ? [user.email.toLowerCase()] : []
        } else {
          const [{ data: users }, { data: profiles }, { data: ups }, { data: unsubs }] = await Promise.all([
            supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
            supabase.from('profiles').select('id, marketing_consent'),
            supabase.from('user_profiles').select('id, marketing_consent'),
            supabase.from('marketing_unsubscribes').select('email'),
          ])
          const consent = new Set([
            ...(profiles || []).filter(p => p.marketing_consent).map(p => p.id),
            ...(ups || []).filter(p => p.marketing_consent).map(p => p.id),
          ])
          const blocked = new Set((unsubs || []).map(u => u.email.toLowerCase()))
          recipients = [...new Set((users?.users || [])
            .filter(u => u.email && !u.is_anonymous && consent.has(u.id))
            .map(u => u.email!.toLowerCase()))]
            .filter(e => !blocked.has(e))
        }

        if (recipients.length) {
          // one unsubscribe token per address
          await supabase.from('marketing_tokens').upsert(recipients.map(email => ({ email })), { onConflict: 'email', ignoreDuplicates: true })
          const { data: tokens } = await supabase.from('marketing_tokens').select('email, token').in('email', recipients)
          const tokenFor = new Map((tokens || []).map(t => [t.email, t.token]))

          const emails = recipients.map(to => {
            const unsubUrl = `${SITE}/unsubscribe?t=${tokenFor.get(to)}`
            return {
              from: FROM,
              to: [to],
              subject: test ? `[Test] ${subject}` : subject,
              html: emailHtml(subject, message, link, linkLabel, unsubUrl),
              text: emailText(subject, message, link, unsubUrl),
              headers: { 'List-Unsubscribe': `<${unsubUrl}>` },
            }
          })
          for (let i = 0; i < emails.length; i += 100) {
            const chunk = emails.slice(i, i + 100)
            const res = await fetch('https://api.resend.com/emails/batch', {
              method: 'POST',
              headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(chunk),
            })
            if (res.ok) emailCount += chunk.length
            else errors.push(`Email service said ${res.status}: ${(await res.text()).slice(0, 200)}`)
          }
        }
      }
    }

    // ── Push (RallyHQ news opt-in only) ──
    if (doPush) {
      let q = supabase.from('news_push_subscriptions').select('endpoint, p256dh, auth, app, user_id')
      if (test) q = q.eq('user_id', user.id)
      const { data: subs } = await q
      if (subs?.length) {
        const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')!
        const vapidPrivate = base64urlToUint8Array(Deno.env.get('VAPID_PRIVATE_KEY')!)
        const results = await Promise.allSettled(subs.map(s => sendPush(
          { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
          JSON.stringify({
            title: test ? `[Test] ${subject}` : subject,
            body: message.length > 180 ? message.slice(0, 177) + '…' : message,
            url: link || (s.app === 'logistics' ? 'https://rallylogistics.rallygo.co.uk/' : `${SITE}/`),
            icon: '/icons/app-icon-192.png',
            badge: '/icons/badge-96.png',
          }),
          vapidPublic, vapidPrivate,
        )))
        for (let i = 0; i < results.length; i++) {
          const r = results[i]
          if (r.status === 'fulfilled' && r.value.ok) pushCount++
          else if (r.status === 'fulfilled' && (r.value.status === 404 || r.value.status === 410)) {
            await supabase.from('news_push_subscriptions').delete().eq('endpoint', subs[i].endpoint) // phone unsubscribed
          }
        }
      } else if (test) {
        errors.push('No test notification sent: switch on RallyHQ news notifications on your own phone first (while signed in)')
      }
    }

    await supabase.from('marketing_sends').insert({
      subject, message, link_url: link, test,
      channels: [doEmail && 'email', doPush && 'push'].filter(Boolean),
      email_count: emailCount, push_count: pushCount, errors: errors.join(' | ') || null,
    })

    return json({ emailCount, pushCount, errors })
  } catch (err) {
    return json({ error: (err as Error).message }, 400)
  }
})
