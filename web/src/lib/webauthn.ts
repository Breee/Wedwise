import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser'

type Creation = Parameters<typeof startRegistration>[0]['optionsJSON']
type Request = Parameters<typeof startAuthentication>[0]['optionsJSON']

// Browsers built into iOS apps (WhatsApp, Instagram, …) cannot reach the
// phone's passkeys. Unlike Safari and the other real browsers, they leave
// "Safari/" out of their name.
export function inAppBrowser() {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) && !/Safari\//.test(ua)
}

export function webauthnSupported() {
  return browserSupportsWebAuthn() && !inAppBrowser()
}

export function createKey(options: { publicKey: unknown }) {
  return startRegistration({ optionsJSON: options.publicKey as Creation })
}

export function signWithKey(options: { publicKey: unknown }, autofill = false) {
  return startAuthentication({ optionsJSON: options.publicKey as Request, useBrowserAutofill: autofill })
}

// Whether the browser can offer saved passkeys in the username field.
export async function autofillSupported() {
  return webauthnSupported() && browserSupportsWebAuthnAutofill()
}
