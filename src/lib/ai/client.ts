import { z } from 'zod'
import { getApiKey } from '@/lib/storage'

const HONESTY_RULES = `
CRITICAL RULES. NEVER violate these:
- DO NOT invent experience, technologies, years of experience, employers, achievements, or certifications.
- DO NOT claim a requirement is met without clear proof in the resume text.
- If something is not supported by the resume, mark it missing or unclear.
- Prefer honesty over optimism. A realistic "Stretch" or "Weak Fit" is better than a false "Strong Fit".
- Tailoring may rephrase and re-emphasize real content only. Never fabricate.
- User-facing text (summary, whyFit, gaps, evidence, reasoning, why) must be plain and direct. Tell the candidate what to keep, rewrite, or leave out. No jargon.
- Respond with valid JSON only that matches the required schema.
`.trim()

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
/** Live Groq models only. Do not use retired Meta IDs. */
const GROQ_MODEL = 'openai/gpt-oss-20b'
const GROQ_FALLBACK_MODEL = 'openai/gpt-oss-120b'

function stripNullTypes(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map(stripNullTypes)
  }
  if (schema && typeof schema === 'object') {
    const obj = schema as Record<string, unknown>
    const next: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'type' && Array.isArray(value)) {
        // Groq is happier with a single type; prefer string over null
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

export async function callOpenAIJson<T>(args: {
  system: string
  user: string
  schemaName: string
  schema: Record<string, unknown>
  temperature?: number
  maxTokens?: number
}): Promise<T> {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('NO_API_KEY')
  }

  const schema = stripNullTypes(args.schema) as Record<string, unknown>
  const messages = [
    { role: 'system', content: `${args.system}\n\n${HONESTY_RULES}` },
    { role: 'user', content: args.user },
  ]
  const max_tokens = args.maxTokens ?? 6000
  const temperature = args.temperature ?? 0.2

  const attempt = async (model: string, body: Record<string, unknown>) => {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...body, model, temperature, max_tokens }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Groq ${model} failed (${response.status}): ${errText.slice(0, 280)}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) throw new Error(`Empty Groq response from ${model}.`)
    try {
      return JSON.parse(content) as T
    } catch {
      throw new Error(`Groq ${model} returned invalid JSON.`)
    }
  }

  try {
    return await attempt(GROQ_MODEL, {
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: args.schemaName,
          strict: true,
          schema,
        },
      },
      messages,
    })
  } catch (primaryErr) {
    try {
      return await attempt(GROQ_FALLBACK_MODEL, {
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `${args.system}\n\n${HONESTY_RULES}\n\nReturn a single JSON object matching this schema name "${args.schemaName}":\n${JSON.stringify(schema)}`,
          },
          { role: 'user', content: args.user },
        ],
      })
    } catch (fallbackErr) {
      const a = primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
      const b = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
      throw new Error(`${a} | fallback: ${b}`)
    }
  }
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
