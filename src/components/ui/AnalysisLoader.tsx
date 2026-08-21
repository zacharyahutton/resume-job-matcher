import { useEffect, useMemo, useState } from 'react'
import type { AnalysisStage } from '@/types'

const ANALYZE_STAGES: Array<{ id: AnalysisStage; label: string }> = [
  { id: 'extracting_resume', label: 'Reading resume' },
  { id: 'extracting_job', label: 'Extracting requirements' },
  { id: 'matching', label: 'Matching evidence' },
  { id: 'assessing_fit', label: 'Scoring fit' },
  { id: 'planning_tailor', label: 'Planning changes' },
  { id: 'generating', label: 'Building tailored resume' },
]

const REBUILD_STAGES: Array<{ id: AnalysisStage; label: string }> = [
  { id: 'extracting_resume', label: 'Refreshing clean resume text' },
  { id: 'matching', label: 'Re-checking the job vs your resume' },
  { id: 'assessing_fit', label: 'Refreshing fit and gaps' },
  { id: 'planning_tailor', label: 'Running Groq tailor for this job' },
  { id: 'generating', label: 'Building PDF and DOCX' },
]

const ROTATING_TIPS: Record<string, string[]> = {
  extracting_resume: [
    'Understanding every section of your resume…',
    'Mapping your roles, skills, and projects…',
    'Pulling out the strongest evidence…',
    'Checking contact and section structure…',
  ],
  extracting_job: [
    'Listing every must-have and nice-to-have…',
    'Separating required skills from preferred ones…',
    'Reading the job like a recruiter would…',
    'Building a clean requirement list…',
  ],
  matching: [
    'Comparing your evidence to what they want…',
    'Scoring strong, partial, and missing matches…',
    'Finding proof for each requirement…',
    'Being honest about gaps…',
  ],
  assessing_fit: [
    'Deciding fit, gaps, and interview odds…',
    'Weighing must-haves over nice-to-haves…',
    'Writing a clear fit summary…',
    'Checking what would help in an interview…',
  ],
  planning_tailor: [
    'Deciding what to change and what to leave alone…',
    'Drafting stronger wording from real evidence…',
    'Skipping anything we cannot prove…',
    'Keeping your truth, sharpening the pitch…',
  ],
  generating: [
    'Building your downloadable resume…',
    'Applying the plan to your content…',
    'Preparing PDF and DOCX…',
    'Almost ready…',
  ],
}

interface Props {
  stage: AnalysisStage
  detail?: string
  mode?: 'analyze' | 'rebuild'
}

export function AnalysisLoader({ stage, detail, mode = 'analyze' }: Props) {
  const stages = mode === 'rebuild' ? REBUILD_STAGES : ANALYZE_STAGES
  const order = stages.map((s) => s.id)
  const current = Math.max(0, order.indexOf(stage))
  const progress = Math.min(96, Math.round(((current + 1) / stages.length) * 100))

  const tips = useMemo(() => {
    const list = ROTATING_TIPS[stage] || ['Working…']
    // Prefer live detail as the first tip when it arrives, then rotate the rest.
    if (detail && !list.includes(detail)) return [detail, ...list]
    return list
  }, [stage, detail])

  const [tipIndex, setTipIndex] = useState(0)

  useEffect(() => {
    setTipIndex(0)
  }, [stage])

  useEffect(() => {
    if (tips.length <= 1) return
    const id = window.setInterval(() => {
      setTipIndex((i) => (i + 1) % tips.length)
    }, 3000)
    return () => window.clearInterval(id)
  }, [tips])

  const line = tips[tipIndex % tips.length] || detail || stages[current]?.label || 'Analyzing…'

  return (
    <div className="fl-loader-panel" role="status" aria-live="polite">
      <div className="fl-orbit" aria-hidden="true">
        <div className="fl-orbit-ring" />
        <div className="fl-orbit-core" />
      </div>

      <h3 style={{ marginBottom: 6 }}>
        {mode === 'rebuild' ? 'Rebuilding your tailored resume' : 'Working on it'}
      </h3>
      <p key={`${stage}-${tipIndex}`} className="fl-loader-detail" style={{ margin: 0, color: '#7b878c' }}>
        {line}
      </p>
      <div className="fl-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <div className="fl-progress-bar" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="fl-stage-list">
        {stages.map((s, i) => {
          const done = i < current || stage === 'done'
          const active = i === current && stage !== 'done'
          return (
            <div
              key={s.id}
              className={`fl-stage-item ${done ? 'is-done' : ''} ${active ? 'is-active' : ''}`}
            >
              <span className="mark">{done ? '✓' : active ? '•' : i + 1}</span>
              {s.label}
            </div>
          )
        })}
      </div>
    </div>
  )
}
