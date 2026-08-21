import JSZip from 'jszip'
import type { TailoringChange } from '@/types'
import { normalizeForMatch } from '@/lib/preserveFormat'

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Apply text replacements inside a DOCX while keeping runs, styles, and layout.
 * Replacements are applied per paragraph so formatting outside edited phrases stays intact.
 */
export async function tailorDocxBlob(
  source: Blob,
  changes: TailoringChange[],
): Promise<Blob> {
  const ordered = [...changes]
    .filter((c) => c.original?.trim() && c.tailored?.trim() && c.original !== c.tailored)
    .sort((a, b) => b.original.length - a.original.length)

  if (!ordered.length) return source

  const zip = await JSZip.loadAsync(await source.arrayBuffer())
  const targets = Object.keys(zip.files).filter(
    (name) =>
      /^word\/document\.xml$/i.test(name) ||
      /^word\/header\d*\.xml$/i.test(name) ||
      /^word\/footer\d*\.xml$/i.test(name),
  )

  for (const path of targets) {
    const file = zip.file(path)
    if (!file) continue
    const xml = await file.async('string')
    const next = replaceInWordXml(xml, ordered)
    if (next !== xml) {
      zip.file(path, next)
    }
  }

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}

function replaceInWordXml(xml: string, changes: TailoringChange[]): string {
  return xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (para) => applyChangesToParagraph(para, changes))
}

function applyChangesToParagraph(para: string, changes: TailoringChange[]): string {
  const runs = [...para.matchAll(/<w:t(\s[^>]*)?>([^<]*)<\/w:t>/g)]
  if (!runs.length) return para

  const joined = runs.map((r) => decodeXml(r[2] ?? '')).join('')
  let next = joined

  for (const change of changes) {
    if (next.includes(change.original)) {
      next = next.replace(change.original, change.tailored)
      continue
    }
    const flex = flexibleMatch(next, change.original)
    if (flex) {
      next = next.slice(0, flex.index) + change.tailored + next.slice(flex.index + flex.length)
    }
  }

  if (next === joined) return para

  let used = false
  return para.replace(/<w:t(\s[^>]*)?>([^<]*)<\/w:t>/g, (_full, attrs = '') => {
    if (!used) {
      used = true
      const needsPreserve = /^\s|\s$/.test(next) || /\s{2,}/.test(next)
      let a = attrs || ''
      if (needsPreserve && !/xml:space=/.test(a)) {
        a = `${a} xml:space="preserve"`
      }
      return `<w:t${a}>${escapeXml(next)}</w:t>`
    }
    return `<w:t${attrs}></w:t>`
  })
}

function flexibleMatch(
  haystack: string,
  needle: string,
): { index: number; length: number } | null {
  const normNeedle = normalizeForMatch(needle)
  if (!normNeedle) return null
  const parts = normNeedle.split(/\s+/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!parts.length) return null
  const re = new RegExp(parts.join('\\s+'))
  const m = re.exec(haystack)
  if (!m) return null
  return { index: m.index, length: m[0].length }
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}
