import type {
  JobExtraction,
  RequirementMatch,
  ResumeProfile,
  TailoredResume,
  TailoringChange,
  TailoringPlan,
} from '@/types'
import { callOpenAIJson, tailoringSchema } from '@/lib/ai/client'
import { localTailor } from '@/lib/ai/localEngine'
import { getApiKey } from '@/lib/storage'
import {
  applyChangesToOriginalText,
  canApplyChange,
  filterApplicableChanges,
  isTrivialEdit,
  normalizeResumeExportText,
  sanitizeChanges,
  sectionsFromPreservedText,
} from '@/lib/preserveFormat'

export type ResumeSourceMeta = {
  fileName?: string
  mimeType?: string
  blob?: Blob
}

function nullToUndef<T>(v: T | null | undefined): T | undefined {
  return v == null ? undefined : v
}

export function buildPreservedTailored(
  originalText: string,
  changes: TailoringChange[],
  name: string | undefined,
  source?: ResumeSourceMeta,
): TailoredResume {
  const sanitized = sanitizeChanges(changes)
  const appliedChanges = filterApplicableChanges(originalText, sanitized)
  const skippedChanges = sanitized.filter(
    (c) => !appliedChanges.some((a) => a.original === c.original && a.tailored === c.tailored),
  )

  let fullText = applyChangesToOriginalText(originalText, appliedChanges)
  if (!fullText.trim()) fullText = originalText
  fullText = normalizeResumeExportText(fullText)

  const baseName = (name || 'Resume').replace(/\s+/g, '_')

  return {
    fullText,
    fileBaseName: `${baseName}_Tailored`,
    sections: sectionsFromPreservedText(fullText),
    formatPreserved: true,
    appliedChanges,
    skippedChanges,
    sourceFileName: source?.fileName,
    sourceMimeType: source?.mimeType,
    sourceBlob: source?.blob,
  }
}

export function withUserExportSource(
  tailored: TailoredResume,
  source?: ResumeSourceMeta,
): TailoredResume {
  return {
    ...tailored,
    sourceFileName: source?.fileName || tailored.sourceFileName,
    sourceMimeType: source?.mimeType || tailored.sourceMimeType,
    sourceBlob: source?.blob || tailored.sourceBlob,
  }
}

