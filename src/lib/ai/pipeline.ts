import type {
  AnalysisResult,
  AnalysisStage,
  FitAssessment,
  JobExtraction,
  RequirementMatch,
  ResumeProfile,
  TailoredResume,
  TailoringPlan,
} from '@/types'
import {
  callOpenAIJson,
  fitSchema,
  jobExtractionSchema,
  matchingSchema,
  resumeProfileSchema,
  tailoringSchema,
} from '@/lib/ai/client'
import {
  localAssessFit,
  localExtractJob,
  localExtractResume,
  localMatch,
  localTailor,
} from '@/lib/ai/localEngine'
import { getApiKey } from '@/lib/storage'
import {
  applyChangesToOriginalText,
  filterApplicableChanges,
  normalizeResumeExportText,
  sectionsFromPreservedText,
  sanitizeChanges,
  isTrivialEdit,
} from '@/lib/preserveFormat'
import { materializeDownloads } from '@/lib/generateDocs'
import { loadResumeTemplate, TEMPLATE_FILE_NAME, TEMPLATE_MIME } from '@/lib/resumeTemplate'

export type ProgressFn = (stage: AnalysisStage, detail?: string) => void

function nullToUndef<T>(v: T | null | undefined): T | undefined {
  return v == null ? undefined : v
}

async function extractResumeProfile(rawText: string): Promise<ResumeProfile> {
  if (!getApiKey()) return localExtractResume(rawText)

  try {
    const data = await callOpenAIJson<{
      name: string | null
      summary: string | null
      skills: string[]
      experience: Array<{
        title: string
        company: string
        dates: string | null
        bullets: string[]
      }>
      projects: Array<{ name: string; description: string; technologies: string[] }>
      education: Array<{ school: string; degree: string | null; dates: string | null }>
      certifications: string[]
      tools: string[]
    }>({
      schemaName: 'resume_profile',
      schema: resumeProfileSchema,
      temperature: 0,
      maxTokens: 8000,
      system: [
        'Thoroughly scan the FULL resume text.',
        'Extract EVERY role, bullet, skill, tool, project, school, and certification that appears.',
        'Copy bullet wording closely so later find-and-replace can use exact lines.',
        'Never invent fields. Use null/empty when unknown.',
        'Be exhaustive. Missing a real bullet hurts the candidate.',
      ].join(' '),
      user: `Resume text (scan every line):\n\n${rawText.slice(0, 22000)}`,
    })

    return {
      rawText,
      name: nullToUndef(data.name),
      summary: nullToUndef(data.summary),
      skills: data.skills || [],
      experience: (data.experience || []).map((e) => ({
        ...e,
        dates: nullToUndef(e.dates),
      })),
      projects: data.projects || [],
      education: (data.education || []).map((e) => ({
        ...e,
        degree: nullToUndef(e.degree),
        dates: nullToUndef(e.dates),
      })),
      certifications: data.certifications || [],
      tools: data.tools || [],
    }
  } catch {
    return localExtractResume(rawText)
  }
}

async function extractJob(rawText: string): Promise<JobExtraction> {
  if (!getApiKey()) return localExtractJob(rawText)

  try {
    const data = await callOpenAIJson<{
      title: string | null
      company: string | null
      requirements: JobExtraction['requirements']
    }>({
      schemaName: 'job_extraction',
      schema: jobExtractionSchema,
      temperature: 0,
      maxTokens: 7000,
      system: [
        'Thoroughly extract EVERY meaningful requirement from the job posting.',
        'Cover must-haves and nice-to-haves: skills, tools, years, education, certifications, responsibilities, collaboration, industry.',
        'Mark priority carefully: required vs preferred vs unspecified.',
        'Split compound bullets into separate requirements when they ask for distinct things.',
        'Aim for 10 to 25 precise requirements. Do not invent anything absent from the text.',
        'Give each requirement a stable id like req-1, req-2.',
      ].join(' '),
      user: `Job posting / requirements (extract everything they want):\n\n${rawText.slice(0, 18000)}`,
    })

    return {
      title: nullToUndef(data.title),
      company: nullToUndef(data.company),
      rawText,
      requirements: data.requirements || [],
    }
  } catch {
    return localExtractJob(rawText)
  }
}

