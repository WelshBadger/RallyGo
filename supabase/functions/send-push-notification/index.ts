import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { rallyId, title, body: msgBody, section, url: customUrl, app, excludeUserId } = await req.json()

    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!

    const vapidPrivateKeyBytes = base64urlToUint8Array(VAPID_PRIVATE_KEY)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    let query = supabase
      .from('push_subscriptions')
      .select('*')
      .eq('rally_id', rallyId)

    if (app) query = query.eq('app', app)
    if (excludeUserId) query = query.neq('user_id', excludeUserId)

    const { data: subs } = await query

    if (!subs?.length) {
      return new Response(JSON.stringify({ sent: 0, failed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Deep-link: explicit url wins; otherwise the RallyHQ section page.
    // www: the bare domain is a redirect, which needs signal, so it wouldn't open offline.
    const appOrigin = 'https://www.rallygo.co.uk'
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

    const results = await Promise.allSettled(
      subs.map(sub =>
        sendPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          payload,
          VAPID_PUBLIC_KEY,
          vapidPrivateKeyBytes
        )
      )
    )

    const sent = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length

    return new Response(JSON.stringify({ sent, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
