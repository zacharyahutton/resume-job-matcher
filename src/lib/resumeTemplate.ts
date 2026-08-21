import mammoth from 'mammoth'
import { correctKnownResumeTypos } from '@/lib/preserveFormat'

const TEMPLATE_URL = '/assets/templates/zachary-resume.docx'
export const TEMPLATE_FILE_NAME = 'ZACHARY_HUTTON_RESUME.docx'
export const TEMPLATE_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
/** Bump when the canonical DOCX content is corrected so local storage reseeds. */
export const TEMPLATE_VERSION = 2

export type ResumeTemplate = {
  blob: Blob
  text: string
  fileName: string
  mimeType: string
  version: number
}

let cache: ResumeTemplate | null = null

function cleanText(input: string): string {
  return correctKnownResumeTypos(
    input
      .replace(/\u0000/g, '')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[^\S\n]{2,}/g, ' ')
      .trim(),
  )
}

/**
 * Canonical Fitline resume layout. Every regenerated download is built from this DOCX
 * so output stays visually consistent (same styles, sections, spacing).
 */
export async function loadResumeTemplate(): Promise<ResumeTemplate> {
  if (cache?.blob && cache.text && cache.version === TEMPLATE_VERSION) return cache

  const res = await fetch(`${TEMPLATE_URL}?v=${TEMPLATE_VERSION}`)
  if (!res.ok) {
    throw new Error('Could not load the Fitline resume layout template.')
  }

  const blob = await res.blob()
  const arrayBuffer = await blob.arrayBuffer()
  const extracted = await mammoth.extractRawText({ arrayBuffer })
  const text = cleanText(extracted.value)

  if (!text || text.length < 80) {
    throw new Error(
      'Resume layout template appears empty. Re-add the DOCX under public/assets/templates.',
    )
  }

  cache = {
    blob,
    text,
    fileName: TEMPLATE_FILE_NAME,
    mimeType: TEMPLATE_MIME,
    version: TEMPLATE_VERSION,
  }
  return cache
}

export function clearResumeTemplateCache() {
  cache = null
}
