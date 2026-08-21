import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

const SCENES = [
  {
    title: 'Save your resume once',
    body: 'Upload a PDF or DOCX. It stays on this device so you never re-upload for the next role.',
    kind: 'upload' as const,
    label: 'Resume',
  },
  {
    title: 'Add any job',
    body: 'Paste the description, type requirements, or drop a screenshot. We extract what matters.',
    kind: 'job' as const,
    label: 'Job',
  },
  {
    title: 'See what helps you get the interview',
    body: 'Get a clear score, what already works for this role, and what to fix before you apply.',
    kind: 'fit' as const,
    label: 'Fit',
  },
  {
    title: 'Tailor for that job',
    body: 'Rewrite real experience so it speaks to the role. Same format. Nothing fake added.',
    kind: 'tailor' as const,
    label: 'Tailor',
  },
  {
    title: 'Download and go get the interview',
    body: 'Export PDF or DOCX, then apply with a resume aimed at that job.',
    kind: 'download' as const,
    label: 'Download',
  },
]

const STEP_MS = 3800

interface Props {
  open: boolean
  onClose: () => void
}

export function HowItWorksDemo({ open, onClose }: Props) {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [tick, setTick] = useState(0)
  const progressRef = useRef<HTMLDivElement>(null)

  const goTo = useCallback((i: number, pause = true) => {
    const next = ((i % SCENES.length) + SCENES.length) % SCENES.length
    setIndex(next)
    setTick((t) => t + 1)
    if (pause) setPlaying(false)
  }, [])

  const next = useCallback(() => {
    setIndex((i) => (i + 1) % SCENES.length)
    setTick((t) => t + 1)
  }, [])

  const back = useCallback(() => {
    setIndex((i) => (i - 1 + SCENES.length) % SCENES.length)
    setTick((t) => t + 1)
    setPlaying(false)
  }, [])

  useEffect(() => {
    if (!open) return
    setIndex(0)
    setPlaying(true)
    setTick(0)
  }, [open])

  useEffect(() => {
    if (!open || !playing) return
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % SCENES.length)
      setTick((t) => t + 1)
    }, STEP_MS)
    return () => window.clearInterval(id)
  }, [open, playing, tick])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') {
        setPlaying(false)
        next()
      }
      if (e.key === 'ArrowLeft') back()
      if (e.key === ' ') {
        e.preventDefault()
        setPlaying((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose, next, back])

  if (!open) return null

  const scene = SCENES[index]
  const stepLabel = `Step ${index + 1} of ${SCENES.length}`
  const isLast = index === SCENES.length - 1

  return (
    <div
      className="fl-demo-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="How Fitline works"
      onClick={onClose}
    >
      <div className="fl-demo-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fl-demo-top">
          <div>
            <h3>See how it works</h3>
            <p className="fl-demo-top-sub">5 quick steps. Click any step, or let it play.</p>
          </div>
          <button type="button" className="fl-demo-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="fl-demo-rail" role="tablist" aria-label="Demo steps">
          {SCENES.map((s, i) => (
            <button
              key={s.label}
              type="button"
              role="tab"
              aria-selected={i === index}
              className={`fl-demo-rail-item ${i === index ? 'is-active' : ''} ${i < index ? 'is-done' : ''}`}
              onClick={() => goTo(i)}
            >
              <span className="fl-demo-rail-num">{i < index ? '✓' : i + 1}</span>
              <span className="fl-demo-rail-label">{s.label}</span>
            </button>
          ))}
        </div>

        <div
          className="fl-demo-progress"
          aria-hidden="true"
          key={`progress-${tick}-${playing}`}
        >
          <div
            ref={progressRef}
            className={`fl-demo-progress-fill ${playing ? 'is-playing' : 'is-paused'}`}
            style={{ animationDuration: `${STEP_MS}ms` }}
          />
        </div>

        <div className="fl-demo-stage">
          <div className="fl-demo-scene" key={`${scene.kind}-${tick}`}>
            <div className="fl-demo-kicker">{stepLabel}</div>
            <h4>{scene.title}</h4>
            <p>{scene.body}</p>

            {scene.kind === 'upload' ? (
              <>
                <div className="fl-demo-file fl-demo-pop">
                  <div className="badge">PDF</div>
                  <div>
                    <strong>Zachary_Hutton_Resume.pdf</strong>
                    <span>Saved on this device</span>
                  </div>
                </div>
                <div className="fl-demo-upload-bar" aria-hidden="true">
                  <i />
                </div>
              </>
            ) : null}

            {scene.kind === 'job' ? (
              <div className="fl-demo-job fl-demo-pop">
                <div className="typing">We’re hiring a Frontend Engineer…</div>
                <div style={{ marginTop: 10 }}>Required: React, TypeScript, REST APIs</div>
                <div>Preferred: AWS, team experience</div>
              </div>
            ) : null}

            {scene.kind === 'fit' ? (
              <>
                <div className="fl-demo-score fl-demo-pop">
                  <div className="fl-demo-ring">
                    <strong>84%</strong>
                  </div>
                  <div>
                    <strong style={{ fontSize: 18 }}>Strong Fit</strong>
                    <div style={{ fontSize: 13, color: '#7b878c', marginTop: 4 }}>
                      Honest assessment from your real experience
                    </div>
                  </div>
                </div>
                <div className="fl-demo-pills">
                  <span className="ok">✓ 7 covered</span>
                  <span className="warn">! 2 need a clearer line</span>
                  <span className="bad">✕ 1 not on resume</span>
                </div>
              </>
            ) : null}

            {scene.kind === 'tailor' ? (
              <div className="fl-demo-change fl-demo-pop">
                <div className="box before">
                  <strong>Now:</strong> Built websites for clients.
                </div>
                <div className="box after">
                  <strong>Change to:</strong> Built and shipped client websites with responsive UI
                  based on business requirements.
                </div>
                <div className="fl-demo-pills">
                  <span className="bad">Not adding: AWS</span>
                </div>
              </div>
            ) : null}

            {scene.kind === 'download' ? (
              <div className="fl-demo-download fl-demo-pop">
                <div className="fl-demo-file-row">
                  <div className="fl-demo-file-chip">
                    <strong>PDF</strong>
                    <span>Resume_Tailored.pdf</span>
                  </div>
                  <div className="fl-demo-file-chip">
                    <strong>DOCX</strong>
                    <span>Resume_Tailored.docx</span>
                  </div>
                </div>
                <div className="fl-demo-pills">
                  <span className="ok">Same format as your upload</span>
                  <span className="ok">Ready to download</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="fl-demo-bottom">
          <div className="fl-demo-dots" aria-label="Demo steps">
            {SCENES.map((s, i) => (
              <button
                key={s.label}
                type="button"
                className={i === index ? 'is-active' : ''}
                aria-label={`Go to step ${i + 1}: ${s.label}`}
                aria-current={i === index ? 'step' : undefined}
                onClick={() => goTo(i)}
              />
            ))}
          </div>

          <div className="fl-demo-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => setPlaying((p) => !p)}
              aria-pressed={playing}
            >
              {playing ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={back}
              disabled={index === 0}
            >
              Back
            </button>
            {!isLast ? (
              <button
                type="button"
                className="ghost ghost-next"
                onClick={() => {
                  setPlaying(false)
                  next()
                }}
              >
                Next
              </button>
            ) : null}
            <Link className="zubuz-default-btn zubuz-header-btn" to="/analyze" onClick={onClose}>
              <span>Tailor Your Resume</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
