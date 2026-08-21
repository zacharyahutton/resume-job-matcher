import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
  TabStopType,
} from 'docx'
import { jsPDF } from 'jspdf'
import { saveAs } from 'file-saver'
import type { TailoredResume } from '@/types'
import { isDocxMime, normalizeResumeExportText } from '@/lib/preserveFormat'
import { tailorDocxBlob } from '@/lib/tailorDocx'
import { loadResumeTemplate } from '@/lib/resumeTemplate'

type LineKind = 'blank' | 'name' | 'contact' | 'heading' | 'job' | 'bullet' | 'body'

function linesFromText(text: string): string[] {
  return normalizeResumeExportText(text)
    .split(/\n/)
    .map((l) => l.trimEnd())
    .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
}

function looksLikeHeading(line: string): boolean {
  const t = line.trim().replace(/[:.\s]+$/, '')
  if (!t || t.length > 52) return false
  if (/^[•\-*+]/.test(t)) return false
  if (
    /^(EXPERIENCE|WORK EXPERIENCE|PROFESSIONAL EXPERIENCE|EDUCATION|SKILLS|TECHNICAL SKILLS|TECHNICAL DOCUMENTATION|SUMMARY|PROFESSIONAL SUMMARY|PROJECTS|SELECTED PROJECTS|CERTIFICATIONS|ACHIEVEMENTS|PROFILE|OBJECTIVE|LANGUAGES|TOOLS|TECHNOLOGIES)\b/i.test(
      t,
    )
  ) {
    return true
  }
  // ALL CAPS short section labels only (never treat body as centered name)
  if (t === t.toUpperCase() && /[A-Z]/.test(t) && t.split(/\s+/).length <= 5 && t.length >= 4) {
    return true
  }
  return false
}

function looksLikeContact(line: string): boolean {
  const t = line.trim()
  return (
    /@/.test(t) ||
    /\|\s*/.test(t) ||
    /linkedin\.com|github\.com|\.online|portfolio/i.test(t) ||
    /^\+?\d[\d\s().-]{7,}$/.test(t)
  )
}

const DATE_TAIL =
  /((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?\.?\s+)?(?:19|20)\d{2}\s*[–—-]\s*(?:Present|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?\.?\s+)?(?:19|20)\d{2}))\s*$/i

function splitJobLine(line: string): { left: string; right: string } | null {
  const t = line.trim()
  const spaced = t.match(/^(.+?)\s{2,}(.+)$/)
  if (spaced && DATE_TAIL.test(spaced[2])) {
    return { left: spaced[1].trim(), right: spaced[2].trim() }
  }
  const m = t.match(DATE_TAIL)
  if (m && m.index != null && m.index > 8) {
    return { left: t.slice(0, m.index).trim().replace(/[|,]+$/, '').trim(), right: m[1].trim() }
  }
  return null
}

function looksLikeBullet(line: string): boolean {
  return /^[•\u2022▪\-*+«»]\s+/.test(line.trim()) || /^[•\u2022▪]/.test(line.trim())
}

function stripBulletPrefix(line: string): string {
  return line.trim().replace(/^[•\u2022▪\-*+«»]\s*/, '')
}

function classifyLines(rawLines: string[]): Array<{ kind: LineKind; text: string }> {
  const out: Array<{ kind: LineKind; text: string }> = []
  let sawName = false
  let contactBudget = 0
  let headerDone = false

  for (let i = 0; i < rawLines.length; i += 1) {
    const text = rawLines[i]
    const t = text.trim()
    if (!t) {
      out.push({ kind: 'blank', text: '' })
      continue
    }
    if (looksLikeHeading(t)) {
      out.push({ kind: 'heading', text: t.replace(/[:.\s]+$/, '') })
      contactBudget = 0
      headerDone = true
      continue
    }
    // Name only once, and only before any section heading
    if (!sawName && !headerDone && t.length < 60 && !looksLikeContact(t) && !looksLikeBullet(t)) {
      out.push({ kind: 'name', text: t })
      sawName = true
      contactBudget = 4
      continue
    }
    if (!headerDone && contactBudget > 0 && looksLikeContact(t)) {
      out.push({ kind: 'contact', text: t })
      contactBudget -= 1
      continue
    }
    if (splitJobLine(t)) {
      out.push({ kind: 'job', text: t })
      continue
    }
    if (looksLikeBullet(t)) {
      out.push({ kind: 'bullet', text: stripBulletPrefix(t) })
      continue
    }
    out.push({ kind: 'body', text: t })
  }
  return out
}

