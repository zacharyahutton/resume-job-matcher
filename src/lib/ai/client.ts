import { z } from 'zod'

const HONESTY_RULES = `
Never invent employers, skills, years, metrics, or certifications.
Only use evidence from the resume. Prefer honesty over optimism.
Return valid JSON only.
`.trim()

/** Same-origin serverless proxy. The API key stays on the server. */
const GROQ_PROXY = '/api/groq'
/** Stay on the smaller live model so requests fit free-tier TPM. */
const GROQ_MODEL = 'openai/gpt-oss-20b'

const LEGACY_KEY_STORAGE = ['fitline_groq_key', 'fitline_groq_keys', 'fitline_openai_key']

/** Drop keys saved by older builds so they cannot be reused from this browser. */
function forgetLegacyKeys() {
  try {
    if (typeof localStorage === 'undefined') return
    for (const key of LEGACY_KEY_STORAGE) localStorage.removeItem(key)
  } catch {
    // private mode / disabled storage
  }
}

forgetLegacyKeys()

let availabilityCache: boolean | null = null
let availabilityPromise: Promise<boolean> | null = null

/** True when the server reports a Groq key is configured. Replaces client-side key checks. */
export async function isAiAvailable(): Promise<boolean> {
  if (availabilityCache !== null) return availabilityCache
  if (!availabilityPromise) {
    availabilityPromise = (async () => {
      try {
        const response = await fetch(GROQ_PROXY, { method: 'GET', cache: 'no-store' })
        if (!response.ok) return false
        const data = (await response.json()) as { available?: unknown }
        return data.available === true
      } catch {
        return false
      }
    })().then((ok) => {
      availabilityCache = ok
      return ok
    })
  }
  return availabilityPromise
}

/**
 * Free tier for gpt-oss-20b is ~8k TPM org-wide (all keys share it).
 * Groq counts input tokens + max_tokens against that cap per request.
 */
const DEFAULT_MAX_TOKENS = 900
const MAX_USER_CHARS = 4200
const MAX_SYSTEM_CHARS = 1200
const MAX_ATTEMPTS = 4
const MAX_WAIT_MS = 12000


export class GroqUserError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GroqUserError'
  }
}

type StatusFn = (message: string) => void
let statusHook: StatusFn | null = null

/** Pipeline binds this so Groq waits update the loader text. */
export function bindGroqStatus(fn: StatusFn | null) {
  statusHook = fn
}

function reportStatus(message: string) {
  try {
    statusHook?.(message)
  } catch {
    // ignore UI hook errors
  }
}

function stripNullTypes(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map(stripNullTypes)
  }
  if (schema && typeof schema === 'object') {
    const obj = schema as Record<string, unknown>
    const next: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'type' && Array.isArray(value)) {
        const nonNull = value.filter((t) => t !== 'null')
        next[key] = nonNull.length === 1 ? nonNull[0] : nonNull
      } else {
        next[key] = stripNullTypes(value)
      }
    }
    return next
  }
  return schema
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function retryMsFromText(errText: string): number | null {
  const m = errText.match(/try again in\s+([\d.]+)\s*s/i)
  if (!m) return null
  const sec = Number(m[1])
  if (!Number.isFinite(sec) || sec <= 0) return null
  return Math.min(Math.ceil(sec * 1000) + 400, MAX_WAIT_MS)
}

function retryMsFromHeader(response: Response): number | null {
  const header = response.headers.get('retry-after')
  if (!header) return null
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(Math.ceil(seconds * 1000) + 400, MAX_WAIT_MS)
  }
  const when = Date.parse(header)
  if (!Number.isFinite(when)) return null
  return Math.min(Math.max(when - Date.now(), 500), MAX_WAIT_MS)
}

/** Honor Groq's wait from the body or Retry-After, with a little buffer. */
function parseRetryMs(response: Response, errText: string): number {
  return retryMsFromText(errText) ?? retryMsFromHeader(response) ?? 8000
}

function isRateOrSizeLimit(status: number): boolean {
  return status === 429 || status === 413
}

