interface Step {
  n: number
  label: string
}

interface Props {
  steps: Step[]
  current: number
}

export function ProcessSteps({ steps, current }: Props) {
  return (
    <div className="fl-process" aria-label="Process steps">
      {steps.map((step, i) => {
        const done = current > step.n
        const active = current === step.n
        return (
          <div key={step.n} style={{ display: 'contents' }}>
            {i > 0 ? (
              <div
                className={`fl-process-line ${done ? 'is-done' : ''} ${active ? 'is-active' : ''}`}
              />
            ) : null}
            <div
              className={`fl-process-step ${done ? 'is-done' : ''} ${active ? 'is-active' : ''}`}
            >
              <span className="num">{done ? '✓' : step.n}</span>
              <span className="label">{step.label}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
