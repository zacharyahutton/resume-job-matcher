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
import { extractTextFromBlob, looksBadlyExtracted } from '@/lib/parseResume'
import { normalizeResumeExportText } from '@/lib/preserveFormat'
import { getApiKeys } from '@/lib/storage'

export type ProgressFn = (stage: AnalysisStage, detail?: string) => void
export type { ResumeSourceMeta }

function isDocxSource(fileName?: string, mimeType?: string) {
  const name = (fileName || '').toLowerCase()
  const mime = (mimeType || '').toLowerCase()
  return name.endsWith('.docx') || mime.includes('wordprocessingml')
}

function requireGroqForDeepWork() {
  if (!getApiKeys().length) {
    throw new Error('AI is not configured yet. Please try again later.')
  }
}

/** Prefer a fresh DOCX extract over stale/corrupt stored PDF text. */
async function resolveResumeText(
  fallback: string,
  source?: ResumeSourceMeta,
  onProgress?: ProgressFn,
): Promise<{ text: string; warnings: string[] }> {
  const warnings: string[] = []
  let text = normalizeResumeExportText((fallback || '').trim())

  if (source?.blob && isDocxSource(source.fileName, source.mimeType)) {
    try {
      onProgress?.('extracting_resume', 'Re-reading your DOCX for clean text…')
      text = await extractTextFromBlob(source.blob, source.fileName, source.mimeType, (m) =>
        onProgress?.('extracting_resume', m),
      )
    } catch {
      warnings.push('Could not re-read DOCX. Using the text saved from your last upload.')
    }
  } else if (source?.blob && looksBadlyExtracted(text)) {
    try {
      onProgress?.('extracting_resume', 'Re-reading your file to fix damaged PDF text…')
      text = await extractTextFromBlob(source.blob, source.fileName, source.mimeType, (m) =>
        onProgress?.('extracting_resume', m),
      )
    } catch {
      // keep cleaned fallback
    }
  }

  text = normalizeResumeExportText(text)

  if (looksBadlyExtracted(text)) {
    warnings.push(
      'Resume text still looks damaged from PDF extraction. Upload a DOCX for accurate wording and layout.',
    )
  }

  if (text.length < 40) {
    throw new Error('Upload your resume first. Fitline needs your content.')
  }

  return { text, warnings }
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
  const { text: userText, warnings: extractWarnings } = await resolveResumeText(
    resumeText,
    source,
    onProgress,
  )

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

  const warnings: string[] = [...extractWarnings]
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
  const { text, warnings: extractWarnings } = await resolveResumeText(
    result.resumeProfile.rawText,
    exportSource,
    onProgress,
  )
  let tailored = buildPreservedTailored(
    text,
    result.tailoring.changes,
    result.resumeProfile.name,
    exportSource,
  )
  tailored = withUserExportSource(tailored, exportSource)
  if (mode === 'optimize') {
    tailored = {
      ...tailored,
      fullText: buildOptimizeFullText({ ...result.resumeProfile, rawText: text }, tailored),
      formatPreserved: false,
      renderMode: mode,
    }
  } else {
    tailored = { ...tailored, renderMode: mode, formatPreserved: true }
  }

  onProgress?.('done')
  return {
    ...result,
    resumeProfile: { ...result.resumeProfile, rawText: text },
    tailored,
    renderMode: mode,
    warnings: [...(result.warnings || []), ...extractWarnings],
  }
}

/**
 * Full rebuild: rematch → deep AI tailor → apply onto the user's content → PDF/DOCX.
 */
export async function deepRebuildTailoredResume(
  result: AnalysisResult,
  onProgress?: ProgressFn,
  source?: ResumeSourceMeta,
): Promise<AnalysisResult> {
  requireGroqForDeepWork()

  onProgress?.('extracting_resume', 'Refreshing clean resume text…')
  const exportSource: ResumeSourceMeta = source || {
    fileName: result.tailored?.sourceFileName,
    mimeType: result.tailored?.sourceMimeType,
    blob: result.tailored?.sourceBlob,
  }
  const mode = result.renderMode || 'preserve'

  const { text, warnings: extractWarnings } = await resolveResumeText(
    result.resumeProfile.rawText,
    exportSource,
    onProgress,
  )

  const resumeProfile = {
    ...result.resumeProfile,
    rawText: text,
  }

  onProgress?.('matching', 'Re-checking every requirement against your resume…')
  const matches = await matchRequirements(result.job, resumeProfile)

  onProgress?.('assessing_fit', 'Refreshing fit, gaps, and interview odds…')
  const fit = await assessFit(result.job, matches, resumeProfile)

  onProgress?.('planning_tailor', 'Running a full Groq tailor pass for this job…')
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

  const warnings = [...(result.warnings || []), ...extractWarnings]
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
  requireGroqForDeepWork()
  onProgress?.('planning_tailor', 'Refreshing deep edit suggestions with Groq…')
  const exportSource: ResumeSourceMeta = source || {
    fileName: result.tailored?.sourceFileName,
    mimeType: result.tailored?.sourceMimeType,
    blob: result.tailored?.sourceBlob,
  }
  const { text, warnings: extractWarnings } = await resolveResumeText(
    result.resumeProfile.rawText,
    exportSource,
    onProgress,
  )
  const resumeProfile = { ...result.resumeProfile, rawText: text }
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
    warnings: [...(result.warnings || []), ...extractWarnings],
  }
}

export { extractResumeProfile, extractJob, matchRequirements, assessFit, planAndGenerate }
export { isDocxSource }
