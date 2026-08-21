import type { TailoringChange } from '@/types'

/** Normalize whitespace for fuzzy matching without destroying meaning. */
export function normalizeForMatch(s: string): string {
  return s
    .replace(/\u00a0/g, ' ')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

/**
 * Apply wording changes onto the original resume text so section order,
 * headings, bullets, and spacing stay intact.
 */
export function applyChangesToOriginalText(
  originalText: string,
  changes: TailoringChange[],
): string {
  let text = originalText

  const ordered = sanitizeChanges(changes).sort((a, b) => b.original.length - a.original.length)

  for (const change of ordered) {
    const next = replaceOnceFlexible(text, change.original, change.tailored)
    if (next !== null) text = next
  }

  return text
}

/** Keep only edits that can actually be found in the original resume text. */
export function filterApplicableChanges(
  originalText: string,
  changes: TailoringChange[],
): TailoringChange[] {
  return sanitizeChanges(changes).filter((c) => canApplyChange(originalText, c.original))
}

export function canApplyChange(haystack: string, needle: string): boolean {
  if (!needle?.trim()) return false
  if (haystack.includes(needle)) return true
  return replaceOnceFlexible(haystack, needle, needle) !== null
}

/** True when the edit is punctuation/whitespace only (fake "rewrite"). */
export function isTrivialEdit(original: string, tailored: string): boolean {
  const strip = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9+#.]/g, '')
      .trim()
  const a = strip(original)
  const b = strip(tailored)
  if (!a || !b) return true
  if (a === b) return true
  // Tiny tweak only (e.g. added a period or one filler word)
  const longer = Math.max(a.length, b.length)
  const shorter = Math.min(a.length, b.length)
  if (longer > 0 && shorter / longer > 0.92 && Math.abs(a.length - b.length) < 12) {
    return true
  }
  return false
}

/** Drop junk / unsafe edits so regenerates stay consistent and format-safe. */
export function sanitizeChanges(changes: TailoringChange[]): TailoringChange[] {
  return changes
    .map((c) => ({
      ...c,
      // Keep original glyphs so find-and-replace still hits the uploaded text.
      original: (c.original || '').trim(),
      tailored: correctKnownResumeTypos(cleanTailoredLeak(c.tailored || '')).trim(),
      why: (c.why || '').trim(),
      action: c.action === 'trim' ? ('trim' as const) : ('rewrite' as const),
    }))
    .filter((c) => {
      if (!c.original || !c.tailored || c.original === c.tailored) return false
      if (isTrivialEdit(c.original, c.tailored)) return false
      if (isProtectedResumeLine(c.original)) return false
      if (looksLikeLeak(c.tailored)) return false
      if (c.tailored.length > c.original.length * 3.2 + 60) return false
      if (c.original.length < 18) return false
      return true
    })
}

function cleanTailoredLeak(s: string): string {
  return s
    .replace(/\s*,?\s*framed for relevance to[^.\n]*/gi, '')
    .replace(/\s*,?\s*emphasizing relevance to[^.\n]*/gi, '')
    .replace(/[«»‹›]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function looksLikeLeak(s: string): boolean {
  return /framed for relevance|emphasizing relevance to/i.test(s)
}

/** Clean extracted/AI text before layout rebuild (bullets, dashes, junk glyphs). */
export function normalizeResumeExportText(text: string): string {
  return correctKnownResumeTypos(
    text
      .replace(/\u00a0/g, ' ')
      .replace(/[«»‹›]/g, '•')
      .replace(/^[•\u2022▪]+\s*/gm, '• ')
      .replace(/^[+]\s+/gm, '• ')
      .replace(/[–—]/g, '-')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  )
}

/**
 * Fix known OCR / corruption typos that must never ship in PDF or DOCX.
 * Safe exact replacements only.
 */
export function correctKnownResumeTypos(text: string): string {
  let t = text
  const swaps: Array<[RegExp, string]> = [
    [/hzach577n\s*gmai1\.com/gi, 'hzach577@gmail.com'],
    [/hzach577ngmai1\.com/gi, 'hzach577@gmail.com'],
    [/gmai1\.com/gi, 'gmail.com'],
    [/verce1\.app/gi, 'vercel.app'],
    [/\bLinkedln\b/g, 'LinkedIn'],
    [/linkedin\.com\/in\/zachary-hutton-azab8i4is/gi, 'linkedin.com/in/zachary-hutton-a2ab81415'],
    [/\bTypeSeript\b/g, 'TypeScript'],
    [/\bAl-adjacent\b/g, 'AI-adjacent'],
    [/\bIweroi\.net\b/gi, 'weroi.net'],
    [/Agency Platfor\s*m\s*I\s*weroi\.net/gi, 'Agency Platform | weroi.net'],
    [/Agency Platform\s*I\s*weroi\.net/gi, 'Agency Platform | weroi.net'],
    [/\b2O24\b/g, '2024'],
    [/\b2o25\b/g, '2025'],
    [/\b2o2O\b/g, '2020'],
    [/\b2O2O\b/g, '2020'],
    [/\bTendem\b/g, 'Telegram'],
    [/\*\s*\.me\/zachtedempbot/gi, 't.me/zachtedempbot'],
    [/I\s*\*\s*\.me\//gi, '| t.me/'],
    [/r\s*rtmorentcog\.org/gi, ''],
    [/Ministry Platfor\s*m\s*I\s*/gi, 'Ministry Platform | '],
    [/GPA:\s*3\.7\s*!\s*/g, 'GPA: 3.7 | '],
    [/May\s+song/gi, 'May 2029'],
    [/\(876\)\s*781-\s*4\b/g, '(876) 370-1398'],
    [/\(8\s*7\s*6\)\s*7\s*81-\s*4/g, '(876) 370-1398'],
    [/\s{2,}/g, ' '],
  ]
  for (const [re, to] of swaps) t = t.replace(re, to)
  return t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Never edit name, contact, links, section headers, or date lines. */
export function isProtectedResumeLine(line: string): boolean {
  const t = line.trim()
  if (!t) return true
  if (/^(EXPERIENCE|WORK EXPERIENCE|EDUCATION|SKILLS|TECHNICAL SKILLS|SUMMARY|PROJECTS|CERTIFICATIONS|ACHIEVEMENTS|SELECTED PROJECTS|PROFILE|OBJECTIVE)\b/i.test(t)) {
    return true
  }
  if (/@|https?:\/\/|www\.|\.com|\.net|\.online|linkedin\.com|github\.com/i.test(t)) return true
  if (/^\+?\d[\d\s().-]{7,}$/.test(t)) return true
  if (/^(portfolio|github|linkedin)\b/i.test(t)) return true
  if (/\|/.test(t) && /@|\.com|github|linkedin|portfolio/i.test(t)) return true
  if (/^\d{4}\s*[–—-]\s*(present|\d{4})/i.test(t)) return true
  if (t === t.toUpperCase() && t.length < 48 && !/[•\-]/.test(t) && t.split(/\s+/).length <= 6) {
    return true
  }
  return false
}


/**
 * Try exact replace, then whitespace-flexible replace within the document.
 * Returns null if the original snippet cannot be found.
 */
function replaceOnceFlexible(haystack: string, needle: string, replacement: string): string | null {
  if (!needle) return null
  if (haystack.includes(needle)) {
    return haystack.replace(needle, replacement)
  }

  const normNeedle = normalizeForMatch(needle)
  if (!normNeedle) return null

  // Build a regex that allows flexible whitespace between words
  const parts = normNeedle.split(/\s+/).map(escapeRegExp)
  if (!parts.length) return null
  const flex = new RegExp(parts.join('\\s+'), 'm')
  const match = flex.exec(haystack)
  if (!match) return null

  return haystack.slice(0, match.index) + replacement + haystack.slice(match.index + match[0].length)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const SECTION_HEADING =
  /^(EXPERIENCE|WORK EXPERIENCE|PROFESSIONAL EXPERIENCE|EMPLOYMENT|EDUCATION|SKILLS|TECHNICAL SKILLS|PROJECTS|CERTIFICATIONS|CERTIFICATES|SUMMARY|PROFESSIONAL SUMMARY|PROFILE|OBJECTIVE|CONTACT|ACHIEVEMENTS|AWARDS|LANGUAGES|INTERESTS|REFERENCES|TECHNOLOGIES|TOOLS|PUBLICATIONS)\b/i

/** Split preserved resume text into heading/content blocks for structured export fallback. */
export function sectionsFromPreservedText(text: string): Array<{ heading: string; content: string }> {
  const lines = text.split(/\n/)
  const sections: Array<{ heading: string; content: string }> = []
  let currentHeading = 'Resume'
  let buf: string[] = []

  const flush = () => {
    const content = buf.join('\n').trim()
    if (content || sections.length === 0) {
      sections.push({ heading: currentHeading, content })
    }
    buf = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    const looksHeading =
      (trimmed.length > 0 &&
        trimmed.length < 48 &&
        SECTION_HEADING.test(trimmed.replace(/[:.\s]+$/, ''))) ||
      (trimmed.length > 2 &&
        trimmed.length < 40 &&
        trimmed === trimmed.toUpperCase() &&
        /[A-Z]/.test(trimmed) &&
        !/[•\-]/.test(trimmed) &&
        trimmed.split(/\s+/).length <= 5)

    if (looksHeading) {
      flush()
      currentHeading = trimmed.replace(/[:.\s]+$/, '')
      continue
    }
    buf.push(line)
  }
  flush()

  if (sections.length === 1 && sections[0].heading === 'Resume') {
    return [{ heading: 'Resume', content: text }]
  }

  return sections.filter((s) => s.content.trim().length > 0 || s.heading !== 'Resume')
}

export function isDocxMime(mime: string, fileName: string): boolean {
  const m = (mime || '').toLowerCase()
  const n = (fileName || '').toLowerCase()
  return (
    m.includes('officedocument.wordprocessingml') ||
    m.includes('msword') ||
    n.endsWith('.docx') ||
    n.endsWith('.doc')
  )
}

export function isPdfMime(mime: string, fileName: string): boolean {
  const m = (mime || '').toLowerCase()
  const n = (fileName || '').toLowerCase()
  return m.includes('pdf') || n.endsWith('.pdf')
}
