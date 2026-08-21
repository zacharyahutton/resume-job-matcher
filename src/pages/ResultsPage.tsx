import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { AnalysisResults } from '@/components/analysis/AnalysisResults'
import { AnalysisLoader } from '@/components/ui/AnalysisLoader'
import { ProcessSteps } from '@/components/ui/ProcessSteps'
import { useAnalysisResult } from '@/hooks/useAnalysisResult'
import {
  deepRebuildTailoredResume,
  regenerateTailoredResume,
} from '@/lib/ai/pipeline'
import { downloadDocx, downloadPdf, materializeDownloads } from '@/lib/generateDocs'
import { getResume } from '@/lib/storage'
import type { AnalysisStage } from '@/types'

const STEPS = [
  { n: 1, label: 'Resume' },
  { n: 2, label: 'Job' },
  { n: 3, label: 'Results' },
]

const BUSY_STAGES: AnalysisStage[] = [
  'extracting_resume',
  'extracting_job',
  'matching',
  'assessing_fit',
  'planning_tailor',
  'generating',
]

export function ResultsPage() {
  const { result, setResult } = useAnalysisResult()
  const [stage, setStage] = useState<AnalysisStage>('idle')
  const [error, setError] = useState<string | null>(null)
  const [readyNote, setReadyNote] = useState<string | null>(null)
  const [loaderDetail, setLoaderDetail] = useState('Building your downloadable resume…')

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [])

  useEffect(() => {
    if (stage === 'done' || stage === 'error') {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
    }
  }, [stage])

  if (!result) {
    return <Navigate to="/analyze" replace />
  }

  const busy = BUSY_STAGES.includes(stage)

  const sourceMeta = async () => {
    const stored = await getResume()
    return {
      fileName: stored?.fileName || result.tailored?.sourceFileName,
      mimeType: stored?.mimeType || result.tailored?.sourceMimeType,
      blob: stored?.blob || result.tailored?.sourceBlob,
    }
  }

  const onProgress = (s: AnalysisStage, detail?: string) => {
    setStage(s)
    if (detail) setLoaderDetail(detail)
  }

  /** Deep AI rebuild: rematch, heavy tailor to JD, layout fix, then download. */
  const onGenerate = async () => {
    setError(null)
    setReadyNote(null)
    setLoaderDetail('Starting a full rebuild for this job…')
    setStage('matching')
    try {
      const source = await sourceMeta()
      const next = await deepRebuildTailoredResume(result, onProgress, source)

      if (!next.tailored?.fullText?.trim()) {
        throw new Error('Could not build the resume text. Re-analyze the job and try again.')
      }

      setResult(next)
      setStage('done')
      setReadyNote(
        next.tailoring.changes.length
          ? `Ready. ${next.tailoring.changes.length} edits applied. PDF downloading now.`
          : 'Ready. No wording changes were needed. PDF downloading now.',
      )

      try {
        await downloadPdf(next.tailored)
        // DOCX is available from the Download button; PDF is the automatic export.
      } catch (dlErr) {
        setError(
          dlErr instanceof Error
            ? `Built successfully, but PDF download failed: ${dlErr.message}`
            : 'Built successfully, but PDF download was blocked. Use Download PDF.',
        )
      }
    } catch (e) {
      setStage('error')
      setError(e instanceof Error ? e.message : 'Could not generate tailored resume.')
    }
  }

  /** Refresh edit suggestions with deep tailor (no auto-download). */
  const onRefreshSuggestions = async () => {
    setError(null)
    setReadyNote(null)
    setLoaderDetail('Refreshing deep edit suggestions…')
    setStage('planning_tailor')
    try {
      const source = await sourceMeta()
      const next = await regenerateTailoredResume(result, onProgress, source)
      setResult(next)
      setStage('done')
      setReadyNote('Suggestions updated. Click Rebuild & download to apply and export.')
    } catch (e) {
      setStage('error')
      setError(e instanceof Error ? e.message : 'Could not refresh suggestions.')
    }
  }

  const onDownloadPdf = async () => {
    setError(null)
    try {
      if (!result.tailored) throw new Error('Build the tailored resume first.')
      let tailored = result.tailored
      if (!tailored.pdfBlob) {
        tailored = await materializeDownloads(tailored, {
          mode: result.renderMode || 'preserve',
        })
        setResult({ ...result, tailored })
      }
      await downloadPdf(tailored)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not download PDF.')
    }
  }

  const onDownloadDocx = async () => {
    setError(null)
    try {
      if (!result.tailored) throw new Error('Build the tailored resume first.')
      let tailored = result.tailored
      if (!tailored.docxBlob) {
        tailored = await materializeDownloads(tailored, {
          mode: result.renderMode || 'preserve',
        })
        setResult({ ...result, tailored })
      }
      await downloadDocx(tailored)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not download DOCX.')
    }
  }

  return (
    <div className="fitline-page">
      <div className="container" style={{ maxWidth: 920 }}>
        <div className="zubuz-section-title center fl-enter" style={{ marginBottom: 20 }}>
          <h2>Your results</h2>
          <p>See where you stand, fix what matters, then download a resume built to get the interview.</p>
        </div>

        <div className="fl-enter fl-enter-delay-1">
          <ProcessSteps steps={STEPS} current={3} />
        </div>

        <p className="fl-enter fl-enter-delay-2" style={{ textAlign: 'center', marginBottom: 28 }}>
          <Link to="/analyze" style={{ color: 'var(--primary-color)', fontWeight: 600 }}>
            ← Analyze another job
          </Link>
        </p>

        {busy ? (
          <AnalysisLoader stage={stage} detail={loaderDetail} mode="rebuild" />
        ) : (
          <div className="fl-stagger">
            <AnalysisResults
              result={result}
              generating={false}
              onGenerate={() => void onGenerate()}
              onRefreshSuggestions={() => void onRefreshSuggestions()}
              onDownloadPdf={() => void onDownloadPdf()}
              onDownloadDocx={() => void onDownloadDocx()}
              onRenderModeChange={(mode) => setResult({ ...result, renderMode: mode })}
            />
          </div>
        )}

        {readyNote && !busy ? (
          <div className="fitline-ready-note fl-enter" role="status">
            {readyNote}
          </div>
        ) : null}

        {error ? <div className="fitline-error fl-enter">{error}</div> : null}
      </div>
    </div>
  )
}