async function matchRequirements(
  job: JobExtraction,
  resume: ResumeProfile,
): Promise<RequirementMatch[]> {
  if (!getApiKey()) return localMatch(job, resume.rawText)

  try {
    const data = await callOpenAIJson<{
      matches: Array<{
        requirementId: string
        status: RequirementMatch['status']
        evidence: string
        reasoning: string
      }>
    }>({
      schemaName: 'requirement_matching',
      schema: matchingSchema,
      temperature: 0,
      maxTokens: 8000,
      system: [
        'Compare EACH job requirement to the resume carefully.',
        'Return one match object for every requirementId. Do not skip any.',
        'strong = clear proof on the resume. partial = related but unclear. missing = not supported. unclear = posting too vague.',
        'Quote or paraphrase real resume evidence. Prefer partial/missing over false strong.',
        'Write evidence and reasoning in plain coaching language. Tell them what to keep, rewrite, or leave out.',
      ].join(' '),
      user: JSON.stringify({
        requirements: job.requirements,
        resumeProfile: {
          name: resume.name,
          summary: resume.summary,
          skills: resume.skills,
          tools: resume.tools,
          experience: resume.experience,
          projects: resume.projects,
          education: resume.education,
          certifications: resume.certifications,
        },
        resumeText: resume.rawText.slice(0, 14000),
      }).slice(0, 22000),
    })

    const byId = new Map(job.requirements.map((r) => [r.id, r]))
    const fromAi = data.matches
      .map((m) => {
        const requirement = byId.get(m.requirementId)
        if (!requirement) return null
        return {
          requirement,
          status: m.status,
          evidence: m.evidence,
          reasoning: m.reasoning,
        }
      })
      .filter(Boolean) as RequirementMatch[]

    // Guarantee every requirement appears in the report
    const seen = new Set(fromAi.map((m) => m.requirement.id))
    const missing = job.requirements
      .filter((r) => !seen.has(r.id))
      .map((requirement) => ({
        requirement,
        status: 'unclear' as const,
        evidence: 'This item was not scored cleanly. Treat it carefully.',
        reasoning: 'Only claim it if you can prove it from real experience.',
      }))

    return [...fromAi, ...missing]
  } catch {
    return localMatch(job, resume.rawText)
  }
}

function withCounts(
  fit: Omit<
    FitAssessment,
    | 'requiredMatched'
    | 'requiredPartial'
    | 'requiredMissing'
    | 'preferredMatched'
    | 'preferredPartial'
    | 'preferredMissing'
  >,
  matches: RequirementMatch[],
): FitAssessment {
  const required = matches.filter((m) => m.requirement.priority !== 'preferred')
  const preferred = matches.filter((m) => m.requirement.priority === 'preferred')
  const c = (list: RequirementMatch[], s: RequirementMatch['status']) =>
    list.filter((m) => m.status === s).length

  return {
    ...fit,
    wouldBeFit: fit.wouldBeFit?.length ? fit.wouldBeFit : [fit.whyFit].filter(Boolean),
    wouldNotBeFit: fit.wouldNotBeFit?.length ? fit.wouldNotBeFit : [fit.gaps].filter(Boolean),
    requiredMatched: c(required, 'strong'),
    requiredPartial: c(required, 'partial'),
    requiredMissing: c(required, 'missing') + c(required, 'unclear'),
    preferredMatched: c(preferred, 'strong'),
    preferredPartial: c(preferred, 'partial'),
    preferredMissing: c(preferred, 'missing') + c(preferred, 'unclear'),
  }
}

async function assessFit(
  job: JobExtraction,
  matches: RequirementMatch[],
  resume: ResumeProfile,
): Promise<FitAssessment> {
  if (!getApiKey()) return localAssessFit(matches)

  try {
    const data = await callOpenAIJson<{
      score: number
      label: FitAssessment['label']
      summary: string
      whyFit: string
      gaps: string
      wouldBeFit: string[]
      wouldNotBeFit: string[]
    }>({
      schemaName: 'fit_assessment',
      schema: fitSchema,
      temperature: 0.1,
      maxTokens: 5000,
      system: [
        'Write an honest interview-fit assessment after reviewing every match.',
        'wouldBeFit: 3 to 6 concrete reasons they WOULD be a fit / get an interview, grounded in strong matches.',
        'wouldNotBeFit: 3 to 6 concrete reasons they would struggle or NOT be a fit, grounded in missing/partial must-haves.',
        'summary, whyFit, and gaps must be plain and direct. No jargon.',
        'Missing preferred items weigh less than missing required ones.',
        'Never encourage fabricating qualifications. Score 0-100.',
      ].join(' '),
      user: JSON.stringify({
        jobTitle: job.title,
        company: job.company,
        candidateName: resume.name,
        matches: matches.map((m) => ({
          id: m.requirement.id,
          text: m.requirement.text,
          priority: m.requirement.priority,
          status: m.status,
          evidence: m.evidence,
          reasoning: m.reasoning,
        })),
      }).slice(0, 16000),
    })

    return withCounts(data, matches)
  } catch {
    return localAssessFit(matches)
  }
}

