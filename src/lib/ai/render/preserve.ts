import type { RenderMode, TailoredResume } from '@/types'
import { isDocxMime } from '@/lib/preserveFormat'
import { tailorDocxBlob } from '@/lib/tailorDocx'

export function isPreserveDocx(resume: TailoredResume): boolean {
  return (
    !!resume.sourceBlob &&
    isDocxMime(resume.sourceMimeType || '', resume.sourceFileName || '')
  )
}

/**
 * Preserve My Layout: edit the user's DOCX in place when possible.
 * Returns null if preserve DOCX is not available (caller falls back to classic).
 */
export async function renderPreserveDocx(resume: TailoredResume): Promise<Blob | null> {
  if (!isPreserveDocx(resume) || !resume.sourceBlob) return null
  try {
    return await tailorDocxBlob(resume.sourceBlob, resume.appliedChanges || [])
  } catch (err) {
    console.error('[Fitline] preserve DOCX edit failed', err)
    return null
  }
}

export function preserveWarning(mode: RenderMode, fileName?: string, mimeType?: string): string | null {
  if (mode !== 'preserve') return null
  if (isDocxMime(mimeType || '', fileName || '')) return null
  return 'Preserve works best with DOCX. PDF keeps your content and section order; exact PDF design cannot be cloned.'
}
