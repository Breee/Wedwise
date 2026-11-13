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

export async function signWithKey(options: { publicKey: unknown }) {
  const publicKey = (PublicKeyCredential as PKC).parseRequestOptionsFromJSON!(options.publicKey)
  return toJSON(await navigator.credentials.get({ publicKey }))
}