async function fetchJsonCompletion(args: {
  model: string
  messages: Array<{ role: string; content: string }>
  temperature: number
  maxTokens: number
  responseFormat: Record<string, unknown>
}): Promise<string> {
  const response = await fetch(GROQ_PROXY, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: args.model,
      temperature: args.temperature,
      max_tokens: args.maxTokens,
      response_format: args.responseFormat,
      messages: args.messages,
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    const err = new Error(`HTTP_${response.status}`) as Error & {
      status: number
      body: string
      retryMs: number
    }
    err.status = response.status
    err.body = errText
    err.retryMs = parseRetryMs(response, errText)
    throw err
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new Error('EMPTY')
  }
  return content
}

/**
 * Call the server proxy for JSON output.
 * On 429 waits for the provider retry window and tries again.
 * On 413 shrinks the prompt and retries.
 * On 5xx waits briefly and tries again.
 */
export async function callOpenAIJson<T>(args: {
  system: string
  user: string
  schemaName: string
  schema: Record<string, unknown>
  temperature?: number
  maxTokens?: number
}): Promise<T> {
  if (!(await isAiAvailable())) {
    throw new GroqUserError('AI is not configured yet. Please try again later.')
  }

  const schema = stripNullTypes(args.schema) as Record<string, unknown>
  let system = `${args.system}\n\n${HONESTY_RULES}`.slice(0, MAX_SYSTEM_CHARS)
  let user = args.user.slice(0, MAX_USER_CHARS)
  let maxTokens = Math.min(args.maxTokens ?? DEFAULT_MAX_TOKENS, DEFAULT_MAX_TOKENS)
  const temperature = args.temperature ?? 0.2
  const schemaHint = JSON.stringify(schema).slice(0, 1200)

  let sawRateLimit = false
  let lastErr: unknown

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    reportStatus(
      attempt === 0 ? 'Working on your analysis…' : 'Still working. Almost there…',
    )
    const responseFormat: Record<string, unknown> = {
      type: 'json_object',
    }

    const messages = [
      {
        role: 'system',
        content: `${system}\n\nReturn a single JSON object for "${args.schemaName}" matching keys like: ${schemaHint}`,
      },
      { role: 'user', content: user },
    ]

    try {
      const content = await fetchJsonCompletion({
        model: GROQ_MODEL,
        messages,
        temperature,
        maxTokens,
        responseFormat,
      })
      try {
        return JSON.parse(content) as T
      } catch {
        console.error('[Fitline] AI returned invalid JSON, retrying')
        lastErr = new Error('INVALID_JSON')
      }
    } catch (err) {
      lastErr = err
      const status = (err as { status?: number }).status
      const retryMs = Math.min((err as { retryMs?: number }).retryMs || 8000, MAX_WAIT_MS)

      if (status && isRateOrSizeLimit(status)) {
        sawRateLimit = true
        if (status === 413) {
          user = user.slice(0, Math.floor(user.length * 0.65))
          system = system.slice(0, Math.floor(system.length * 0.85))
          maxTokens = Math.max(500, Math.floor(maxTokens * 0.7))
          reportStatus('Tightening the request size…')
          console.warn('[Fitline] AI request too large, shrinking and retrying')
        } else {
          const secs = Math.ceil(retryMs / 1000)
          reportStatus(`Server is busy. Waiting ${secs}s, then continuing…`)
          console.warn(`[Fitline] rate limited, waiting ${secs}s`)
          await sleep(retryMs)
        }
        continue
      }

      if (status && status >= 500) {
        reportStatus('Temporary issue. Retrying…')
        await sleep(1200)
        continue
      }

      console.error('[Fitline] AI request failed', status || err)
    }
  }

  console.error('[Fitline] AI exhausted retries', lastErr)
  if (sawRateLimit) {
    throw new GroqUserError('The service is busy right now. Please try again in a minute.')
  }
  throw new GroqUserError('Could not finish analysis. Please try again.')
}