export function safeFileBaseName(name: string): string {
  const cleaned = (name || 'Resume_Tailored')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 80)
  return cleaned || 'Resume_Tailored'
}

function ensureResumeText(resume: TailoredResume): string {
  const text = (resume.fullText || '').trim()
  if (text) return normalizeResumeExportText(resume.fullText)
  if (resume.sections?.length) {
    return normalizeResumeExportText(
      resume.sections.map((s) => `${s.heading}\n${s.content}`).join('\n\n'),
    )
  }
  return ''
}

function safePdfText(raw: string): string {
  return raw
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[«»‹›]/g, '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u024F]/g, '')
}

/** Build both downloadable files and attach them to the tailored resume. */
export async function materializeDownloads(resume: TailoredResume): Promise<TailoredResume> {
  const base = safeFileBaseName(resume.fileBaseName)
  const withText: TailoredResume = {
    ...resume,
    fileBaseName: base,
    fullText: ensureResumeText(resume),
    formatPreserved: true,
  }

  if (!withText.fullText.trim()) {
    throw new Error('No resume text available to build a download. Re-upload your resume and try again.')
  }

  // Prefer editing the original DOCX in place when available (true format match).
  // Always rebuild PDF with classic resume layout from the preserved text.
  const [pdfBlob, docxBlob] = await Promise.all([
    buildClassicPdfBlob(withText),
    buildDocxBlob(withText),
  ])

  return {
    ...withText,
    pdfBlob,
    docxBlob,
    builtAt: Date.now(),
  }
}

export async function downloadPdf(resume: TailoredResume): Promise<void> {
  const ready = resume.pdfBlob || (await buildClassicPdfBlob(resume))
  saveAs(ready, `${safeFileBaseName(resume.fileBaseName)}.pdf`)
}

export async function downloadDocx(resume: TailoredResume): Promise<void> {
  const ready = resume.docxBlob || (await buildDocxBlob(resume))
  saveAs(ready, `${safeFileBaseName(resume.fileBaseName)}.docx`)
}

async function buildDocxBlob(resume: TailoredResume): Promise<Blob> {
  // Prefer the attached canonical DOCX (seeded from ZACHARY_HUTTON_RESUME).
  // Fall back to the bundled template so layout never drifts to a classic rebuild.
  try {
    if (resume.sourceBlob && isDocxMime(resume.sourceMimeType || '', resume.sourceFileName || '')) {
      return await tailorDocxBlob(resume.sourceBlob, resume.appliedChanges || [])
    }
    const template = await loadResumeTemplate()
    return await tailorDocxBlob(template.blob, resume.appliedChanges || [])
  } catch (err) {
    console.error('[Fitline] template DOCX build failed', err)
  }
  return buildClassicDocxBlob(resume)
}

/**
 * Classic resume DOCX: serif, centered header, underlined section titles,
 * job title left / dates right, real bullets.
 */
async function buildClassicDocxBlob(resume: TailoredResume): Promise<Blob> {
  const classified = classifyLines(linesFromText(ensureResumeText(resume)))
  const children: Paragraph[] = []

  for (const row of classified) {
    if (row.kind === 'blank') {
      children.push(new Paragraph({ spacing: { after: 60 } }))
      continue
    }
    if (row.kind === 'name') {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [
            new TextRun({
              text: row.text.toUpperCase(),
              bold: true,
              size: 36,
              font: 'Times New Roman',
            }),
          ],
        }),
      )
      continue
    }
    if (row.kind === 'contact') {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 40 },
          children: [
            new TextRun({
              text: row.text,
              size: 20,
              font: 'Times New Roman',
            }),
          ],
        }),
      )
      continue
    }
    if (row.kind === 'heading') {
      children.push(
        new Paragraph({
          spacing: { before: 220, after: 80 },
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 12, color: '000000', space: 4 },
          },
          children: [
            new TextRun({
              text: row.text.toUpperCase(),
              bold: true,
              size: 24,
              font: 'Times New Roman',
              allCaps: true,
            }),
          ],
        }),
      )
      continue
    }
    if (row.kind === 'job') {
      const parts = splitJobLine(row.text)
      if (parts) {
        children.push(
          new Paragraph({
            spacing: { before: 120, after: 40 },
            tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
            children: [
              new TextRun({
                text: parts.left,
                bold: true,
                size: 22,
                font: 'Times New Roman',
              }),
              new TextRun({ text: '\t', font: 'Times New Roman' }),
              new TextRun({
                text: parts.right.replace(/[–—]/g, '-'),
                size: 22,
                font: 'Times New Roman',
              }),
            ],
          }),
        )
      } else {
        children.push(
          new Paragraph({
            spacing: { before: 120, after: 40 },
            children: [
              new TextRun({
                text: row.text,
                bold: true,
                size: 22,
                font: 'Times New Roman',
              }),
            ],
          }),
        )
      }
      continue
    }
    if (row.kind === 'bullet') {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          indent: { left: 288 },
          children: [
            new TextRun({
              text: `• ${row.text}`,
              size: 21,
              font: 'Times New Roman',
            }),
          ],
        }),
      )
      continue
    }
    children.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [
          new TextRun({
            text: row.text,
            size: 21,
            font: 'Times New Roman',
          }),
        ],
      }),
    )
  }

  if (!children.length) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'Tailored resume', font: 'Times New Roman', size: 22 })],
      }),
    )
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children,
      },
    ],
  })
  return Packer.toBlob(doc)
}

