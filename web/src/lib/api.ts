import { t } from '@/lib/i18n'
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

const MESSAGES: Record<string, string> = {
  bad_request: 'Die Eingabe ist ungültig. Bitte prüft eure Angaben.',
  unauthorized: 'Nicht angemeldet.',
  forbidden: 'Dafür fehlt die Berechtigung.',
  not_found: 'Nicht gefunden.',
  conflict: 'Das gibt es schon.',
  too_many_requests: 'Zu viele Versuche. Bitte wartet einen Moment.',
  internal_error: 'Auf dem Server ist etwas schiefgelaufen.',
  two_factor_required: 'Bitte gebt euren Anmeldecode ein.',
  invalid_code: 'Der Code stimmt nicht.',
  invalid_pin: 'Die PIN stimmt nicht.',
  link_full: 'Über diesen Link sind keine weiteren Antworten möglich.',
}

const STATUS_CODES: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  429: 'too_many_requests',
}

function extractMessage(payload: unknown, status: number): string {
  const code = extractCode(payload) ?? STATUS_CODES[status] ?? (status >= 500 ? 'internal_error' : '')
  return code in MESSAGES ? t(MESSAGES[code]) : t('Anfrage fehlgeschlagen ({status}).', { status })
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

export function errorMessage(error: unknown, fallback?: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback ?? t('Etwas ist schiefgelaufen.')
}
