import { useRef, useState, type DragEvent, type ChangeEvent } from 'react'
import { Button } from '@/components/ui/Button'
import type { StoredResume } from '@/types'

interface Props {
  resume: StoredResume | null
  loading?: boolean
  busy?: boolean
  status?: string | null
  error?: string | null
  onUpload: (file: File) => Promise<void> | void
  onRemove: () => Promise<void> | void
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const ACCEPT =
  '.pdf,.docx,.doc,.txt,.rtf,.png,.jpg,.jpeg,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/*'

export function ResumePanel({
  resume,
  loading,
  busy,
  status,
  error,
  onUpload,
  onRemove,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0]
    if (file) await onUpload(file)
  }

  const onDrop = async (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    await handleFiles(e.dataTransfer.files)
  }

  const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
    await handleFiles(e.target.files)
    e.target.value = ''
  }

  if (loading) {
    return (
      <div className="fitline-card">
        <div className="fitline-loading">
          <div className="fitline-spinner" />
          <p>Loading your saved resume…</p>
        </div>
        <div className="fl-skel fl-skel-line" />
        <div className="fl-skel fl-skel-line" style={{ width: '60%' }} />
      </div>
    )
  }

  return (
    <div>
      {busy ? (
        <div className="fitline-card fitline-loading" style={{ marginBottom: 16 }}>
          <div className="fitline-spinner" />
          <h3 style={{ marginBottom: 6 }}>Reading your resume</h3>
          <p style={{ margin: 0 }}>{status || 'Working…'}</p>
          <div className="fl-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
      ) : null}

      {resume ? (
        <div className="fitline-card fitline-resume-row">
          <div className="fitline-resume-meta">
            <div className="fitline-file-badge">
              {resume.fileName.split('.').pop()?.toUpperCase().slice(0, 4) || 'FILE'}
            </div>
            <div>
              <h3 style={{ marginBottom: 4 }}>{resume.fileName}</h3>
              <p style={{ margin: 0 }}>
                Saved on this device · {formatDate(resume.savedAt)}
                {resume.text ? ` · ${resume.text.split(/\s+/).length} words` : ''}
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: '#7b878c' }}>
                Exports use the Fitline layout with your content only.
              </p>
            </div>
          </div>
          <div className="fitline-actions">
            <Button secondary size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
              Replace Resume
            </Button>
            <Button danger disabled={busy} onClick={() => void onRemove()}>
              Remove
            </Button>
          </div>
          <input ref={inputRef} type="file" accept={ACCEPT} onChange={onChange} hidden />
        </div>
      ) : (
        <div
          className={`fitline-dropzone ${dragging ? 'is-dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !busy && inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
          }}
        >
          <h3 style={{ marginBottom: 8 }}>Upload your resume</h3>
          <p style={{ marginBottom: 20 }}>
            PDF, DOCX, TXT, or a clear image. Nothing is preloaded. Your file stays on this device only.
          </p>
          <Button size="sm" disabled={busy}>
            {busy ? 'Reading…' : 'Choose File'}
          </Button>
          <input ref={inputRef} type="file" accept={ACCEPT} onChange={onChange} />
        </div>
      )}

      <div className="fitline-privacy">
        <span aria-hidden="true">🔒</span>
        <span>
          Your resume is stored locally on this device using browser storage. No account required.
          Replacing or removing it deletes the saved copy from this browser.
        </span>
      </div>

      {error ? <div className="fitline-error">{error}</div> : null}
    </div>
  )
}
