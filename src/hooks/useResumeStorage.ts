import { useCallback, useEffect, useState } from 'react'
import type { StoredResume } from '@/types'
import { getResume, removeResume, saveResume } from '@/lib/storage'
import { extractTextFromFile, isSupportedResumeFile } from '@/lib/parseResume'

/**
 * Resume storage is per-browser / per-device only.
 * Never seed another person's resume into empty devices.
 */
export function useResumeStorage() {
  const [resume, setResume] = useState<StoredResume | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const stored = await getResume()
      setResume(stored)
    } catch {
      setError('Could not read the saved resume from this device.')
      setResume(null)
    } finally {
      setLoading(false)
    }
  }, [])

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
      // Confirm it actually persisted (IDB and/or local mirror).
      const verified = await getResume()
      if (!verified?.text) {
        throw new Error(
          'Save looked successful but nothing was stored. Check that this browser allows site data for Fitline.',
        )
      }
      setResume(verified.fileName === saved.fileName ? verified : saved)
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
