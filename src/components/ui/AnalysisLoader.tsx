import { useEffect, useMemo, useRef, useState } from 'react'
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
  { id: 'matching', label: 'Re-checking every requirement' },
  { id: 'assessing_fit', label: 'Refreshing fit and gaps' },
  { id: 'planning_tailor', label: 'Planning changes' },
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

/** How long each checklist tick stays before advancing when work is already ahead. */
const TICK_MS = 1000

interface Props {
  stage: AnalysisStage
  detail?: string
  mode?: 'analyze' | 'rebuild'
  /** Fires once after stage is done and the bar has ticked through to 100%. */
  onVisualComplete?: () => void
}

export function AnalysisLoader({ stage, detail, mode = 'analyze', onVisualComplete }: Props) {
  const stages = mode === 'rebuild' ? REBUILD_STAGES : ANALYZE_STAGES
  const order = stages.map((s) => s.id)
  const finished = stage === 'done'
  const realIndex = finished
    ? stages.length
    : Math.max(0, order.indexOf(stage))

  const [displayIndex, setDisplayIndex] = useState(0)
  const [progress, setProgress] = useState(4)
  const completedRef = useRef(false)

  useEffect(() => {
    setDisplayIndex(0)
    setProgress(4)
    completedRef.current = false
  }, [mode])

  useEffect(() => {
    if (stage === 'idle' || stage === 'error') return

    const id = window.setInterval(() => {
      setDisplayIndex((i) => (i < realIndex ? i + 1 : i))
    }, TICK_MS)
    // Kick once immediately so local-fast stages don't sit on 0% for a full second.
    setDisplayIndex((i) => (i < realIndex ? i + 1 : i))
    return () => window.clearInterval(id)
  }, [stage, realIndex])

  useEffect(() => {
    if (finished && displayIndex >= stages.length) {
      setProgress(100)
      if (!completedRef.current) {
        completedRef.current = true
        onVisualComplete?.()
      }
      return
    }
    const capped = Math.min(displayIndex, stages.length - 1)
    const base = ((capped + 1) / stages.length) * 92
    setProgress(Math.max(4, Math.min(96, Math.round(base))))
  }, [displayIndex, stages.length, finished, onVisualComplete])

  const visualStageId = finished && displayIndex >= stages.length
    ? stages[stages.length - 1]?.id
    : stages[Math.min(displayIndex, stages.length - 1)]?.id || stage

  const tips = useMemo(() => {
    const list = ROTATING_TIPS[visualStageId || ''] || ['Working…']
    if (detail && !list.includes(detail) && visualStageId === stage) return [detail, ...list]
    return list
  }, [visualStageId, detail, stage])

  const [tipIndex, setTipIndex] = useState(0)

  useEffect(() => {
    setTipIndex(0)
  }, [visualStageId])

  useEffect(() => {
    if (tips.length <= 1) return
    const id = window.setInterval(() => {
      setTipIndex((i) => (i + 1) % tips.length)
    }, 3000)
    return () => window.clearInterval(id)
  }, [tips])

  const line =
    tips[tipIndex % tips.length] ||
    detail ||
    stages[Math.min(displayIndex, stages.length - 1)]?.label ||
    'Analyzing…'

  return (
    <div className="fl-loader-panel" role="status" aria-live="polite">
      <div className="fl-orbit" aria-hidden="true">
        <div className="fl-orbit-ring" />
        <div className="fl-orbit-core" />
      </div>

      <h3 style={{ marginBottom: 6 }}>
        {mode === 'rebuild' ? 'Rebuilding your tailored resume' : 'Working on it'}
      </h3>
      <p
        key={`${visualStageId}-${tipIndex}`}
        className="fl-loader-detail"
        style={{ margin: 0, color: '#7b878c' }}
      >
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
          const done = displayIndex > i || (finished && displayIndex >= stages.length)
          const active = displayIndex === i && !(finished && displayIndex >= stages.length)
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
