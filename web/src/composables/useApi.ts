const jsonHeaders = { 'Content-Type': 'application/json' }

export const api = {
  get: (path: string) => fetch(`/api${path}`, { credentials: 'include' }),
  post: (path: string, body: unknown) =>
    fetch(`/api${path}`, {
      method: 'POST',
      headers: jsonHeaders,
      credentials: 'include',
      body: JSON.stringify(body),
    }),
  put: (path: string, body: unknown) =>
    fetch(`/api${path}`, {
      method: 'PUT',
      headers: jsonHeaders,
      credentials: 'include',
      body: JSON.stringify(body),
    }),
  delete: (path: string) =>
    fetch(`/api${path}`, { method: 'DELETE', credentials: 'include' }),
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * Reads a fetch Response, returning the parsed JSON body or throwing an
 * ApiError carrying the server supplied message when available.
 */
export async function unwrap<T>(response: Response): Promise<T> {
  const text = await response.text()
  let payload: unknown = null

  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }

  if (!response.ok) {
    throw new ApiError(extractMessage(payload, response.status), response.status)
  }

  return payload as T
}

function extractMessage(payload: unknown, status: number): string {
  if (typeof payload === 'string' && payload.trim() !== '') {
    return payload
  }
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    for (const key of ['error', 'message', 'detail']) {
      const value = record[key]
      if (typeof value === 'string' && value.trim() !== '') {
        return value
      }
    }
  }
  if (status === 401) return 'Not authenticated.'
  if (status === 403) return 'You are not allowed to do that.'
  if (status === 404) return 'Not found.'
  return `Request failed (${status}).`
}

export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export function useApi() {
  return { api, unwrap, errorMessage }
}

export default api
