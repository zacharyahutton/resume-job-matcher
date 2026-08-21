import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import type { JobInputMode, RenderMode } from '@/types'
import { Button } from '@/components/ui/Button'
import { assessJobInput } from '@/lib/jobInputGuard'
import { isSupportedImageFile } from '@/lib/parseResume'

interface Props {
  disabled?: boolean
  onAnalyze: (payload: {
    mode: JobInputMode
    text?: string
    image?: File
    renderMode: RenderMode
  }) => void
}

const TABS: Array<{ id: JobInputMode; label: string }> = [
  { id: 'image', label: 'Upload Image' },
  { id: 'paste', label: 'Paste Job Description' },
  { id: 'type', label: 'Type Requirements' },
]

export function JobInput({ disabled, onAnalyze }: Props) {
  const [mode, setMode] = useState<JobInputMode>('paste')
  const [renderMode, setRenderMode] = useState<RenderMode>('preserve')
  const [text, setText] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [pasteBusy, setPasteBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const pickImage = (file: File | undefined) => {
    setLocalError(null)
    if (!file) return
    if (!isSupportedImageFile(file)) {
      setLocalError('Please upload a PNG, JPG, or WEBP screenshot.')
      return
    }
    setImage(file)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    pickImage(e.dataTransfer.files?.[0])
  }

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    pickImage(e.target.files?.[0])
    e.target.value = ''
  }

  const pasteFromClipboard = async () => {
    setLocalError(null)
    setPasteBusy(true)
    try {
      if (!navigator.clipboard?.readText) {
        setLocalError('Clipboard paste is not available here. Use Ctrl+V or Cmd+V in the box below.')
        textareaRef.current?.focus()
        return
      }
      const clip = (await navigator.clipboard.readText()).trim()
      if (!clip) {
        setLocalError('Clipboard is empty. Copy the job description first, then tap Paste.')
        return
      }
      setText(clip)
      setMode('paste')
    } catch {
      setLocalError('Could not read the clipboard. Allow paste permission, or use Ctrl+V / Cmd+V.')
      textareaRef.current?.focus()
    } finally {
      setPasteBusy(false)
    }
  }

  const submit = () => {
    setLocalError(null)
    if (mode === 'image') {
      if (!image) {
        setLocalError('Upload a screenshot of the job posting first.')
        return
      }
      onAnalyze({ mode, image, renderMode })
      return
    }
    const trimmed = text.trim()
    if (trimmed.length < (mode === 'type' ? 12 : 20)) {
      setLocalError('Please enter a bit more detail so we can extract requirements.')
      return
    }
    const check = assessJobInput(trimmed, { mode })
    if (!check.ok) {
      setLocalError(check.message)
      return
    }
    onAnalyze({ mode, text: trimmed, renderMode })
  }

  return (
    <div className="fitline-card">
      <h3 style={{ marginBottom: 8 }}>Analyze a Job</h3>
      <p style={{ marginBottom: 20 }}>
        Provide the role any way that is convenient: screenshot, paste, or a short list.
      </p>

      <div style={{ marginBottom: 18 }}>
        <p style={{ marginBottom: 8, fontWeight: 700 }}>How should we handle your resume?</p>
        <div className="fitline-tabs" role="radiogroup" aria-label="Resume render mode">
          <button
            type="button"
            className={renderMode === 'preserve' ? 'is-active' : ''}
            disabled={disabled}
            onClick={() => setRenderMode('preserve')}
          >
            Preserve My Layout
          </button>
          <button
            type="button"
            className={renderMode === 'optimize' ? 'is-active' : ''}
            disabled={disabled}
            onClick={() => setRenderMode('optimize')}
          >
            Optimize My Resume
          </button>
        </div>
        <p style={{ marginTop: 8, marginBottom: 0, fontSize: 14, color: '#7b878c' }}>
          {renderMode === 'preserve'
            ? 'Keep your design. Change only the content that should be tailored. Best with DOCX.'
            : 'Rebuild into Fitline’s stronger format using your real experience only.'}
        </p>
      </div>

      <div className="fitline-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={mode === tab.id}
            className={`fitline-tab ${mode === tab.id ? 'active' : ''}`}
            onClick={() => setMode(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mode === 'image' ? (
        <div
          className={`fitline-dropzone ${dragging ? 'is-dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <h3 style={{ marginBottom: 8 }}>{image ? image.name : 'Drop a job screenshot'}</h3>
          <p style={{ marginBottom: 20 }}>
            We’ll extract requirements with on-device OCR. Clear text works best.
          </p>
          <Button secondary size="sm">
            {image ? 'Replace Image' : 'Choose Image'}
          </Button>
          <input ref={inputRef} type="file" accept="image/*" onChange={onChange} />
        </div>
      ) : mode === 'paste' ? (
        <div className="fitline-paste-panel">
          <button
            type="button"
            className="fitline-paste-btn"
            onClick={() => void pasteFromClipboard()}
            disabled={disabled || pasteBusy}
          >
            <span className="fitline-paste-btn__icon" aria-hidden="true">
              ⎘
            </span>
            <span className="fitline-paste-btn__title">
              {pasteBusy ? 'Pasting…' : text.trim() ? 'Paste again' : 'Paste job description'}
            </span>
            <span className="fitline-paste-btn__hint">
              Copies from your clipboard in one tap. You can still edit below.
            </span>
          </button>
          <textarea
            ref={textareaRef}
            className="fitline-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Or paste / type the full job description here…"
            aria-label="Job description"
          />
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          className="fitline-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            'Type requirements, one per line.\nExample:\n3+ years React\nTypeScript\nREST APIs\nAWS preferred'
          }
        />
      )}

      {localError ? <div className="fitline-error">{localError}</div> : null}

      <div style={{ marginTop: 24 }}>
        <Button disabled={disabled} onClick={submit}>
          {disabled ? 'Working…' : 'Tailor Your Resume →'}
        </Button>
      </div>
    </div>
  )
}