/** Tailoring Plan only — no file write. Zero changes is valid when already clear. */
export async function planAndGenerate(
  resume: ResumeProfile,
  job: JobExtraction,
  matches: RequirementMatch[],
  source?: ResumeSourceMeta,
  mode: 'standard' | 'deep' = 'standard',
): Promise<{ plan: TailoringPlan; tailored: TailoredResume }> {
  const deep = mode === 'deep'
  if (!getApiKey()) {
    if (deep) {
      throw new Error(
        'Groq API key is missing. Rebuild needs a real AI pass, not the offline fallback.',
      )
    }
    const local = localTailor(resume.rawText, job, matches)
    return {
      plan: local.plan,
      tailored: buildPreservedTailored(
        resume.rawText,
        local.plan.changes,
        resume.name,
        source,
      ),
    }
  }

  try {
    const partial = matches.filter((m) => m.status === 'partial')
    const strong = matches.filter((m) => m.status === 'strong')
    const missing = matches.filter((m) => m.status === 'missing' || m.status === 'unclear')

    const runTailorCall = async (strict: boolean) =>
      callOpenAIJson<{
        changes: Array<{
          original: string
          tailored: string
          why: string
          section: string | null
          action: 'rewrite' | 'trim'
          evidence: string
        }>
        notAdding: Array<{ item: string; reason: string }>
        toRemove: Array<{ item: string; reason: string }>
        emphasisNotes: string[]
        noChangeNeeded: Array<{ section: string; note: string }>
      }>({
        schemaName: 'tailoring_plan',
        schema: tailoringSchema,
        temperature: 0,
        maxTokens: 10000,
        system: [
          'Create a Tailoring Plan for ONE job. Do NOT rewrite for the sake of rewriting.',
          'If a bullet already clearly communicates the job needs, put it in noChangeNeeded and leave it out of changes.',
          'Each change.original MUST be an exact contiguous substring from originalResumeText.',
          'Every change must be a REAL wording improvement grounded in resume evidence + job needs. Period-only edits are forbidden.',
          'evidence must quote what on the resume supports the new wording. Never invent employers, years, skills, or metrics.',
          deep || strict
            ? 'When evidence supports better framing for THIS job, produce substantive rewrites (often 4 to 12). Zero changes is OK if the resume already fits.'
            : 'Prefer 3 to 10 high-value changes when needed. Zero is OK when already clear.',
          'Only edit summary/experience/project body lines. Never edit name, contact, URLs, headings, or dates.',
          'action=rewrite or trim. notAdding = missing must-haves you refuse to invent. toRemove = off-target themes to de-emphasize.',
        ].join(' '),
        user: JSON.stringify({
          originalResumeText: resume.rawText.slice(0, 18000),
          resumeModel: {
            name: resume.name,
            contact: resume.contact,
            summary: resume.summary,
            skills: resume.skills,
            experience: resume.experience,
            projects: resume.projects,
            education: resume.education,
            tools: resume.tools,
          },
          jobTitle: job.title,
          company: job.company,
          jobDescriptionText: job.rawText.slice(0, deep || strict ? 9000 : 4000),
          responsibilities: job.responsibilities,
          strongMatches: strong.map((m) => ({ need: m.requirement.text, evidence: m.evidence })),
          partialMatches: partial.map((m) => ({
            need: m.requirement.text,
            evidence: m.evidence,
            tip: m.reasoning,
          })),
          missingMatches: missing.map((m) => ({
            need: m.requirement.text,
            priority: m.requirement.priority,
          })),
          mode,
          strict,
        }).slice(0, 28000),
      })

    let data = await runTailorCall(false)
    const mapChanges = (list: typeof data.changes) =>
      sanitizeChanges(
        list.map((c) => ({
          original: c.original,
          tailored: c.tailored,
          why: c.why,
          section: nullToUndef(c.section),
          action: c.action === 'trim' ? ('trim' as const) : ('rewrite' as const),
          evidence: c.evidence,
        })),
      ).filter((c) => !isTrivialEdit(c.original, c.tailored))

    let candidate = mapChanges(data.changes)
    let applicable = filterApplicableChanges(resume.rawText, candidate)
    const noChange = data.noChangeNeeded || []

    if (applicable.length === 0 && noChange.length === 0 && (partial.length > 0 || missing.length > 0)) {
      data = await runTailorCall(true)
      candidate = mapChanges(data.changes)
      applicable = filterApplicableChanges(resume.rawText, candidate)
    }

    const plan: TailoringPlan = {
      changes: applicable,
      notAdding: data.notAdding || [],
      toRemove: data.toRemove || [],
      emphasisNotes: data.emphasisNotes || [],
      noChangeNeeded: data.noChangeNeeded || [],
    }

    const tailored = buildPreservedTailored(resume.rawText, plan.changes, resume.name, source)
    const skipped = candidate.filter(
      (c) => !canApplyChange(resume.rawText, c.original) || isTrivialEdit(c.original, c.tailored),
    )
    if (skipped.length) {
      tailored.skippedChanges = [...(tailored.skippedChanges || []), ...skipped]
    }

    return { plan, tailored }
  } catch (err) {
    console.error('[Fitline] tailor AI failed', err)
    if (deep) {
      throw new Error(
        err instanceof Error
          ? `Could not tailor the resume: ${err.message}`
          : 'Could not tailor the resume. Check your Groq API key and try again.',
      )
    }
    const local = localTailor(resume.rawText, job, matches)
    return {
      plan: local.plan,
      tailored: buildPreservedTailored(
        resume.rawText,
        local.plan.changes,
        resume.name,
        source,
      ),
    }
  }
}
