import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser'

type Creation = Parameters<typeof startRegistration>[0]['optionsJSON']
type Request = Parameters<typeof startAuthentication>[0]['optionsJSON']

export function webauthnSupported() {
  return browserSupportsWebAuthn()
}

export function createKey(options: { publicKey: unknown }, auto = false) {
  return startRegistration({ optionsJSON: options.publicKey as Creation, useAutoRegister: auto })
}

// Whether the password manager can create a passkey by itself right after a
// password sign-in.
export async function autoCreateSupported() {
  if (!webauthnSupported()) return false
  const capabilities = await PublicKeyCredential.getClientCapabilities?.().catch(() => null)
  return capabilities?.conditionalCreate === true
}

export function signWithKey(options: { publicKey: unknown }, autofill = false) {
  return startAuthentication({ optionsJSON: options.publicKey as Request, useBrowserAutofill: autofill })
}

// Whether the browser can offer saved passkeys in the username field.
export async function autofillSupported() {
  return webauthnSupported() && browserSupportsWebAuthnAutofill()
}
