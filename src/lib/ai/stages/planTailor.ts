import type {
  JobExtraction,
  RequirementMatch,
  ResumeProfile,
  TailoredResume,
  TailoringChange,
  TailoringPlan,
} from '@/types'
import { callOpenAIJson, isAiAvailable, tailoringSchema } from '@/lib/ai/client'
import { localTailor } from '@/lib/ai/localEngine'
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
  if (!(await isAiAvailable())) {
    if (deep) {
      throw new Error('AI is not configured yet. Please try again later.')
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

    const runTailorCall = async () =>
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
        maxTokens: 900,
        system: [
          'Create a Tailoring Plan for ONE job. Do not rewrite for the sake of rewriting.',
          'change.original must be an exact substring from originalResumeText.',
          'Never invent employers, years, skills, or metrics.',
          'Prefer 3 to 8 high-value rewrites. Zero changes is OK if already clear.',
          'Only edit summary/experience/project body lines. Never edit name, contact, URLs, headings, or dates.',
        ].join(' '),
        user: JSON.stringify({
          originalResumeText: resume.rawText.slice(0, 4500),
          summary: resume.summary,
          skills: (resume.skills || []).slice(0, 20),
          experience: (resume.experience || []).slice(0, 4).map((e) => ({
            title: e.title,
            company: e.company,
            bullets: (e.bullets || []).slice(0, 4),
          })),
          projects: (resume.projects || []).slice(0, 3).map((p) => ({
            name: p.name,
            bullets: (p.bullets || []).slice(0, 3),
          })),
          jobTitle: job.title,
          company: job.company,
          jobFocus: job.rawText.slice(0, 1800),
          partial: partial.slice(0, 6).map((m) => ({
            need: m.requirement.text,
            evidence: m.evidence,
          })),
          missing: missing.slice(0, 6).map((m) => ({
            need: m.requirement.text,
            priority: m.requirement.priority,
          })),
          strong: strong.slice(0, 4).map((m) => m.requirement.text),
        }).slice(0, 7000),
      })

    let data = await runTailorCall()
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

    // One AI call only on free tier. If empty, use local tailor instead of a second burn.
    if (applicable.length === 0 && (partial.length > 0 || missing.length > 0)) {
      const local = localTailor(resume.rawText, job, matches)
      if (local.plan.changes.length > 0) {
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
    // Always finish with a usable local plan instead of stranding the user.
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
