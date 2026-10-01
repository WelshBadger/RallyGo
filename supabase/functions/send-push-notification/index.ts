// Web Push sender for RallyGo and Rally Logistics.
//
// Body: { rallyId, title, body, section?, url?, app?, excludeUserId? } -> { sent, failed }
//
// Deploy with --no-verify-jwt: the functions gateway rejects this project's
// ES256 asymmetric JWTs (UNAUTHORIZED_ASYMMETRIC_JWT), so the signed-in check
// is done inside the function instead.
//
// Encryption is RFC 8291 (aes128gcm) and the VAPID header RFC 8292, on WebCrypto.
// Earlier versions put the key info into the HKDF salt and imported the private
// key in a form WebCrypto refuses, so no browser could decrypt what was sent.
//
// Required secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (also used by aniela-alarms)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

const te = new TextEncoder()

function base64urlToUint8Array(s: string): Uint8Array {
  const b = s.replace(/-/g, '+').replace(/_/g, '/')
  const p = b + '='.repeat((4 - (b.length % 4)) % 4)
  return Uint8Array.from(atob(p), (c) => c.charCodeAt(0))
}

function uint8ArrayToBase64url(a: Uint8Array): string {
  let s = ''
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0))
  let offset = 0
  for (const a of arrays) { out.set(a, offset); offset += a.length }
  return out
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8))
}

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''

let signingKey: CryptoKey | null = null
async function vapidKey(): Promise<CryptoKey> {
  if (signingKey) return signingKey
  const pub = base64urlToUint8Array(VAPID_PUBLIC_KEY) // 0x04 || x(32) || y(32)
  const priv = base64urlToUint8Array(VAPID_PRIVATE_KEY)
  signingKey = priv.length > 32
    // stored as PKCS#8 rather than the bare 32-byte scalar
    ? await crypto.subtle.importKey('pkcs8', priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
    : await crypto.subtle.importKey(
        'jwk',
        {
          kty: 'EC', crv: 'P-256', ext: true,
          d: uint8ArrayToBase64url(priv),
          x: uint8ArrayToBase64url(pub.slice(1, 33)),
          y: uint8ArrayToBase64url(pub.slice(33, 65)),
        },
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign'],
      )
  return signingKey
}

async function vapidJwt(audience: string): Promise<string> {
  const enc = (obj: unknown) => uint8ArrayToBase64url(te.encode(JSON.stringify(obj)))
  const input = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: 'mailto:carl@carlwilliamson.co.uk',
  })}`
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await vapidKey(), te.encode(input)))
  return `${input}.${uint8ArrayToBase64url(sig)}`
}

// RFC 8291: salt = auth secret, IKM = ECDH secret, info = "WebPush: info\0" || ua_public || as_public
async function encrypt(p256dh: string, authSecret: string, payload: string): Promise<Uint8Array> {
  const uaPublic = base64urlToUint8Array(p256dh)
  const auth = base64urlToUint8Array(authSecret)
  const server = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', server.publicKey))
  const clientKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, server.privateKey, 256))

  const ikm = await hkdf(auth, ecdh, concat(te.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12)

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(te.encode(payload), new Uint8Array([2]))),
  )
  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, 4096)
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext)
}

type Sub = { endpoint: string; p256dh: string; auth: string }

async function sendPush(sub: Sub, payload: string): Promise<Response> {
  const url = new URL(sub.endpoint)
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${await vapidJwt(`${url.protocol}//${url.host}`)}, k=${VAPID_PUBLIC_KEY}`,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
    },
    body: await encrypt(sub.p256dh, sub.auth, payload),
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Signed-in users only (the gateway check is off, see above)
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: auth } = await supabase.auth.getUser(token)
    if (!auth?.user) return json({ error: 'Sign in first' }, 401)

    const { rallyId, title, body: msgBody, section, url: customUrl, app, excludeUserId } = await req.json()
    if (!rallyId) return json({ error: 'rallyId is required' }, 400)

    let query = supabase.from('push_subscriptions').select('*').eq('rally_id', rallyId)
    if (app) query = query.eq('app', app)
    if (excludeUserId) query = query.or(`user_id.is.null,user_id.neq.${excludeUserId}`)

    const { data: subs } = await query
    if (!subs?.length) return json({ sent: 0, failed: 0 })

    // Deep-link: explicit url wins; otherwise RallyGo section page
    const appOrigin = 'https://rallygo.co.uk'
    const deepLinkUrl = customUrl
      ? customUrl
      : section
        ? `${appOrigin}/event/${rallyId}/${section}`
        : `${appOrigin}/event/${rallyId}/bulletins`

    const payload = JSON.stringify({
      title,
      body: msgBody,
      rallyId,
      url: deepLinkUrl,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
    })

    let sent = 0
    let failed = 0
    const gone: string[] = []
    await Promise.all(subs.map(async (sub) => {
      try {
        const res = await sendPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload)
        if (res.ok) sent++
        else {
          failed++
          // the browser unsubscribed or the subscription expired
          if (res.status === 404 || res.status === 410) gone.push(sub.endpoint)
          else console.log('push rejected', res.status, await res.text())
        }
      } catch (e) {
        failed++
        console.log('push error', String(e))
      }
    }))
    if (gone.length) await supabase.from('push_subscriptions').delete().in('endpoint', gone)

    return json({ sent, failed })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
