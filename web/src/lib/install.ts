// The browser offers its install dialog once, often before any component is
// mounted, so the offer is caught at startup and kept until it is used.
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
}

let offer: InstallPromptEvent | null = null
const listeners = new Set<() => void>()

export function watchInstallOffer() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    offer = e as InstallPromptEvent
    listeners.forEach((fn) => fn())
  })
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  }
}

export function installOffer() {
  return offer
}

export function takeInstallOffer() {
  const current = offer
  offer = null
  listeners.forEach((fn) => fn())
  return current
}

export function onInstallOffer(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
