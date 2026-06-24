import { i18nTool } from '@/locales'
import useAuthStore from '@/stores/auth'

const API_V2_BASE = '/dgi-backend/api_v2'

export type ApiTestForwardResult = { responseType: 'json', payload: unknown } | { responseType: 'stream', text: string, contentType?: string }

async function readReadableStreamToString(
  stream: ReadableStream<Uint8Array> | null,
): Promise<string> {
  if (!stream) return ''
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let out = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) out += decoder.decode(value, { stream: true })
    }
    out += decoder.decode()
  }
  finally {
    reader.releaseLock()
  }
  return out
}

function isStreamStyleResponse(response: Response): boolean {
  const ct = (response.headers.get('content-type') || '').toLowerCase()
  if (
    ct.includes('text/event-stream')
    || ct.includes('application/x-ndjson')
    || ct.includes('application/stream+json')
  ) {
    return true
  }
  const streamHint = response.headers.get('x-stream-response')
    || response.headers.get('x-stream')
  if (streamHint === '1' || streamHint?.toLowerCase() === 'true') return true
  return false
}

export async function postApiServiceTestForward(
  apiId: number | string,
  body: Record<string, unknown>,
  url_index?: number,
): Promise<ApiTestForwardResult> {
  const token = useAuthStore.getState().token
  const url = `${API_V2_BASE}/api_service/${apiId}/test?url_index=${url_index}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept-Language': i18nTool.getCurrentLang(),
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  }
  finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(errText || `HTTP ${response.status}`)
  }

  if (isStreamStyleResponse(response)) {
    const text = await readReadableStreamToString(response.body)
    return {
      responseType: 'stream',
      text,
      contentType: response.headers.get('content-type') ?? undefined,
    }
  }

  const text = await response.text()
  if (!text.trim()) {
    return { responseType: 'json', payload: null }
  }
  try {
    return { responseType: 'json', payload: JSON.parse(text) }
  }
  catch {
    return {
      responseType: 'stream',
      text,
      contentType: response.headers.get('content-type') ?? undefined,
    }
  }
}
