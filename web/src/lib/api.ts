export class ApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function extractCode(payload: unknown): string | undefined {
  const error = (payload as { error?: { code?: unknown } } | null)?.error
  return error && typeof error === 'object' && typeof error.code === 'string' ? error.code : undefined
}

function extractMessage(payload: unknown, status: number): string {
  if (typeof payload === 'string' && payload.trim() !== '') return payload
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    for (const key of ['error', 'message', 'detail']) {
      const value = record[key]
      if (typeof value === 'string' && value.trim() !== '') return value
      if (value && typeof value === 'object') {
        const nested = (value as Record<string, unknown>).message
        if (typeof nested === 'string' && nested.trim() !== '') return nested
      }
    }
  }
  if (status === 401) return 'Nicht angemeldet.'
  if (status === 403) return 'Dafür fehlt die Berechtigung.'
  if (status === 404) return 'Nicht gefunden.'
  return `Anfrage fehlgeschlagen (${status}).`
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }
  if (!response.ok) throw new ApiError(extractMessage(payload, response.status), response.status, extractCode(payload))
  return payload as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
}

export function errorMessage(error: unknown, fallback = 'Etwas ist schiefgelaufen.'): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}
