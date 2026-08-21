import { useCallback, useEffect, useState } from 'react'
import type { StoredResume } from '@/types'
import { getResume, removeResume, saveResume } from '@/lib/storage'
import { extractTextFromFile, isSupportedResumeFile } from '@/lib/parseResume'
import { loadResumeTemplate, TEMPLATE_FILE_NAME, TEMPLATE_MIME } from '@/lib/resumeTemplate'

export function useResumeStorage() {
  const [resume, setResume] = useState<StoredResume | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  /** Optional demo seed only when nothing is saved yet. */
  const seedDemoIfEmpty = useCallback(async () => {
    const template = await loadResumeTemplate()
    return saveResume({
      fileName: TEMPLATE_FILE_NAME,
      mimeType: TEMPLATE_MIME,
      savedAt: Date.now(),
      text: template.text,
      blob: template.blob,
    })
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      let stored = await getResume()
      if (!stored?.blob || !stored.text?.trim()) {
        stored = await seedDemoIfEmpty()
      }
      setResume(stored)
    } catch {
      try {
        const seeded = await seedDemoIfEmpty()
        setResume(seeded)
      } catch {
        setError('Could not load a resume on this device.')
      }
    } finally {
      setLoading(false)
    }
  }, [seedDemoIfEmpty])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const upload = useCallback(async (file: File) => {
    setError(null)
    setStatus(null)
    if (!isSupportedResumeFile(file)) {
      setError('Unsupported file. Upload a PDF, DOCX, TXT, or clear image of your resume.')
      return
    }
    setBusy(true)
    try {
      const text = await extractTextFromFile(file, (message) => setStatus(message))
      if (!text || text.trim().length < 40) {
        throw new Error('Could not read enough text from that file. Try another PDF or DOCX.')
      }
      setStatus('Saving on this device…')
      const saved = await saveResume({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        savedAt: Date.now(),
        text,
        blob: file,
      })
      setResume(saved)
      setStatus(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to read that resume.')
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }, [])

  const remove = useCallback(async () => {
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      await removeResume()
      setResume(null)
    } catch {
      setError('Could not remove the saved resume.')
    } finally {
      setBusy(false)
    }
  }, [])

  return { resume, loading, busy, status, error, setError, upload, remove, refresh }
}
