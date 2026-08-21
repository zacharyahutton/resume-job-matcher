import mammoth from 'mammoth'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { normalizeResumeExportText } from '@/lib/preserveFormat'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const NAME_OK = /\.(pdf|docx|doc|txt|rtf|png|jpe?g|webp|gif|bmp)$/i

export type ExtractProgress = (message: string) => void

export function isSupportedResumeFile(file: File): boolean {
  const type = (file.type || '').toLowerCase()
  if (
    type.includes('pdf') ||
    type.includes('word') ||
    type.includes('msword') ||
    type.includes('text') ||
    type.includes('rtf') ||
    type.startsWith('image/')
  ) {
    return true
  }
  return NAME_OK.test(file.name)
}

export function isSupportedImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)
}

export async function extractTextFromFile(
  file: File,
  onProgress?: ExtractProgress,
): Promise<string> {
  const name = file.name.toLowerCase()
  const type = (file.type || '').toLowerCase()

  onProgress?.('Reading file…')

  if (type === 'text/plain' || name.endsWith('.txt') || name.endsWith('.rtf')) {
    const text = (await file.text()).trim()
    if (!text) throw new Error('That text file looks empty.')
    return cleanText(text)
  }

  if (isSupportedImageFile(file)) {
    onProgress?.('Reading image with OCR…')
    return extractTextFromImageFile(file, onProgress)
  }

  if (
    type.includes('officedocument.wordprocessingml') ||
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    onProgress?.('Reading DOCX…')
    return extractDocxText(await file.arrayBuffer())
  }

  if (type === 'application/msword' || name.endsWith('.doc')) {
    try {
      onProgress?.('Trying to read DOC as DOCX…')
      const text = await extractDocxText(await file.arrayBuffer())
      if (text.length > 40) return text
    } catch {
      // fall through
    }
    throw new Error(
      'Legacy .doc files are unreliable. Please re-save as PDF or DOCX, then upload again.',
    )
  }

  if (
    type.includes('pdf') ||
    name.endsWith('.pdf') ||
    !name.includes('.') ||
    type === 'application/octet-stream' ||
    !type
  ) {
    return extractPdfText(file, onProgress)
  }

  try {
    return await extractPdfText(file, onProgress)
  } catch {
    throw new Error('Could not read this file. Try PDF, DOCX, TXT, or a clear image of your resume.')
  }
}

/** Re-read text from a stored blob (prefer DOCX over stale/corrupt PDF extract). */
export async function extractTextFromBlob(
  blob: Blob,
  fileName?: string,
  mimeType?: string,
  onProgress?: ExtractProgress,
): Promise<string> {
  const name = (fileName || '').toLowerCase()
  const type = (mimeType || blob.type || '').toLowerCase()
  const file = new File([blob], fileName || 'resume', {
    type: type || 'application/octet-stream',
  })
  if (
    type.includes('wordprocessingml') ||
    name.endsWith('.docx') ||
    type.includes('msword')
  ) {
    onProgress?.('Reading DOCX…')
    const buffer = await Promise.race([
      blob.arrayBuffer(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('DOCX buffer timed out')), 5000),
      ),
    ])
    return extractDocxText(buffer)
  }
  return extractTextFromFile(file, onProgress)
}

async function extractDocxText(arrayBuffer: ArrayBuffer): Promise<string> {
  const result = await Promise.race([
    mammoth.extractRawText({ arrayBuffer }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('DOCX read timed out')), 8000),
    ),
  ])
  const text = cleanText(result.value)
  if (!text) throw new Error('Could not read text from this DOCX file.')
  return normalizeResumeExportText(text)
}

async function extractPdfText(file: File, onProgress?: ExtractProgress): Promise<string> {
  onProgress?.('Opening PDF…')
  const data = new Uint8Array(await file.arrayBuffer())

  let doc
  try {
    doc = await getDocument({
      data,
      useSystemFonts: true,
      disableFontFace: false,
      isEvalSupported: false,
      verbosity: 0,
    }).promise
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown PDF error'
    throw new Error(`Could not open this PDF (${msg}). Try exporting it again or upload a DOCX.`)
  }

  onProgress?.(`Reading ${doc.numPages} page${doc.numPages === 1 ? '' : 's'}…`)
  const parts: string[] = []

  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent({ includeMarkedContent: false })
    parts.push(rebuildPageText(content.items))
  }

  let text = cleanText(parts.join('\n\n'))
  text = normalizeResumeExportText(text)

  if (text.length < 40) {
    onProgress?.('No text layer found. Running OCR…')
    text = normalizeResumeExportText(cleanText(await ocrPdfDocument(doc, onProgress)))
  }

  if (text.length < 20) {
    throw new Error(
      'Could not extract readable text from this PDF. Try a clearer export, DOCX, or a screenshot of the resume.',
    )
  }

  if (looksBadlyExtracted(text)) {
    onProgress?.(
      'PDF text looks damaged. Prefer uploading a DOCX for accurate Preserve and Rebuild.',
    )
  }

  return text
}

