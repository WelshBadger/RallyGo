import { supabase } from './supabase'

// "RallyHQ news" notifications — a separate opt-in from rally bulletin alerts.
// Works without an account; the device's push endpoint identifies it.
const VAPID_PUBLIC_KEY = 'BIcwQ-AgPS8rQeybSdJEYAohASdl7C3vx9ls5N5BWx0qC_2Av_gx1k-USjFEeZmjeM-KYGua2tKWqIYNWvPWZc8'
const APP = 'logistics'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from([...atob(base64)].map(c => c.charCodeAt(0)))
}

// 'unsupported' | 'ios-browser' (iPhone: only works from the home-screen app) | 'blocked' | 'off' | 'on'
export async function newsPushStatus() {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches
    return ios && !standalone ? 'ios-browser' : 'unsupported'
  }
  if (Notification.permission === 'denied') return 'blocked'
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return 'off'
  const { data } = await supabase.rpc('has_news_push', { p_endpoint: sub.endpoint })
  return data ? 'on' : 'off'
}

export async function enableNewsPush() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off'
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription())
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) })
  const { endpoint, keys } = sub.toJSON()
  const { data } = await supabase.rpc('subscribe_news_push', { p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth, p_app: APP })
  return data ? 'on' : 'off'
}

// Only removes the news opt-in; the phone's rally bulletin alerts stay as they are
export async function disableNewsPush() {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) await supabase.rpc('unsubscribe_news_push', { p_endpoint: sub.endpoint })
  return 'off'
}