export type ResumeSourceMeta = {
  fileName?: string
  mimeType?: string
  blob?: Blob
}

function buildPreservedTailored(
  originalText: string,
  changes: TailoringChangeLike[],
  name: string | undefined,
  source?: ResumeSourceMeta,
): TailoredResume {
  const appliedChanges = filterApplicableChanges(
    originalText,
    changes.map((c) => ({
      original: c.original,
      tailored: c.tailored,
      why: c.why,
      section: nullToUndef(c.section),
      action: c.action === 'trim' ? 'trim' : 'rewrite',
    })),
  )

  let fullText = applyChangesToOriginalText(originalText, appliedChanges)
  if (!fullText.trim()) fullText = originalText
  fullText = normalizeResumeExportText(fullText)

  const baseName = (name || 'Zachary_Hutton').replace(/\s+/g, '_')

  return {
    fullText,
    fileBaseName: `${baseName}_Tailored`,
    sections: sectionsFromPreservedText(fullText),
    formatPreserved: true,
    appliedChanges,
    sourceFileName: source?.fileName || TEMPLATE_FILE_NAME,
    sourceMimeType: source?.mimeType || TEMPLATE_MIME,
    sourceBlob: source?.blob,
  }
}

/** Always attach the canonical layout DOCX as the download source. */
async function withTemplateSource(
  tailored: TailoredResume,
  source?: ResumeSourceMeta,
): Promise<TailoredResume> {
  const template = await resolveTemplate(source)
  return {
    ...tailored,
    sourceFileName: TEMPLATE_FILE_NAME,
    sourceMimeType: TEMPLATE_MIME,
    sourceBlob: template.blob,
  }
}

async function resolveTemplate(source?: ResumeSourceMeta) {
  if (source?.blob && isDocxSource(source.fileName, source.mimeType)) {
    const arrayBuffer = await source.blob.arrayBuffer()
    const mammoth = await import('mammoth')
    const extracted = await mammoth.extractRawText({ arrayBuffer })
    const text = extracted.value
      .replace(/\u0000/g, '')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[^\S\n]{2,}/g, ' ')
      .trim()
    if (text.length > 80) {
      return {
        blob: source.blob,
        text,
        fileName: TEMPLATE_FILE_NAME,
        mimeType: TEMPLATE_MIME,
      }
    }
  }
  return loadResumeTemplate()
}

function isDocxSource(fileName?: string, mimeType?: string) {
  const name = (fileName || '').toLowerCase()
  const mime = (mimeType || '').toLowerCase()
  return name.endsWith('.docx') || mime.includes('wordprocessingml')
}

type TailoringChangeLike = {
  original: string
  tailored: string
  why: string
  section?: string | null
  action?: string | null
}

