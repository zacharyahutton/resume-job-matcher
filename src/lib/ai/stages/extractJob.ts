import type { JobExtraction } from '@/types'
import { callOpenAIJson, jobExtractionSchema } from '@/lib/ai/client'
import { localExtractJob } from '@/lib/ai/localEngine'
import { getApiKeys } from '@/lib/storage'

function nullToUndef<T>(v: T | null | undefined): T | undefined {
  return v == null ? undefined : v
}

/** Job posting → Job Model. */
export async function extractJob(rawText: string): Promise<JobExtraction> {
  if (!getApiKeys().length) return localExtractJob(rawText)

  try {
    const data = await callOpenAIJson<{
      title: string | null
      company: string | null
      responsibilities: string[]
      requirements: JobExtraction['requirements']
    }>({
      schemaName: 'job_extraction',
      schema: jobExtractionSchema,
      temperature: 0,
      maxTokens: 2800,
      system: [
        'Extract a Job Model from the posting.',
        'List responsibilities separately from requirements.',
        'Cover must-haves and nice-to-haves: skills, tools, years, education, certifications, collaboration.',
        'Mark priority: required vs preferred vs unspecified.',
        'Split compound asks. Aim for 10 to 25 precise requirements. Never invent.',
        'Ids like req-1, req-2.',
      ].join(' '),
      user: `Job posting:\n\n${rawText.slice(0, 9000)}`,
    })

    return {
      title: nullToUndef(data.title),
      company: nullToUndef(data.company),
      rawText,
      responsibilities: data.responsibilities || [],
      requirements: data.requirements || [],
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'GroqUserError') throw err
    return localExtractJob(rawText)
  }
}
