import type { AnalysisResult, AnalysisStage, TailoredResume } from '@/types'
import { extractResumeProfile } from '@/lib/ai/stages/extractResume'
import { extractJob } from '@/lib/ai/stages/extractJob'
import { matchRequirements } from '@/lib/ai/stages/matchRequirements'
import { assessFit } from '@/lib/ai/stages/assessFit'
import {
  buildPreservedTailored,
  planAndGenerate,
  withUserExportSource,
  type ResumeSourceMeta,
} from '@/lib/ai/stages/planTailor'
import { preserveWarning } from '@/lib/ai/render/preserve'
import { buildOptimizeFullText } from '@/lib/ai/render/optimize'
import { materializeDownloads } from '@/lib/generateDocs'

export type ProgressFn = (stage: AnalysisStage, detail?: string) => void
export type { ResumeSourceMeta }

function isDocxSource(fileName?: string, mimeType?: string) {
  const name = (fileName || '').toLowerCase()
  const mime = (mimeType || '').toLowerCase()
  return name.endsWith('.docx') || mime.includes('wordprocessingml')
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
  const warn = preserveWarning(renderMode, exportSource.fileName, exportSource.mimeType)
  if (warn) warnings.push(warn)

  let finalTailored: TailoredResume = {
    ...withUserExportSource(tailored, exportSource),
    renderMode,
    formatPreserved: renderMode === 'preserve',
  }

  if (renderMode === 'optimize') {
    finalTailored = {
      ...finalTailored,
      fullText: buildOptimizeFullText(resumeProfile, finalTailored),
      formatPreserved: false,
    }
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
  const mode = result.renderMode || 'preserve'
  let tailored = buildPreservedTailored(
    result.resumeProfile.rawText,
    result.tailoring.changes,
    result.resumeProfile.name,
    exportSource,
  )
  tailored = withUserExportSource(tailored, exportSource)
  if (mode === 'optimize') {
    tailored = {
      ...tailored,
      fullText: buildOptimizeFullText(result.resumeProfile, tailored),
      formatPreserved: false,
      renderMode: mode,
    }
  } else {
    tailored = { ...tailored, renderMode: mode, formatPreserved: true }
  }

  onProgress?.('done')
  return { ...result, tailored, renderMode: mode }
}

/**
 * Full rebuild: rematch → deep AI tailor → apply onto the user's content → PDF/DOCX.
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

  onProgress?.(
    'generating',
    mode === 'preserve' ? 'Applying edits to your layout…' : 'Building Fitline layout…',
  )
  let withSource: TailoredResume = {
    ...withUserExportSource(tailored, exportSource),
    renderMode: mode,
    formatPreserved: mode === 'preserve',
  }
  if (mode === 'optimize') {
    withSource = {
      ...withSource,
      fullText: buildOptimizeFullText(resumeProfile, withSource),
      formatPreserved: false,
    }
  }
  const materialized = await materializeDownloads(withSource, { mode })

  const warnings = [...(result.warnings || [])]
  const warn = preserveWarning(mode, exportSource.fileName, exportSource.mimeType)
  if (warn && !warnings.includes(warn)) warnings.push(warn)

  onProgress?.('done')
  return {
    ...result,
    resumeProfile,
    matches,
    fit,
    tailoring: plan,
    tailored: materialized,
    renderMode: mode,
    warnings,
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
  return {
    ...result,
    resumeProfile,
    tailoring: plan,
    tailored: withSource,
    renderMode: result.renderMode || 'preserve',
    warnings: result.warnings || [],
  }
}

// Re-export stages for tests / tooling
export { extractResumeProfile, extractJob, matchRequirements, assessFit, planAndGenerate }
export { isDocxSource }
