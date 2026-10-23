/**
 * Server-only Groq proxy. The browser calls this route with no API key.
 * GROQ_API_KEY is read from the host environment and never returned.
 * Do not import this module from client code.
 */

const UPSTREAM_URL = 'https://api.groq.com/openai/v1/chat/completions'
const ALLOWED_MODELS = new Set(['openai/gpt-oss-20b'])
const MAX_TOKENS_CAP = 1024
const MAX_BODY_BYTES = 48 * 1024
const MAX_MESSAGES = 6
const MAX_MESSAGE_CHARS = 8000
const MAX_TOTAL_CHARS = 12000
const UPSTREAM_TIMEOUT_MS = 25_000

const RETRY_HINT_HEADERS = [
  'retry-after',
  'x-ratelimit-limit-requests',
  'x-ratelimit-limit-tokens',
  'x-ratelimit-remaining-requests',
  'x-ratelimit-remaining-tokens',
  'x-ratelimit-reset-requests',
  'x-ratelimit-reset-tokens',
]

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '48kb',
    },
  },
}

type HeaderMap = Record<string, string | string[] | undefined>

export interface GroqProxyInput {
  method: string
  headers: HeaderMap
  body?: unknown
  rawBodyLength?: number
}

export interface GroqProxyResult {
  status: number
  headers: Record<string, string>
  body: string
}

interface ApiRequest {
  method?: string
  headers: HeaderMap
  body?: unknown
}

interface ApiResponse {
  status: (code: number) => ApiResponse
  setHeader: (name: string, value: string) => void
  send: (body: string) => void
}

function serverEnv(name: string): string {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  const value = proc?.env?.[name]
  return typeof value === 'string' ? value.trim() : ''
}

function header(headers: HeaderMap, name: string): string {
  const value = headers[name] ?? headers[name.toLowerCase()]
  if (Array.isArray(value)) return value[0] || ''
  return typeof value === 'string' ? value : ''
}

function jsonResult(status: number, payload: unknown, extra?: Record<string, string>): GroqProxyResult {
  return {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extra,
    },
    body: JSON.stringify(payload),
  }
}

function redactSecrets(text: string): string {
  return text.replace(/gsk_[A-Za-z0-9_-]+/g, '[redacted]')
}

function bodyTooLarge(input: GroqProxyInput): boolean {
  const declared = Number(header(input.headers, 'content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return true
  if (input.rawBodyLength != null && input.rawBodyLength > MAX_BODY_BYTES) return true
  if (input.body == null) return false
  try {
    return JSON.stringify(input.body).length > MAX_BODY_BYTES
  } catch {
    return true
  }
}

function normalizeHost(value: string): string {
  const host = value.trim().toLowerCase()
  return host.replace(/:443$/, '').replace(/:80$/, '')
}

function sameOrigin(headers: HeaderMap): boolean {
  const origin = header(headers, 'origin').trim()
  if (!origin) return true
  let originHost = ''
  try {
    originHost = normalizeHost(new URL(origin).host)
  } catch {
    return false
  }
  const forwarded = header(headers, 'x-forwarded-host').split(',')[0] || ''
  const host = header(headers, 'host').split(',')[0] || ''
  const expected = normalizeHost(forwarded || host)
  return Boolean(expected) && originHost === expected
}

function parseBody(body: unknown): unknown {
  if (typeof body !== 'string') return body
  try {
    return JSON.parse(body) as unknown
  } catch {
    return body
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export async function handleGroq(input: GroqProxyInput): Promise<GroqProxyResult> {
  const method = (input.method || 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'POST') {
    return jsonResult(405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' })
  }
  if (!sameOrigin(input.headers)) {
    return jsonResult(403, { error: 'cross_origin_forbidden' })
  }
  if (bodyTooLarge(input)) {
    return jsonResult(413, { error: 'request_too_large' })
  }

  const apiKey = serverEnv('GROQ_API_KEY')
  if (method === 'GET') {
    return jsonResult(200, { available: Boolean(apiKey) })
  }
  if (!apiKey) {
    return jsonResult(503, { error: 'ai_not_configured' })
  }

  const parsed = parseBody(input.body)
  if (!isRecord(parsed)) {
    return jsonResult(400, { error: 'invalid_body' })
  }
  if (parsed.stream === true) {
    return jsonResult(400, { error: 'streaming_not_supported' })
  }

  const model = typeof parsed.model === 'string' ? parsed.model : ''
  if (!ALLOWED_MODELS.has(model)) {
    return jsonResult(400, { error: 'model_not_allowed' })
  }

  const rawMessages = parsed.messages
  if (!Array.isArray(rawMessages) || rawMessages.length < 1 || rawMessages.length > MAX_MESSAGES) {
    return jsonResult(400, { error: 'invalid_messages' })
  }

  const messages: Array<{ role: string; content: string }> = []
  let totalChars = 0
  for (const entry of rawMessages) {
    if (!isRecord(entry)) return jsonResult(400, { error: 'invalid_messages' })
    const role = entry.role
    const content = entry.content
    if (role !== 'system' && role !== 'user' && role !== 'assistant') {
      return jsonResult(400, { error: 'invalid_messages' })
    }
    if (typeof content !== 'string') return jsonResult(400, { error: 'invalid_messages' })
    if (content.length > MAX_MESSAGE_CHARS) return jsonResult(413, { error: 'request_too_large' })
    totalChars += content.length
    if (totalChars > MAX_TOTAL_CHARS) return jsonResult(413, { error: 'request_too_large' })
    messages.push({ role, content })
  }

  const format = parsed.response_format
  if (!isRecord(format) || format.type !== 'json_object' || Object.keys(format).length !== 1) {
    return jsonResult(400, { error: 'unsupported_response_format' })
  }

  let maxTokens = MAX_TOKENS_CAP
  if (parsed.max_tokens != null) {
    if (typeof parsed.max_tokens !== 'number' || !Number.isFinite(parsed.max_tokens)) {
      return jsonResult(400, { error: 'invalid_max_tokens' })
    }
    if (parsed.max_tokens < 1) return jsonResult(400, { error: 'invalid_max_tokens' })
    maxTokens = Math.min(Math.floor(parsed.max_tokens), MAX_TOKENS_CAP)
  }

  let temperature = 0.2
  if (parsed.temperature != null) {
    if (typeof parsed.temperature !== 'number' || !Number.isFinite(parsed.temperature)) {
      return jsonResult(400, { error: 'invalid_temperature' })
    }
    temperature = Math.min(1, Math.max(0, parsed.temperature))
  }

  const payload = {
    model,
    temperature,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' as const },
    messages,
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    const upstream = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const text = redactSecrets(await upstream.text())
    const headers: Record<string, string> = {
      'Cache-Control': 'no-store',
      'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    }
    for (const name of RETRY_HINT_HEADERS) {
      const value = upstream.headers.get(name)
      if (value) headers[name] = value
    }
    return { status: upstream.status, headers, body: text }
  } catch {
    return jsonResult(504, { error: 'upstream_timeout' })
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const result = await handleGroq({
    method: req.method || 'GET',
    headers: req.headers || {},
    body: req.body,
  })
  for (const [name, value] of Object.entries(result.headers)) {
    res.setHeader(name, value)
  }
  res.status(result.status).send(result.body)
}
