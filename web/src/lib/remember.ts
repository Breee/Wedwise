const KEY = 'wedwise:edit-token'

export function rememberedToken(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

// Remembers the guest's response on this device and points the app manifest at
// it, so an installed app opens the editable response even where it does not
// share storage with the browser.
export function rememberToken(token: string) {
  try {
    localStorage.setItem(KEY, token)
  } catch {
    // storage unavailable: the edit link still works
  }
  applyManifest(token)
}

export function forgetToken() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // nothing to forget
  }
  applyManifest(null)
}

export function applyManifest(token: string | null = rememberedToken()) {
  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
  if (!link) return
  link.href = token ? `/manifest.webmanifest?token=${encodeURIComponent(token)}` : '/manifest.webmanifest'
}
