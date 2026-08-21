import { useCallback, useEffect, useState } from 'react'
import type { StoredResume } from '@/types'
import { getResume, removeResume, saveResume } from '@/lib/storage'
import { extractTextFromFile, isSupportedResumeFile } from '@/lib/parseResume'
import {
  loadResumeTemplate,
  TEMPLATE_FILE_NAME,
  TEMPLATE_MIME,
} from '@/lib/resumeTemplate'

export function useResumeStorage() {
  const [resume, setResume] = useState<StoredResume | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const seedTemplate = useCallback(async () => {
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
      // Seed or replace non-DOCX saves so layout always comes from the Fitline template.
      const isDocx = !!stored?.fileName?.toLowerCase().endsWith('.docx')
      if (!stored?.blob || !isDocx) {
        stored = await seedTemplate()
      }
      setResume(stored)
    } catch {
      try {
        const seeded = await seedTemplate()
        setResume(seeded)
      } catch {
        setError('Could not load the Fitline resume layout template.')
      }
    } finally {
      setLoading(false)
    }
  }, [seedTemplate])

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
      // Uploads are accepted for content review, but regenerated files always use
      // the canonical layout template. Prefer DOCX uploads that replace the template seed.
      const text = await extractTextFromFile(file, (message) => setStatus(message))
      setStatus('Saving on this device…')
      const isDocx =
        file.name.toLowerCase().endsWith('.docx') ||
        (file.type || '').includes('wordprocessingml')
      const saved = await saveResume({
        fileName: isDocx ? TEMPLATE_FILE_NAME : file.name,
        mimeType: isDocx ? TEMPLATE_MIME : file.type || 'application/octet-stream',
        savedAt: Date.now(),
        text,
        blob: isDocx ? file : (await loadResumeTemplate()).blob,
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
      const seeded = await seedTemplate()
      setResume(seeded)
    } catch {
      setError('Could not reset the resume template.')
    } finally {
      setBusy(false)
    }
  }, [seedTemplate])

  return { resume, loading, busy, status, error, setError, upload, remove, refresh }
}
