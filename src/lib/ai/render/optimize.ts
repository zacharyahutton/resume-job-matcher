import type { ResumeProfile, TailoredResume } from '@/types'
import { applyChangesToOriginalText, normalizeResumeExportText } from '@/lib/preserveFormat'

/**
 * Optimize My Resume: build full text from the user's model + applied plan.
 * Never inject another person's bio. Classic Fitline layout is applied in generateDocs.
 */
export function buildOptimizeFullText(
  resume: ResumeProfile,
  tailored: TailoredResume,
): string {
  // Prefer plan-applied text (already from this user's rawText).
  if (tailored.fullText?.trim()) {
    return normalizeResumeExportText(tailored.fullText)
  }
  if (tailored.appliedChanges?.length) {
    return normalizeResumeExportText(
      applyChangesToOriginalText(resume.rawText, tailored.appliedChanges),
    )
  }
  return normalizeResumeExportText(resume.rawText)
}

/** Compose a readable optimize body from structured model when raw apply fails. */
export function modelToPlainText(resume: ResumeProfile): string {
  const lines: string[] = []
  if (resume.name) lines.push(resume.name.toUpperCase())
  const contactBits = [
    resume.contact.location,
    resume.contact.email,
    resume.contact.phone,
    ...resume.contact.links,
  ].filter(Boolean)
  if (contactBits.length) lines.push(contactBits.join(' | '))
  if (resume.summary) {
    lines.push('', 'SUMMARY', resume.summary)
  }
  if (resume.skills.length) {
    lines.push('', 'TECHNICAL SKILLS', resume.skills.join(', '))
  }
  if (resume.experience.length) {
    lines.push('', 'EXPERIENCE')
    for (const exp of resume.experience) {
      lines.push('', `${exp.title}, ${exp.company}${exp.dates ? `\t${exp.dates}` : ''}`)
      for (const b of exp.bullets) lines.push(`• ${b}`)
    }
  }
  if (resume.projects.length) {
    lines.push('', 'SELECTED PROJECTS')
    for (const p of resume.projects) {
      lines.push('', p.name)
      if (p.description) lines.push(`• ${p.description}`)
      for (const b of p.bullets || []) lines.push(`• ${b}`)
    }
  }
  if (resume.education.length) {
    lines.push('', 'EDUCATION')
    for (const e of resume.education) {
      lines.push(
        '',
        `${e.degree || 'Studies'}, ${e.school}${e.dates ? `\t${e.dates}` : ''}`,
      )
    }
  }
  for (const other of resume.otherSections) {
    lines.push('', other.heading.toUpperCase(), other.content)
  }
  return normalizeResumeExportText(lines.join('\n'))
}