/** Heuristic: PDF glyph soup that will produce broken exports. */
export function looksBadlyExtracted(text: string): boolean {
  const t = text || ''
  if (/rtmorentcog|781-\s*4\b|Platfor\s*m\s+I\s+/i.test(t)) return true
  // Many single-letter tokens separated by spaces ("P l a t f o r m")
  const spacedLetters = (t.match(/\b[A-Za-z]\s+[A-Za-z]\s+[A-Za-z]\b/g) || []).length
  if (spacedLetters >= 4) return true
  return false
}

type PdfTextItem = {
  str: string
  x: number
  y: number
  w: number
}

/**
 * Rebuild page text with X/Y awareness so multi-column contact lines
 * do not scramble into "Platform I r   rtmorentcog.org".
 */
function rebuildPageText(items: unknown[]): string {
  const parsed: PdfTextItem[] = []

  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as {
      str?: string
      transform?: number[]
      width?: number
      hasEOL?: boolean
    }
    if (typeof item.str !== 'string' || !item.str) continue
    if (item.str === ' ') {
      // Keep explicit spaces from the PDF as soft spaces on the current run
    }
    const transform = item.transform
    if (!transform || transform.length < 6) continue
    parsed.push({
      str: item.str,
      x: transform[4],
      y: transform[5],
      w: typeof item.width === 'number' ? item.width : estimateWidth(item.str),
    })
  }

  if (!parsed.length) return ''

  // Higher Y is higher on the page in PDF coords.
  parsed.sort((a, b) => {
    const dy = b.y - a.y
    if (Math.abs(dy) > 2.5) return dy
    return a.x - b.x
  })

  const lines: PdfTextItem[][] = []
  let current: PdfTextItem[] = []
  let lineY: number | null = null

  for (const item of parsed) {
    if (lineY === null || Math.abs(item.y - lineY) <= 3.2) {
      current.push(item)
      if (lineY === null) lineY = item.y
      else lineY = (lineY * (current.length - 1) + item.y) / current.length
    } else {
      if (current.length) lines.push(current)
      current = [item]
      lineY = item.y
    }
  }
  if (current.length) lines.push(current)

  return lines.map(joinLineItems).filter(Boolean).join('\n')
}

function estimateWidth(str: string): number {
  return Math.max(str.length * 4.5, 1)
}

function joinLineItems(items: PdfTextItem[]): string {
  const sorted = [...items].sort((a, b) => a.x - b.x)
  let out = ''
  let prev: PdfTextItem | null = null

  for (const item of sorted) {
    const piece = item.str
    if (!prev) {
      out = piece
      prev = item
      continue
    }

    const prevEnd = prev.x + Math.max(prev.w, estimateWidth(prev.str) * 0.55)
    const gap = item.x - prevEnd

    if (gap > 28) {
      // Large horizontal gap → column / contact separator
      out += ' | ' + piece.trimStart()
    } else if (gap > 1.8) {
      if (!out.endsWith(' ') && !piece.startsWith(' ')) out += ' '
      out += piece
    } else {
      // Adjacent glyphs (or tiny gap): concatenate without inventing spaces
      out += piece
    }
    prev = item
  }

  return out.replace(/[ \t]{2,}/g, ' ').trim()
}

async function ocrPdfDocument(
  doc: { numPages: number; getPage: (n: number) => Promise<unknown> },
  onProgress?: ExtractProgress,
): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        onProgress?.(`OCR ${Math.round(m.progress * 100)}%…`)
      }
    },
  })

  try {
    const maxPages = Math.min(doc.numPages, 4)
    const chunks: string[] = []

    for (let i = 1; i <= maxPages; i += 1) {
      onProgress?.(`OCR page ${i} of ${maxPages}…`)
      const page = (await doc.getPage(i)) as {
        getViewport: (o: { scale: number }) => { width: number; height: number }
        render: (o: {
          canvasContext: CanvasRenderingContext2D
          viewport: { width: number; height: number }
        }) => { promise: Promise<void> }
      }
      const viewport = page.getViewport({ scale: 2 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      await page.render({ canvasContext: ctx, viewport }).promise
      const {
        data: { text },
      } = await worker.recognize(canvas)
      if (text.trim()) chunks.push(text.trim())
    }

    return chunks.join('\n\n')
  } finally {
    await worker.terminate()
  }
}

async function extractTextFromImageFile(file: File, onProgress?: ExtractProgress): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        onProgress?.(`Reading image… ${Math.round(m.progress * 100)}%`)
      }
    },
  })
  try {
    const {
      data: { text },
    } = await worker.recognize(file)
    const cleaned = cleanText(text)
    if (cleaned.length < 20) {
      throw new Error('Could not read enough text from that image. Try a clearer photo or a PDF/DOCX.')
    }
    return normalizeResumeExportText(cleaned)
  } finally {
    await worker.terminate()
  }
}

function cleanText(input: string): string {
  return input
    .replace(/\u0000/g, '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\S\n]{2,}/g, ' ')
    .trim()
}
