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

export type ProgressFn = (stage: AnalysisStage, detail?: string) => void

function nullToUndef<T>(v: T | null | undefined): T | undefined {
  return v == null ? undefined : v
}

async function extractResumeProfile(rawText: string): Promise<ResumeProfile> {
  if (!getApiKey()) return localExtractResume(rawText)

  try {
    const data = await callOpenAIJson<{
      name: string | null
      contact: {
        email: string | null
        phone: string | null
        location: string | null
        links: string[]
      }
      summary: string | null
      skills: string[]
      experience: Array<{
        id: string
        title: string
        company: string
        dates: string | null
        bullets: string[]
        technologies: string[]
      }>
      projects: Array<{
        id: string
        name: string
        description: string
        technologies: string[]
        bullets: string[]
      }>
      education: Array<{
        id: string
        school: string
        degree: string | null
        dates: string | null
      }>
      certifications: string[]
      tools: string[]
      otherSections: Array<{ heading: string; content: string }>
      extractionNotes: string[]
    }>({
      schemaName: 'resume_profile',
      schema: resumeProfileSchema,
      temperature: 0,
      maxTokens: 10000,
      system: [
        'Build a thorough Canonical Resume Model from the FULL resume text.',
        'Extract contact, summary, every role with every bullet, projects, education, skills, tools, certifications, and other sections.',
        'Copy bullet and summary wording closely so later edits can find exact strings in the original.',
        'List technologies only when they appear in that entry or nearby text. Never invent.',
        'Ids like exp-1, proj-1, edu-1. extractionNotes for unclear parsing only.',
        'Thorough enough for good decisions — not a bloated schema dump.',
      ].join(' '),
      user: `Resume text (understand everything present):\n\n${rawText.slice(0, 24000)}`,
    })

    return {
      rawText,
      name: nullToUndef(data.name),
      contact: {
        email: nullToUndef(data.contact?.email),
        phone: nullToUndef(data.contact?.phone),
        location: nullToUndef(data.contact?.location),
        links: data.contact?.links || [],
      },
      summary: nullToUndef(data.summary),
      skills: data.skills || [],
      experience: (data.experience || []).map((e) => ({
        id: e.id,
        title: e.title,
        company: e.company,
        dates: nullToUndef(e.dates),
        bullets: e.bullets || [],
        technologies: e.technologies || [],
      })),
      projects: (data.projects || []).map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        technologies: p.technologies || [],
        bullets: p.bullets || [],
      })),
      education: (data.education || []).map((e) => ({
        id: e.id,
        school: e.school,
        degree: nullToUndef(e.degree),
        dates: nullToUndef(e.dates),
      })),
      certifications: data.certifications || [],
      tools: data.tools || [],
      otherSections: data.otherSections || [],
      extractionNotes: data.extractionNotes || [],
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
      responsibilities: string[]
      requirements: JobExtraction['requirements']
    }>({
      schemaName: 'job_extraction',
      schema: jobExtractionSchema,
      temperature: 0,
      maxTokens: 7000,
      system: [
        'Extract a Job Model from the posting.',
        'List responsibilities separately from requirements.',
        'Cover must-haves and nice-to-haves: skills, tools, years, education, certifications, collaboration.',
        'Mark priority: required vs preferred vs unspecified.',
        'Split compound asks. Aim for 10 to 25 precise requirements. Never invent.',
        'Ids like req-1, req-2.',
      ].join(' '),
      user: `Job posting:\n\n${rawText.slice(0, 18000)}`,
    })

    return {
      title: nullToUndef(data.title),
      company: nullToUndef(data.company),
      rawText,
      responsibilities: data.responsibilities || [],
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

  const baseName = (name || 'Resume').replace(/\s+/g, '_')

  return {
    fullText,
    fileBaseName: `${baseName}_Tailored`,
    sections: sectionsFromPreservedText(fullText),
    formatPreserved: true,
    appliedChanges,
    sourceFileName: source?.fileName,
    sourceMimeType: source?.mimeType,
    sourceBlob: source?.blob,
  }
}

