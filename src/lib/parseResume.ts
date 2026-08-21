import mammoth from 'mammoth'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

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
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    const text = cleanText(result.value)
    if (!text) throw new Error('Could not read text from this DOCX file.')
    return text
  }

  if (type === 'application/msword' || name.endsWith('.doc')) {
    // Best-effort: some .doc files are mislabeled DOCX / zip packages
    try {
      onProgress?.('Trying to read DOC as DOCX…')
      const arrayBuffer = await file.arrayBuffer()
      const result = await mammoth.extractRawText({ arrayBuffer })
      const text = cleanText(result.value)
      if (text.length > 40) return text
    } catch {
      // fall through
    }
    throw new Error(
      'Legacy .doc files are unreliable. Please re-save as PDF or DOCX, then upload again.',
    )
  }

  // Default: treat unknown / octet-stream / empty mime with .pdf (or no ext) as PDF attempt
  if (type.includes('pdf') || name.endsWith('.pdf') || !name.includes('.') || type === 'application/octet-stream' || !type) {
    return extractPdfText(file, onProgress)
  }

  // Last resort: try PDF parser anyway (many browsers give empty mime)
  try {
    return await extractPdfText(file, onProgress)
  } catch {
    throw new Error('Could not read this file. Try PDF, DOCX, TXT, or a clear image of your resume.')
  }
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
    const content = await page.getTextContent({ includeMarkedContent: true })
    parts.push(rebuildPageText(content.items))
  }

  let text = cleanText(parts.join('\n\n'))

  // Scanned / image-only PDF → OCR first pages
  if (text.length < 40) {
    onProgress?.('No text layer found. Running OCR…')
    text = cleanText(await ocrPdfDocument(doc, onProgress))
  }

  if (text.length < 20) {
    throw new Error(
      'Could not extract readable text from this PDF. Try a clearer export, DOCX, or a screenshot of the resume.',
    )
  }

  return text
}

function rebuildPageText(items: unknown[]): string {
  const lines: string[] = []
  let current = ''
  let lastY: number | null = null

  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as { str?: string; transform?: number[]; hasEOL?: boolean }
    if (typeof item.str !== 'string') continue

    const y = item.transform ? item.transform[5] : null
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 6) {
      if (current.trim()) lines.push(current.trim())
      current = item.str
    } else {
      const needsSpace =
        current.length > 0 &&
        !current.endsWith(' ') &&
        !current.endsWith('-') &&
        item.str.length > 0 &&
        !item.str.startsWith(' ')
      current += needsSpace ? ` ${item.str}` : item.str
    }

    if (item.hasEOL) {
      if (current.trim()) lines.push(current.trim())
      current = ''
      lastY = null
    } else {
      lastY = y
    }
  }

  if (current.trim()) lines.push(current.trim())
  return lines.join('\n')
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
    return cleaned
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
