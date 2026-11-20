// Thin wrappers around the browser's WebAuthn JSON helpers.
type PKC = typeof PublicKeyCredential & {
  parseCreationOptionsFromJSON?: (o: unknown) => PublicKeyCredentialCreationOptions
  parseRequestOptionsFromJSON?: (o: unknown) => PublicKeyCredentialRequestOptions
}

export function webauthnSupported() {
  if (typeof PublicKeyCredential === 'undefined') return false
  const pkc = PublicKeyCredential as PKC
  return !!pkc.parseCreationOptionsFromJSON && !!pkc.parseRequestOptionsFromJSON
}

function toJSON(credential: Credential | null): unknown {
  if (!credential) throw new Error('Abgebrochen.')
  return (credential as PublicKeyCredential & { toJSON: () => unknown }).toJSON()
}

export async function createKey(options: { publicKey: unknown }) {
  const publicKey = (PublicKeyCredential as PKC).parseCreationOptionsFromJSON!(options.publicKey)
  return toJSON(await navigator.credentials.create({ publicKey }))
}

// Only one request may wait at a time: a new one ends the autofill offer.
let waiting: AbortController | undefined

export async function signWithKey(options: { publicKey: unknown }, autofill = false) {
  const publicKey = (PublicKeyCredential as PKC).parseRequestOptionsFromJSON!(options.publicKey)
  waiting?.abort()
  waiting = new AbortController()
  const request: CredentialRequestOptions = { publicKey, signal: waiting.signal }
  if (autofill) request.mediation = 'conditional'
  return toJSON(await navigator.credentials.get(request))
}

// Whether the browser can offer saved passkeys in the username field.
export async function autofillSupported() {
  if (!webauthnSupported()) return false
  const check = (PublicKeyCredential as PKC & { isConditionalMediationAvailable?: () => Promise<boolean> })
    .isConditionalMediationAvailable
  return check ? check().catch(() => false) : false
}
