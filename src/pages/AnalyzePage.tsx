import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { JobInput } from '@/components/job/JobInput'
import { ResumePanel } from '@/components/resume/ResumePanel'
import { ProcessSteps } from '@/components/ui/ProcessSteps'
import { AnalysisLoader } from '@/components/ui/AnalysisLoader'
import { useResumeStorage } from '@/hooks/useResumeStorage'
import { useAnalysisResult } from '@/hooks/useAnalysisResult'
import { extractTextFromImage } from '@/lib/ocr'
import { runAnalysisPipeline } from '@/lib/ai/pipeline'
import type { AnalysisStage, JobInputMode, RenderMode } from '@/types'

const STEPS = [
  { n: 1, label: 'Resume' },
  { n: 2, label: 'Job' },
  { n: 3, label: 'Results' },
]

export function AnalyzePage() {
  const navigate = useNavigate()
  const { resume, loading, busy, status, error, setError, upload, remove } = useResumeStorage()
  const { setResult } = useAnalysisResult()
  const [stage, setStage] = useState<AnalysisStage>('idle')
  const [detail, setDetail] = useState<string | undefined>()
  const [runError, setRunError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [awaitingVisual, setAwaitingVisual] = useState(false)
  const awaitingVisualRef = useRef(false)

  const running =
    awaitingVisual || (stage !== 'idle' && stage !== 'done' && stage !== 'error')

  const currentStep = useMemo(() => {
    if (running) return 2
    if (!resume) return 1
    return 2
  }, [resume, running])

  const handleAnalyze = async (payload: {
    mode: JobInputMode
    text?: string
    image?: File
    renderMode: RenderMode
  }) => {
    setRunError(null)
    awaitingVisualRef.current = false
    setAwaitingVisual(false)

    if (!resume) {
      setRunError('Upload your resume first (step 1).')
      return
    }

    try {
      let jobText = payload.text || ''

      if (payload.mode === 'image' && payload.image) {
        setStage('extracting_job')
        setDetail('Reading your screenshot…')
        jobText = await extractTextFromImage(payload.image, (status) => setDetail(status))
      }

      const result = await runAnalysisPipeline({
        resumeText: resume.text,
        jobText,
        source: {
          fileName: resume.fileName,
          mimeType: resume.mimeType,
          blob: resume.blob,
        },
        renderMode: payload.renderMode || 'preserve',
        materialize: false,
        jobInputMode: payload.mode,
        onProgress: (s, d) => {
          setStage(s)
          setDetail(d)
        },
      })

      setResult(result)
      awaitingVisualRef.current = true
      setAwaitingVisual(true)
      setStage('done')
    } catch (e) {
      awaitingVisualRef.current = false
      setAwaitingVisual(false)
      setStage('error')
      setRunError(e instanceof Error ? e.message : 'Analysis failed. Please try again.')
    }
  }

  const finishVisual = () => {
    if (!awaitingVisualRef.current) return
    awaitingVisualRef.current = false
    setAwaitingVisual(false)
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    navigate('/results')
  }

  return (
    <div className="fitline-page">
      <div className="container" style={{ maxWidth: 760 }}>
        <div className="zubuz-section-title center fl-enter" style={{ marginBottom: 28 }}>
          <h2>Simple process</h2>
          <p>Three steps. Upload once, add the job you want, get interview-ready.</p>
        </div>

        <div className="fl-enter fl-enter-delay-1">
          <ProcessSteps steps={STEPS} current={currentStep} />
        </div>

        {running ? (
          <AnalysisLoader stage={stage} detail={detail} onVisualComplete={finishVisual} />
        ) : (
          <>
            <section className={`fl-enter fl-enter-delay-2 ${justSaved ? 'fl-upload-flash' : ''}`}>
              <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h3 style={{ margin: 0 }}>1 · Your resume</h3>
                {resume ? (
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#15803d' }}>Saved ✓</span>
                ) : (
                  <span style={{ fontSize: 14, color: '#7b878c' }}>Required</span>
                )}
              </div>
              <ResumePanel
                resume={resume}
                loading={loading}
                busy={busy}
                status={status}
                error={error}
                onUpload={async (file) => {
                  setError(null)
                  await upload(file)
                  setJustSaved(true)
                  window.setTimeout(() => setJustSaved(false), 600)
                }}
                onRemove={remove}
              />
            </section>

            <section
              className={`fl-enter fl-enter-delay-3 ${!resume ? 'fl-busy-overlay is-busy' : ''}`}
              style={{ marginTop: 28 }}
            >
              <div style={{ marginBottom: 10 }}>
                <h3 style={{ margin: 0 }}>2 · Add the job</h3>
              </div>
              <JobInput disabled={busy || loading || !resume} onAnalyze={handleAnalyze} />
            </section>

            {runError ? (
              <div className="fitline-error fl-enter" style={{ marginTop: 16 }}>
                {runError}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