/**
 * Classic resume PDF matching common professional layouts:
 * Times serif, centered name/contact, section rules, right-aligned dates.
 */
async function buildClassicPdfBlob(resume: TailoredResume): Promise<Blob> {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const marginX = 54
  const marginTop = 50
  const pageW = 612
  const pageH = 792
  const maxW = pageW - marginX * 2
  const bottom = pageH - 54
  let y = marginTop

  const ensureSpace = (need: number) => {
    if (y + need > bottom) {
      doc.addPage()
      y = marginTop
    }
  }

  /** Avoid orphan first wrapped line alone at page bottom. */
  const ensureBlock = (approxHeight: number) => {
    if (y + Math.min(approxHeight, 48) > bottom) {
      doc.addPage()
      y = marginTop
    }
  }

  const drawCentered = (raw: string, size: number, bold = false) => {
    const text = safePdfText(raw)
    doc.setFont('times', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    const wrapped = doc.splitTextToSize(text || ' ', maxW) as string[]
    ensureBlock(wrapped.length * (size + 3))
    for (const line of wrapped) {
      ensureSpace(size + 4)
      const tw = doc.getTextWidth(line)
      doc.text(line, (pageW - tw) / 2, y)
      y += size + 3
    }
  }

  const drawLeft = (raw: string, size: number, bold = false, indent = 0) => {
    const text = safePdfText(raw)
    doc.setFont('times', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    const wrapped = doc.splitTextToSize(text || ' ', maxW - indent) as string[]
    ensureBlock(wrapped.length * (size + 3))
    for (const line of wrapped) {
      ensureSpace(size + 4)
      doc.text(line, marginX + indent, y)
      y += size + 3
    }
  }

  const drawHeading = (raw: string) => {
    const text = safePdfText(raw).toUpperCase()
    ensureBlock(36)
    y += 10
    ensureSpace(28)
    doc.setFont('times', 'bold')
    doc.setFontSize(12)
    doc.text(text, marginX, y)
    y += 5
    doc.setDrawColor(0)
    doc.setLineWidth(1)
    doc.line(marginX, y, pageW - marginX, y)
    y += 12
  }

  const drawJob = (raw: string) => {
    const parts = splitJobLine(raw)
    ensureBlock(22)
    ensureSpace(18)
    doc.setFont('times', 'bold')
    doc.setFontSize(11)
    if (parts) {
      const left = safePdfText(parts.left)
      const right = safePdfText(parts.right)
      doc.text(left, marginX, y)
      const rw = doc.getTextWidth(right)
      doc.setFont('times', 'normal')
      doc.text(right, pageW - marginX - rw, y)
    } else {
      doc.text(safePdfText(raw), marginX, y)
    }
    y += 14
  }

  const classified = classifyLines(linesFromText(ensureResumeText(resume)))

  for (const row of classified) {
    if (row.kind === 'blank') {
      y += 6
      continue
    }
    if (row.kind === 'name') {
      y += 2
      drawCentered(row.text.toUpperCase(), 18, true)
      y += 2
      continue
    }
    if (row.kind === 'contact') {
      drawCentered(row.text, 10, false)
      continue
    }
    if (row.kind === 'heading') {
      drawHeading(row.text)
      continue
    }
    if (row.kind === 'job') {
      y += 4
      drawJob(row.text)
      continue
    }
    if (row.kind === 'bullet') {
      drawLeft(`• ${row.text}`, 10.5, false, 14)
      continue
    }
    drawLeft(row.text, 10.5, false, 0)
  }

  return doc.output('blob')
}
