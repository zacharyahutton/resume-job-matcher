import { useCallback, useEffect, useState } from 'react'
import type { StoredResume } from '@/types'
import { getResume, removeResume, saveResume } from '@/lib/storage'
import { extractTextFromFile, isSupportedResumeFile } from '@/lib/parseResume'

/**
 * Resume storage is per-browser only. Never seed another person's resume
 * (including Zachary's) into empty devices.
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
      // Drop accidental demo seeds that contain Zachary's personal resume.
      if (
        stored &&
        (/zachary_hutton_resume/i.test(stored.fileName) ||
          /zachary-resume/i.test(stored.fileName) ||
          (/zachary\s+hutton/i.test(stored.text || '') &&
            /hzach577/i.test(stored.text || '') &&
            /seed|template|demo/i.test(stored.fileName)))
      ) {
        // Only clear if it looks like the auto-seeded template filename
        if (/zachary_hutton_resume|zachary-resume/i.test(stored.fileName)) {
          await removeResume()
          setResume(null)
          return
        }
      }
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
