export type FitLabel = 'Strong Fit' | 'Reasonable Fit' | 'Stretch' | 'Weak Fit'

export type MatchStatus = 'strong' | 'partial' | 'missing' | 'unclear'

export type RequirementPriority = 'required' | 'preferred' | 'unspecified'

export type RequirementCategory =
  | 'skill'
  | 'preferred_skill'
  | 'responsibility'
  | 'years_experience'
  | 'education'
  | 'certification'
  | 'technical'
  | 'industry'
  | 'collaboration'
  | 'tool'
  | 'other'

export interface StoredResume {
  id: string
  fileName: string
  mimeType: string
  savedAt: number
  text: string
  blob: Blob
}

export interface ResumeProfile {
  rawText: string
  name?: string
  summary?: string
  skills: string[]
  experience: Array<{
    title: string
    company: string
    dates?: string
    bullets: string[]
  }>
  projects: Array<{
    name: string
    description: string
    technologies: string[]
  }>
  education: Array<{
    school: string
    degree?: string
    dates?: string
  }>
  certifications: string[]
  tools: string[]
}

export interface JobRequirement {
  id: string
  text: string
  category: RequirementCategory
  priority: RequirementPriority
}

export interface JobExtraction {
  title?: string
  company?: string
  rawText: string
  requirements: JobRequirement[]
}

export interface RequirementMatch {
  requirement: JobRequirement
  status: MatchStatus
  evidence: string
  reasoning: string
}

export interface FitAssessment {
  score: number
  label: FitLabel
  summary: string
  /** Why they would be a fit for this role. */
  whyFit: string
  /** What is holding them back. */
  gaps: string
  /** Direct reasons they would get an interview / be competitive. */
  wouldBeFit: string[]
  /** Direct reasons they would not be a fit (or would struggle). */
  wouldNotBeFit: string[]
  requiredMatched: number
  requiredPartial: number
  requiredMissing: number
  preferredMatched: number
  preferredPartial: number
  preferredMissing: number
}

export interface TailoringChange {
  original: string
  tailored: string
  why: string
  section?: string
  /** rewrite = reword in place; trim = shorten/de-emphasize. */
  action?: 'rewrite' | 'trim'
}

export interface NotAddingItem {
  item: string
  reason: string
}

export interface RemoveSuggestion {
  item: string
  reason: string
}

export interface TailoringPlan {
  changes: TailoringChange[]
  /** Job asks the resume cannot honestly support. */
  notAdding: NotAddingItem[]
  /** Lines or themes to de-emphasize or drop for this application. */
  toRemove: RemoveSuggestion[]
  emphasisNotes: string[]
}

export interface TailoredResume {
  fullText: string
  fileBaseName: string
  sections: Array<{
    heading: string
    content: string
  }>
  /** True when fullText was built by editing the original resume in place. */
  formatPreserved?: boolean
  /** Changes applied (or intended) for in-place DOCX edits. */
  appliedChanges?: TailoringChange[]
  sourceFileName?: string
  sourceMimeType?: string
  /** Original uploaded file; used to keep DOCX layout on download. */
  sourceBlob?: Blob
  /** Pre-built downloadable files (created when you click Build). */
  pdfBlob?: Blob
  docxBlob?: Blob
  builtAt?: number
}

export interface AnalysisResult {
  resumeProfile: ResumeProfile
  job: JobExtraction
  matches: RequirementMatch[]
  fit: FitAssessment
  tailoring: TailoringPlan
  tailored?: TailoredResume
  analyzedAt: number
}

export type JobInputMode = 'image' | 'paste' | 'type'

export type AnalysisStage =
  | 'idle'
  | 'extracting_resume'
  | 'extracting_job'
  | 'matching'
  | 'assessing_fit'
  | 'planning_tailor'
  | 'generating'
  | 'done'
  | 'error'

export const STAGE_LABELS: Record<AnalysisStage, string> = {
  idle: 'Ready',
  extracting_resume: 'Scanning every line of your resume…',
  extracting_job: 'Pulling every requirement from the job…',
  matching: 'Comparing your experience to what they want…',
  assessing_fit: 'Deciding fit, gaps, and interview odds…',
  planning_tailor: 'Planning exact wording changes in your format…',
  generating: 'Applying edits and rebuilding your resume…',
  done: 'Done',
  error: 'Something went wrong',
}
