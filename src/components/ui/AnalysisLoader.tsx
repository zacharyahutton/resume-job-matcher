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
  { id: 'matching', label: 'Re-checking the job vs your resume' },
  { id: 'assessing_fit', label: 'Refreshing fit and gaps' },
  { id: 'planning_tailor', label: 'Rewriting lines for this job' },
  { id: 'generating', label: 'Fixing layout and exporting files' },
]

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

  return (
    <div className="fl-loader-panel" role="status" aria-live="polite">
      <div className="fl-orbit" aria-hidden="true">
        <div className="fl-orbit-ring" />
        <div className="fl-orbit-core" />
      </div>

      <h3 style={{ marginBottom: 6 }}>
        {mode === 'rebuild' ? 'Rebuilding your tailored resume' : 'Working on it'}
      </h3>
      <p style={{ margin: 0, color: '#7b878c' }}>
        {detail || stages[current]?.label || 'Analyzing…'}
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
