// Space to leave at the top for the phone's status bar / notch, as the CSS variable
// --safe-top (used by the sticky menu bars and full-screen overlays).
//
// Normally that's env(safe-area-inset-top). But an iPhone home-screen app keeps the
// status-bar style it had when its icon was added, and can draw underneath the
// status bar while still reporting a zero inset. So: measure the inset, and if it's
// zero while an installed iPhone app fills the whole screen, use the status bar's
// height instead. Android and desktop simply use the reported value.
function measure() {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;top:0;left:0;height:0;visibility:hidden;padding-top:env(safe-area-inset-top,0px)'
  document.body.appendChild(probe)
  const inset = parseFloat(getComputedStyle(probe).paddingTop) || 0
  probe.remove()

  const ios = /iphone|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches
  const portrait = window.innerHeight > window.innerWidth
  const fillsScreen = portrait && window.innerHeight >= window.screen.height - 1

  let top = inset
  if (!inset && ios && standalone && fillsScreen) {
    const h = window.screen.height
    top = h >= 852 ? 54 : h >= 812 ? 47 : 20 // Dynamic Island / notch / older iPhones
  }
  document.documentElement.style.setProperty('--safe-top', `${top}px`)
}

export function trackSafeTop() {
  measure()
  window.addEventListener('resize', measure)
  window.addEventListener('orientationchange', () => setTimeout(measure, 300))
}