async function planAndGenerate(
  resume: ResumeProfile,
  job: JobExtraction,
  matches: RequirementMatch[],
  source?: ResumeSourceMeta,
  mode: 'standard' | 'deep' = 'standard',
): Promise<{ plan: TailoringPlan; tailored: TailoredResume }> {
  if (!getApiKey()) {
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
    const deep = mode === 'deep'

    const runTailorCall = async (strict: boolean) =>
      callOpenAIJson<{
        changes: Array<{
          original: string
          tailored: string
          why: string
          section: string | null
          action: 'rewrite' | 'trim'
        }>
        notAdding: Array<{ item: string; reason: string }>
        toRemove: Array<{ item: string; reason: string }>
        emphasisNotes: string[]
        tailoredFullText: string
        sections: Array<{ heading: string; content: string }>
      }>({
        schemaName: 'tailoring_plan',
        schema: tailoringSchema,
        temperature: 0,
        maxTokens: 10000,
        system: [
          'You are carefully editing the ORIGINAL resume for ONE specific job posting.',
          'Format preservation is mandatory: find-and-replace only. Never invent a new template.',
          'Each "original" MUST be an exact contiguous substring copied from originalResumeText.',
          'CRITICAL: Every change MUST be a REAL rewrite. Adding a period, fixing spaces, or keeping the same words is FORBIDDEN and will be rejected.',
          'If you cannot make a substantive wording change for a line, omit it from changes entirely.',
          deep || strict
            ? 'DEEP TAILOR MODE: produce 10 to 18 substantive changes. Mirror the job description language aggressively but honestly. Rewrite the summary and experience/project bullets so a recruiter scanning for THIS job sees an obvious match.'
            : 'Produce 5 to 12 substantive high-value changes when evidence exists.',
          'Pull keywords and phrases from jobDescriptionText that already map to real resume evidence. Weave them into existing bullets without inventing employers, years, or skills.',
          'Example of BAD change: same sentence + period. Example of GOOD change: move React/Next.js/API language from the posting into a bullet that already proves that work.',
          'Only edit experience/project/summary body lines. NEVER edit name, contact, emails, phones, URLs, LinkedIn/GitHub/Portfolio, section headings, or dates.',
          'action=rewrite for stronger job-specific wording. action=trim to shorten off-target lines.',
          'Natural professional English. No junk phrases. No « » characters.',
          'notAdding: every missing must-have you refuse to invent, with why.',
          'toRemove: 3 to 8 themes to de-emphasize for THIS application, with why.',
          'tailoredFullText = originalResumeText with only those swaps applied.',
        ].join(' '),
        user: JSON.stringify({
          originalResumeText: resume.rawText.slice(0, 18000),
          jobTitle: job.title,
          company: job.company,
          jobDescriptionText: job.rawText.slice(0, deep || strict ? 9000 : 4000),
          strongMatches: strong.map((m) => m.requirement.text),
          partialMatches: partial.map((m) => ({
            need: m.requirement.text,
            evidence: m.evidence,
            tip: m.reasoning,
          })),
          missingMatches: missing.map((m) => ({
            need: m.requirement.text,
            priority: m.requirement.priority,
          })),
          skillsOnResume: resume.skills,
          toolsOnResume: resume.tools,
          mode,
          strict,
        }).slice(0, 28000),
      })

    let data = await runTailorCall(false)
    let applicable = filterApplicableChanges(
      resume.rawText,
      sanitizeChanges(
        data.changes.map((c) => ({
          original: c.original,
          tailored: c.tailored,
          why: c.why,
          section: nullToUndef(c.section),
          action: c.action === 'trim' ? ('trim' as const) : ('rewrite' as const),
        })),
      ),
    ).filter((c) => !isTrivialEdit(c.original, c.tailored))

    // If the model returned fake/no-op edits, force one strict retry
    if (applicable.length < (deep ? 4 : 2)) {
      data = await runTailorCall(true)
      applicable = filterApplicableChanges(
        resume.rawText,
        sanitizeChanges(
          data.changes.map((c) => ({
            original: c.original,
            tailored: c.tailored,
            why: c.why,
            section: nullToUndef(c.section),
            action: c.action === 'trim' ? ('trim' as const) : ('rewrite' as const),
          })),
        ),
      ).filter((c) => !isTrivialEdit(c.original, c.tailored))
    }

    if (deep && applicable.length < 3) {
      // Last resort: honest local rewriter that still makes real wording changes
      const local = localTailor(resume.rawText, job, matches)
      if (local.plan.changes.length >= applicable.length) {
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
    }

    const tailored = buildPreservedTailored(
      resume.rawText,
      plan.changes,
      resume.name,
      source,
    )

    return { plan, tailored }
  } catch (err) {
    console.error('[Fitline] tailor AI failed', err)
    if (mode === 'deep') {
      // Prefer a real local rewrite over silent fake period-adds
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

export async function runAnalysisPipeline(args: {
  resumeText: string
  jobText: string
  source?: ResumeSourceMeta
  onProgress?: ProgressFn
  /** When true (default), build PDF/DOCX blobs after the edit plan is ready. */
  materialize?: boolean
}): Promise<AnalysisResult> {
  const { jobText, source, onProgress, materialize = true } = args

  onProgress?.('extracting_resume', 'Loading the Fitline layout template…')
  const template = await resolveTemplate(source)
  const canonicalSource: ResumeSourceMeta = {
    fileName: TEMPLATE_FILE_NAME,
    mimeType: TEMPLATE_MIME,
    blob: template.blob,
  }

  // Always tailor against the canonical DOCX text so edits land in the template.
  const resumeProfile = await extractResumeProfile(template.text)
  resumeProfile.rawText = template.text

  onProgress?.('extracting_job', 'Listing every must-have and nice-to-have…')
  const job = await extractJob(jobText)
  if (!job.requirements.length) {
    throw new Error(
      'No requirements could be extracted from the job input. Try pasting a fuller job description.',
    )
  }

  onProgress?.('matching', 'Checking each requirement against your real experience…')
  const matches = await matchRequirements(job, resumeProfile)

  onProgress?.('assessing_fit', 'Writing why you would or would not be a fit…')
  const fit = await assessFit(job, matches, resumeProfile)

  onProgress?.('planning_tailor', 'Planning exact line edits inside your layout template…')
  const { plan, tailored } = await planAndGenerate(
    resumeProfile,
    job,
    matches,
    canonicalSource,
    'deep',
  )

  let finalTailored = await withTemplateSource(tailored, canonicalSource)
  if (materialize) {
    onProgress?.('generating', 'Writing edits into the DOCX layout and exporting PDF…')
    finalTailored = await materializeDownloads(finalTailored)
  }

  onProgress?.('done')

  return {
    resumeProfile,
    job,
    matches,
    fit,
    tailoring: plan,
    tailored: finalTailored,
    analyzedAt: Date.now(),
  }
}

/** Rebuild downloadable resume from the existing edit plan (same every time). */
export async function buildTailoredFromExistingPlan(
  result: AnalysisResult,
  onProgress?: ProgressFn,
  _source?: ResumeSourceMeta,
): Promise<AnalysisResult> {
  onProgress?.('generating', 'Rebuilding from your saved edit plan into the layout template…')
  const template = await loadResumeTemplate()
  const canonicalSource: ResumeSourceMeta = {
    fileName: TEMPLATE_FILE_NAME,
    mimeType: TEMPLATE_MIME,
    blob: template.blob,
  }

  const tailored = buildPreservedTailored(
    template.text,
    result.tailoring.changes,
    result.resumeProfile.name,
    canonicalSource,
  )
  const withSource = await withTemplateSource(tailored, canonicalSource)

  onProgress?.('done')
  return { ...result, tailored: withSource }
}

/**
 * Full rebuild: rematch → deep AI tailor for this JD → format-preserving apply → PDF/DOCX.
 * This is the slow path with a real loading sequence.
 */
export async function deepRebuildTailoredResume(
  result: AnalysisResult,
  onProgress?: ProgressFn,
  _source?: ResumeSourceMeta,
): Promise<AnalysisResult> {
  onProgress?.('extracting_resume', 'Loading the Fitline layout template…')
  const template = await loadResumeTemplate()
  const canonicalSource: ResumeSourceMeta = {
    fileName: TEMPLATE_FILE_NAME,
    mimeType: TEMPLATE_MIME,
    blob: template.blob,
  }

  const resumeProfile = {
    ...result.resumeProfile,
    rawText: template.text,
  }

  onProgress?.('matching', 'Re-checking every requirement against your resume…')
  const matches = await matchRequirements(result.job, resumeProfile)

  onProgress?.('assessing_fit', 'Refreshing fit, gaps, and interview odds…')
  const fit = await assessFit(result.job, matches, resumeProfile)

  onProgress?.(
    'planning_tailor',
    'Rewriting lines inside your exact DOCX layout…',
  )
  const { plan, tailored } = await planAndGenerate(
    resumeProfile,
    result.job,
    matches,
    canonicalSource,
    'deep',
  )

  onProgress?.('generating', 'Saving the tailored DOCX (same layout) and PDF…')
  const withSource = await withTemplateSource(tailored, canonicalSource)
  const materialized = await materializeDownloads(withSource)

  onProgress?.('done')
  return {
    ...result,
    resumeProfile,
    matches,
    fit,
    tailoring: plan,
    tailored: materialized,
  }
}

export async function regenerateTailoredResume(
  result: AnalysisResult,
  onProgress?: ProgressFn,
  _source?: ResumeSourceMeta,
): Promise<AnalysisResult> {
  onProgress?.('planning_tailor', 'Refreshing edits inside the Fitline layout template…')
  const template = await loadResumeTemplate()
  const canonicalSource: ResumeSourceMeta = {
    fileName: TEMPLATE_FILE_NAME,
    mimeType: TEMPLATE_MIME,
    blob: template.blob,
  }
  const resumeProfile = { ...result.resumeProfile, rawText: template.text }
  const { plan, tailored } = await planAndGenerate(
    resumeProfile,
    result.job,
    result.matches,
    canonicalSource,
    'deep',
  )
  const withSource = await withTemplateSource(tailored, canonicalSource)
  onProgress?.('done')
  return { ...result, resumeProfile, tailoring: plan, tailored: withSource }
}