/** Keep the user's own file as the export source. Layout style comes from Fitline classic rebuild when needed. */
function withUserExportSource(
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
          'If a bullet already clearly communicates React/TypeScript/REST (or whatever the job needs), put it in noChangeNeeded and leave it out of changes.',
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
    let applicable = filterApplicableChanges(
      resume.rawText,
      sanitizeChanges(
        data.changes.map((c) => ({
          original: c.original,
          tailored: c.tailored,
          why: c.why,
          section: nullToUndef(c.section),
          action: c.action === 'trim' ? ('trim' as const) : ('rewrite' as const),
          evidence: c.evidence,
        })),
      ),
    ).filter((c) => !isTrivialEdit(c.original, c.tailored))

    const noChange = data.noChangeNeeded || []
    // Retry only when we expected edits (partial gaps) but got nothing usable and no "leave alone" notes
    if (applicable.length === 0 && noChange.length === 0 && (partial.length > 0 || missing.length > 0)) {
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
            evidence: c.evidence,
          })),
        ),
      ).filter((c) => !isTrivialEdit(c.original, c.tailored))
    }

    if (deep && applicable.length === 0 && (data.noChangeNeeded || []).length === 0) {
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
  renderMode?: import('@/types').RenderMode
  /** When true, build PDF/DOCX after the plan. Default false so the user reviews the plan first. */
  materialize?: boolean
}): Promise<AnalysisResult> {
  const {
    resumeText,
    jobText,
    source,
    onProgress,
    renderMode = 'preserve',
    materialize = false,
  } = args

  onProgress?.('extracting_resume', 'Understanding every section of your resume…')
  const userText = (resumeText || '').trim()
  if (userText.length < 40) {
    throw new Error('Upload your resume first. Fitline needs your content.')
  }

  const resumeProfile = await extractResumeProfile(userText)
  resumeProfile.rawText = userText

  const exportSource: ResumeSourceMeta = {
    fileName: source?.fileName,
    mimeType: source?.mimeType,
    blob: source?.blob,
  }

  onProgress?.('extracting_job', 'Listing every must-have and nice-to-have…')
  const job = await extractJob(jobText)
  if (!job.requirements.length) {
    throw new Error(
      'No requirements could be extracted from the job input. Try pasting a fuller job description.',
    )
  }

  onProgress?.('matching', 'Comparing your evidence to what they want…')
  const matches = await matchRequirements(job, resumeProfile)

  onProgress?.('assessing_fit', 'Deciding fit, gaps, and interview odds…')
  const fit = await assessFit(job, matches, resumeProfile)

  onProgress?.('planning_tailor', 'Deciding what to change and what to leave alone…')
  const { plan, tailored } = await planAndGenerate(
    resumeProfile,
    job,
    matches,
    exportSource,
    'deep',
  )

  const warnings: string[] = []
  if (renderMode === 'preserve' && !isDocxSource(exportSource.fileName, exportSource.mimeType)) {
    warnings.push(
      'Preserve works best with DOCX. PDF keeps your content and section order; exact PDF design cannot be cloned.',
    )
  }

  let finalTailored: TailoredResume = {
    ...withUserExportSource(tailored, exportSource),
    renderMode,
    formatPreserved: renderMode === 'preserve',
  }

  if (materialize) {
    onProgress?.('generating', 'Building your downloadable resume…')
    finalTailored = await materializeDownloads(finalTailored, { mode: renderMode })
  }

  onProgress?.('done')

  return {
    resumeProfile,
    job,
    matches,
    fit,
    tailoring: plan,
    tailored: finalTailored,
    renderMode,
    warnings,
    analyzedAt: Date.now(),
  }
}

function isDocxSource(fileName?: string, mimeType?: string) {
  const name = (fileName || '').toLowerCase()
  const mime = (mimeType || '').toLowerCase()
  return name.endsWith('.docx') || mime.includes('wordprocessingml')
}

/** Rebuild downloadable resume from the existing edit plan (same every time). */
export async function buildTailoredFromExistingPlan(
  result: AnalysisResult,
  onProgress?: ProgressFn,
  source?: ResumeSourceMeta,
): Promise<AnalysisResult> {
  onProgress?.('generating', 'Rebuilding your tailored resume from the saved edit plan…')
  const exportSource: ResumeSourceMeta = source || {
    fileName: result.tailored?.sourceFileName,
    mimeType: result.tailored?.sourceMimeType,
    blob: result.tailored?.sourceBlob,
  }
  const tailored = buildPreservedTailored(
    result.resumeProfile.rawText,
    result.tailoring.changes,
    result.resumeProfile.name,
    exportSource,
  )
  const withSource = withUserExportSource(tailored, exportSource)

  onProgress?.('done')
  return { ...result, tailored: withSource }
}

/**
 * Full rebuild: rematch → deep AI tailor for this JD → apply onto the user's content → PDF/DOCX.
 */
export async function deepRebuildTailoredResume(
  result: AnalysisResult,
  onProgress?: ProgressFn,
  source?: ResumeSourceMeta,
): Promise<AnalysisResult> {
  onProgress?.('extracting_resume', 'Using your uploaded resume content…')
  const exportSource: ResumeSourceMeta = source || {
    fileName: result.tailored?.sourceFileName,
    mimeType: result.tailored?.sourceMimeType,
    blob: result.tailored?.sourceBlob,
  }
  const mode = result.renderMode || 'preserve'

  const resumeProfile = {
    ...result.resumeProfile,
    rawText: result.resumeProfile.rawText,
  }

  onProgress?.('matching', 'Re-checking every requirement against your resume…')
  const matches = await matchRequirements(result.job, resumeProfile)

  onProgress?.('assessing_fit', 'Refreshing fit, gaps, and interview odds…')
  const fit = await assessFit(result.job, matches, resumeProfile)

  onProgress?.('planning_tailor', 'Refreshing the tailoring plan for this job…')
  const { plan, tailored } = await planAndGenerate(
    resumeProfile,
    result.job,
    matches,
    exportSource,
    'deep',
  )

  onProgress?.('generating', mode === 'preserve' ? 'Applying edits to your layout…' : 'Building Fitline layout…')
  const withSource = {
    ...withUserExportSource(tailored, exportSource),
    renderMode: mode,
    formatPreserved: mode === 'preserve',
  }
  const materialized = await materializeDownloads(withSource, { mode })

  onProgress?.('done')
  return {
    ...result,
    resumeProfile,
    matches,
    fit,
    tailoring: plan,
    tailored: materialized,
    renderMode: mode,
  }
}

export async function regenerateTailoredResume(
  result: AnalysisResult,
  onProgress?: ProgressFn,
  source?: ResumeSourceMeta,
): Promise<AnalysisResult> {
  onProgress?.('planning_tailor', 'Refreshing edits on your resume content…')
  const exportSource: ResumeSourceMeta = source || {
    fileName: result.tailored?.sourceFileName,
    mimeType: result.tailored?.sourceMimeType,
    blob: result.tailored?.sourceBlob,
  }
  const resumeProfile = result.resumeProfile
  const { plan, tailored } = await planAndGenerate(
    resumeProfile,
    result.job,
    result.matches,
    exportSource,
    'deep',
  )
  const withSource = withUserExportSource(tailored, exportSource)
  onProgress?.('done')
  return { ...result, resumeProfile, tailoring: plan, tailored: withSource }
}
