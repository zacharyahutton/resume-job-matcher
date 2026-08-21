import { z } from 'zod'
import {
  advanceKeyRotation,
  getApiKeys,
  keysStartingAtRotation,
} from '@/lib/ai/groqKeys'

const HONESTY_RULES = `
CRITICAL RULES. NEVER violate these:
- DO NOT invent experience, technologies, years of experience, employers, achievements, or certifications.
- DO NOT claim a requirement is met without clear proof in the resume text.
- If something is not supported by the resume, mark it missing or unclear.
- Prefer honesty over optimism. A realistic "Stretch" or "Weak Fit" is better than a false "Strong Fit".
- Tailoring may rephrase and re-emphasize real content only. Never fabricate.
- User-facing text (summary, whyFit, gaps, evidence, reasoning, why) must be plain and direct.
- Respond with valid JSON only that matches the required schema.
`.trim()

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
/** Stay on the smaller live model so requests fit free-tier TPM. */
const GROQ_MODEL = 'openai/gpt-oss-20b'

/** Soft cap so input + completion stays under ~8k TPM on free tier. */
const DEFAULT_MAX_TOKENS = 2800
const MAX_USER_CHARS = 10000
const MAX_SYSTEM_CHARS = 3500

export class GroqUserError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GroqUserError'
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

function parseRetryMs(errText: string): number {
  const m = errText.match(/try again in\s+([\d.]+)\s*s/i)
  if (!m) return 0
  const sec = Number(m[1])
  if (!Number.isFinite(sec) || sec <= 0) return 0
  return Math.min(Math.ceil(sec * 1000) + 250, 20000)
}

function isRateOrSizeLimit(status: number): boolean {
  return status === 429 || status === 413
}

async function fetchJsonCompletion(args: {
  apiKey: string
  model: string
  messages: Array<{ role: string; content: string }>
  temperature: number
  maxTokens: number
  responseFormat: Record<string, unknown>
}): Promise<string> {
  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
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
    err.retryMs = parseRetryMs(errText)
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
 * Call Groq with JSON output. Cycles every configured API key on 429/413,
 * retries once after a short wait if every key is hot, and never surfaces
 * raw provider dumps to the UI.
 */
export async function callOpenAIJson<T>(args: {
  system: string
  user: string
  schemaName: string
  schema: Record<string, unknown>
  temperature?: number
  maxTokens?: number
}): Promise<T> {
  const keys = getApiKeys()
  if (!keys.length) {
    throw new GroqUserError('AI is not configured yet. Please try again later.')
  }

  const schema = stripNullTypes(args.schema) as Record<string, unknown>
  const system = `${args.system}\n\n${HONESTY_RULES}`.slice(0, MAX_SYSTEM_CHARS)
  const user = args.user.slice(0, MAX_USER_CHARS)
  const maxTokens = Math.min(args.maxTokens ?? DEFAULT_MAX_TOKENS, DEFAULT_MAX_TOKENS)
  const temperature = args.temperature ?? 0.2

  const formats: Array<{ label: string; responseFormat: Record<string, unknown>; messages: Array<{ role: string; content: string }> }> =
    [
      {
        label: 'schema',
        responseFormat: {
          type: 'json_schema',
          json_schema: {
            name: args.schemaName,
            strict: true,
            schema,
          },
        },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      },
      {
        label: 'object',
        responseFormat: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `${system}\n\nReturn a single JSON object for "${args.schemaName}".`,
          },
          { role: 'user', content: user },
        ],
      },
    ]

  let sawRateLimit = false
  let lastRetryMs = 0

  for (const format of formats) {
    const orderedKeys = keysStartingAtRotation()
    for (let pass = 0; pass < 2; pass += 1) {
      if (pass === 1) {
        const wait = Math.max(lastRetryMs, 2000)
        await sleep(wait)
      }

      for (const apiKey of orderedKeys) {
        try {
          const content = await fetchJsonCompletion({
            apiKey,
            model: GROQ_MODEL,
            messages: format.messages,
            temperature,
            maxTokens,
            responseFormat: format.responseFormat,
          })
          advanceKeyRotation()
          try {
            return JSON.parse(content) as T
          } catch {
            // bad JSON → try next format / key
            console.error('[Fitline] Groq returned invalid JSON')
          }
        } catch (err) {
          const status = (err as { status?: number }).status
          const retryMs = (err as { retryMs?: number }).retryMs || 0
          if (status && isRateOrSizeLimit(status)) {
            sawRateLimit = true
            lastRetryMs = Math.max(lastRetryMs, retryMs)
            advanceKeyRotation()
            console.warn('[Fitline] Groq rate/size limit, rotating key')
            continue
          }
          if (status && status >= 500) {
            advanceKeyRotation()
            console.warn('[Fitline] Groq server error, rotating key')
            continue
          }
          // Auth / other → try next key, then next format
          console.error('[Fitline] Groq request failed', status || err)
          advanceKeyRotation()
        }
      }
    }
  }

  if (sawRateLimit) {
    throw new GroqUserError('The AI is busy right now. Please try again in a minute.')
  }
  throw new GroqUserError('Could not finish AI analysis. Please try again.')
}

// Re-export key helpers so older imports of getApiKey from storage still work via storage.ts
export { getApiKeys }


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
