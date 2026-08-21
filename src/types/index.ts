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

/** Preserve = keep user's design. Optimize = Fitline classic layout. */
export type RenderMode = 'preserve' | 'optimize'

export interface StoredResume {
  id: string
  fileName: string
  mimeType: string
  savedAt: number
  text: string
  blob: Blob
}

export interface ResumeContact {
  email?: string
  phone?: string
  location?: string
  links: string[]
}

export interface ResumeBullet {
  id: string
  text: string
  technologies: string[]
}

export interface ResumeExperience {
  id: string
  title: string
  company: string
  dates?: string
  bullets: ResumeBullet[]
  technologies: string[]
}

export interface ResumeProject {
  id: string
  name: string
  description: string
  technologies: string[]
  bullets: string[]
}

export interface ResumeEducation {
  id: string
  school: string
  degree?: string
  dates?: string
}

/** Canonical resume model. rawText is always the source of truth for evidence. */
export interface ResumeProfile {
  rawText: string
  name?: string
  contact: ResumeContact
  summary?: string
  skills: string[]
  experience: Array<{
    id?: string
    title: string
    company: string
    dates?: string
    bullets: string[]
    technologies?: string[]
  }>
  projects: Array<{
    id?: string
    name: string
    description: string
    technologies: string[]
    bullets?: string[]
  }>
  education: Array<{
    id?: string
    school: string
    degree?: string
    dates?: string
  }>
  certifications: string[]
  tools: string[]
  otherSections: Array<{ heading: string; content: string }>
  extractionNotes: string[]
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
  responsibilities: string[]
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
  whyFit: string
  gaps: string
  wouldBeFit: string[]
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
  action?: 'rewrite' | 'trim'
  evidence?: string
}

export interface NotAddingItem {
  item: string
  reason: string
}

export interface RemoveSuggestion {
  item: string
  reason: string
}

export interface NoChangeNote {
  section: string
  note: string
}

export interface TailoringPlan {
  changes: TailoringChange[]
  notAdding: NotAddingItem[]
  toRemove: RemoveSuggestion[]
  emphasisNotes: string[]
  /** Lines that already match the job well — leave them alone. */
  noChangeNeeded: NoChangeNote[]
}

export interface TailoredResume {
  fullText: string
  fileBaseName: string
  sections: Array<{
    heading: string
    content: string
  }>
  formatPreserved?: boolean
  renderMode?: RenderMode
  appliedChanges?: TailoringChange[]
  skippedChanges?: TailoringChange[]
  sourceFileName?: string
  sourceMimeType?: string
  sourceBlob?: Blob
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
  renderMode: RenderMode
  warnings: string[]
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
  extracting_resume: 'Understanding every section of your resume…',
  extracting_job: 'Pulling every requirement from the job…',
  matching: 'Comparing your evidence to what they want…',
  assessing_fit: 'Deciding fit, gaps, and interview odds…',
  planning_tailor: 'Deciding what to change (and what to leave alone)…',
  generating: 'Building your downloadable resume…',
  done: 'Done',
  error: 'Something went wrong',
}
