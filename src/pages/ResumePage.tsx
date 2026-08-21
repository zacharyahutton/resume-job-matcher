import { Link } from 'react-router-dom'
import { ResumePanel } from '@/components/resume/ResumePanel'
import { Button } from '@/components/ui/Button'
import { ProcessSteps } from '@/components/ui/ProcessSteps'
import { useResumeStorage } from '@/hooks/useResumeStorage'
import { useState } from 'react'

const STEPS = [
  { n: 1, label: 'Resume' },
  { n: 2, label: 'Job' },
  { n: 3, label: 'Results' },
]

export function ResumePage() {
  const { resume, loading, busy, status, error, upload, remove } = useResumeStorage()
  const [flash, setFlash] = useState(false)

  return (
    <div className="fitline-page">
      <div className="container" style={{ maxWidth: 760 }}>
        <div className="zubuz-section-title center fl-enter" style={{ marginBottom: 24 }}>
          <h2>Your resume</h2>
          <p>Step 1: save it once on this device, then reuse it for every job.</p>
        </div>

        <div className="fl-enter fl-enter-delay-1">
          <ProcessSteps steps={STEPS} current={1} />
        </div>

        <div className={`fl-enter fl-enter-delay-2 ${flash ? 'fl-upload-flash' : ''}`}>
          <ResumePanel
            resume={resume}
            loading={loading}
            busy={busy}
            status={status}
            error={error}
            onUpload={async (file) => {
              await upload(file)
              setFlash(true)
              window.setTimeout(() => setFlash(false), 600)
            }}
            onRemove={remove}
          />
        </div>

        {resume ? (
          <div className="fl-enter fl-enter-delay-3" style={{ marginTop: 28, textAlign: 'center' }}>
            <Button to="/analyze">Next · Tailor Your Resume</Button>
          </div>
        ) : loading ? (
          <div className="fitline-card fl-enter" style={{ marginTop: 20 }}>
            <div className="fl-skel fl-skel-title" />
            <div className="fl-skel fl-skel-line" />
            <div className="fl-skel fl-skel-line" style={{ width: '70%' }} />
          </div>
        ) : (
          <p className="fl-enter fl-enter-delay-3" style={{ marginTop: 24, textAlign: 'center' }}>
            Or continue from{' '}
            <Link to="/analyze" style={{ color: 'var(--primary-color)', fontWeight: 600 }}>
              Analyze Job
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  )
}