export const resumeProfileSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: ['string', 'null'] },
    contact: {
      type: 'object',
      additionalProperties: false,
      properties: {
        email: { type: ['string', 'null'] },
        phone: { type: ['string', 'null'] },
        location: { type: ['string', 'null'] },
        links: { type: 'array', items: { type: 'string' } },
      },
      required: ['email', 'phone', 'location', 'links'],
    },
    summary: { type: ['string', 'null'] },
    skills: { type: 'array', items: { type: 'string' } },
    experience: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          company: { type: 'string' },
          dates: { type: ['string', 'null'] },
          bullets: { type: 'array', items: { type: 'string' } },
          technologies: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'title', 'company', 'dates', 'bullets', 'technologies'],
      },
    },
    projects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          technologies: { type: 'array', items: { type: 'string' } },
          bullets: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'name', 'description', 'technologies', 'bullets'],
      },
    },
    education: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          school: { type: 'string' },
          degree: { type: ['string', 'null'] },
          dates: { type: ['string', 'null'] },
        },
        required: ['id', 'school', 'degree', 'dates'],
      },
    },
    certifications: { type: 'array', items: { type: 'string' } },
    tools: { type: 'array', items: { type: 'string' } },
    otherSections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          heading: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['heading', 'content'],
      },
    },
    extractionNotes: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'name',
    'contact',
    'summary',
    'skills',
    'experience',
    'projects',
    'education',
    'certifications',
    'tools',
    'otherSections',
    'extractionNotes',
  ],
} as const

export const jobExtractionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: ['string', 'null'] },
    company: { type: ['string', 'null'] },
    responsibilities: { type: 'array', items: { type: 'string' } },
    requirements: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          text: { type: 'string' },
          category: {
            type: 'string',
            enum: [
              'skill',
              'preferred_skill',
              'responsibility',
              'years_experience',
              'education',
              'certification',
              'technical',
              'industry',
              'collaboration',
              'tool',
              'other',
            ],
          },
          priority: {
            type: 'string',
            enum: ['required', 'preferred', 'unspecified'],
          },
        },
        required: ['id', 'text', 'category', 'priority'],
      },
    },
  },
  required: ['title', 'company', 'responsibilities', 'requirements'],
} as const

export const matchingSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirementId: { type: 'string' },
          status: {
            type: 'string',
            enum: ['strong', 'partial', 'missing', 'unclear'],
          },
          evidence: { type: 'string' },
          reasoning: { type: 'string' },
        },
        required: ['requirementId', 'status', 'evidence', 'reasoning'],
      },
    },
  },
  required: ['matches'],
} as const

export const fitSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    score: { type: 'number' },
    label: {
      type: 'string',
      enum: ['Strong Fit', 'Reasonable Fit', 'Stretch', 'Weak Fit'],
    },
    summary: { type: 'string' },
    whyFit: { type: 'string' },
    gaps: { type: 'string' },
    wouldBeFit: { type: 'array', items: { type: 'string' } },
    wouldNotBeFit: { type: 'array', items: { type: 'string' } },
  },
  required: ['score', 'label', 'summary', 'whyFit', 'gaps', 'wouldBeFit', 'wouldNotBeFit'],
} as const

export const tailoringSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    changes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          original: { type: 'string' },
          tailored: { type: 'string' },
          why: { type: 'string' },
          section: { type: ['string', 'null'] },
          action: { type: 'string', enum: ['rewrite', 'trim'] },
          evidence: { type: 'string' },
        },
        required: ['original', 'tailored', 'why', 'section', 'action', 'evidence'],
      },
    },
    notAdding: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          item: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['item', 'reason'],
      },
    },
    toRemove: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          item: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['item', 'reason'],
      },
    },
    emphasisNotes: { type: 'array', items: { type: 'string' } },
    noChangeNeeded: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          section: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['section', 'note'],
      },
    },
  },
  required: ['changes', 'notAdding', 'toRemove', 'emphasisNotes', 'noChangeNeeded'],
} as const

export const FitResultZod = z.object({
  score: z.number(),
  label: z.enum(['Strong Fit', 'Reasonable Fit', 'Stretch', 'Weak Fit']),
  summary: z.string(),
  whyFit: z.string(),
  gaps: z.string(),
  wouldBeFit: z.array(z.string()).default([]),
  wouldNotBeFit: z.array(z.string()).default([]),
})
