import { createWorker } from 'tesseract.js'

export async function extractTextFromImage(
  file: File,
  onProgress?: (status: string) => void,
): Promise<string> {
  onProgress?.('Preparing OCR…')
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
    const cleaned = text.replace(/\s+\n/g, '\n').trim()
    if (!cleaned || cleaned.length < 20) {
      throw new Error(
        'Could not extract enough text from this image. Try a clearer screenshot or paste the job description instead.',
      )
    }
    return cleaned
  } finally {
    await worker.terminate()
  }
}
