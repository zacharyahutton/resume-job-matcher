import type {
  FitAssessment,
  JobExtraction,
  JobRequirement,
  RequirementMatch,
  ResumeProfile,
  TailoringPlan,
  TailoredResume,
} from '@/types'
import { applyChangesToOriginalText, sectionsFromPreservedText } from '@/lib/preserveFormat'

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9+#.\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((t) => t.length > 1)
}

const SKILL_PATTERNS = [
  'react',
  'typescript',
  'javascript',
  'node',
  'python',
  'java',
  'aws',
  'azure',
  'gcp',
  'docker',
  'kubernetes',
  'sql',
  'postgres',
  'mongodb',
  'graphql',
  'rest',
  'api',
  'git',
  'ci/cd',
  'agile',
  'scrum',
  'figma',
  'tailwind',
  'next.js',
  'vue',
  'angular',
  'csharp',
  'c#',
  '.net',
  'go',
  'rust',
  'linux',
  'html',
  'css',
  'sass',
  'redux',
  'jest',
  'cypress',
  'terraform',
  'kafka',
  'redis',
  'spark',
  'machine learning',
  'llm',
  'communication',
  'leadership',
  'collaboration',
  'team',
]

function extractSkillsFromText(text: string): string[] {
  const n = normalize(text)
  return SKILL_PATTERNS.filter((s) => n.includes(s)).map((s) =>
    s
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' '),
  )
}

function splitBullets(text: string): string[] {
  return text
    .split(/\n/)
    .map((l) => l.replace(/^[\s•●▪+\-–—*]+/, '').trim())
    .filter((l) => l.length > 40)
    .filter((l) => !isProtectedResumeLine(l))
    .filter((l) => /[a-z]/.test(l)) // must have lowercase = body sentence, not a header
    .slice(0, 40)
}

function isProtectedResumeLine(line: string): boolean {
  const t = line.trim()
  if (!t) return true
  if (/@|https?:\/\/|www\.|\.com|\.net|\.online|linkedin|github|portfolio/i.test(t)) return true
  if (/\|/.test(t) && /@|\d{3}/.test(t)) return true
  if (/^(EXPERIENCE|EDUCATION|SKILLS|SUMMARY|PROJECTS|TECHNICAL|ACHIEVEMENTS|SELECTED)/i.test(t)) {
    return true
  }
  if (t === t.toUpperCase() && t.length < 60) return true
  return false
}

export function localTailor(
  resumeText: string,
  job: JobExtraction,
  matches: RequirementMatch[],
): { plan: TailoringPlan; tailored: TailoredResume } {
  const missing = matches.filter((m) => m.status === 'missing')
  const partial = matches.filter((m) => m.status === 'partial' || m.status === 'strong')
  const resumeN = normalize(resumeText)

  const focusRaw =
    job.title?.trim() ||
    partial[0]?.requirement.text.split(/[,.(]/)[0]?.trim() ||
    'this role'
  const focus = focusRaw.replace(/[«»"']/g, '').slice(0, 48)

  // JD keywords that already appear somewhere on the resume (honest only)
  const jdKeywords = Array.from(
    new Set(
      partial
        .flatMap((m) => {
          const phrase = m.requirement.text
          const skills = SKILL_PATTERNS.filter((s) => normalize(phrase).includes(s))
          const words = tokenize(phrase).filter(
            (t) =>
              t.length > 3 &&
              !['with', 'from', 'that', 'this', 'have', 'will', 'your', 'their', 'about', 'using'].includes(
                t,
              ),
          )
          return [...skills, ...words]
        })
        .map((k) => k.trim())
        .filter((k) => k.length > 2 && resumeN.includes(normalize(k))),
    ),
  ).slice(0, 24)

  const bullets = splitBullets(resumeText)
  const changes: Array<{
    original: string
    tailored: string
    why: string
    section: string
    action: 'rewrite' | 'trim'
  }> = []

  for (const original of bullets) {
    if (changes.length >= 12) break
    const rewritten = rewriteBulletForJob(original, jdKeywords, focus)
    if (!rewritten) continue
    changes.push({
      original,
      tailored: rewritten,
      why: `Rewrote this line to lead with skills and language that match ${focus}, using only experience already on your resume.`,
      section: 'Experience',
      action: 'rewrite',
    })
  }

  // Trim a couple of long unrelated bullets if we have keywords to judge against
  if (jdKeywords.length && changes.length < 10) {
    for (const original of bullets) {
      if (changes.length >= 14) break
      if (changes.some((c) => c.original === original)) continue
      const hitCount = jdKeywords.filter((k) => normalize(original).includes(normalize(k))).length
      if (hitCount === 0 && original.length > 110) {
        const trimmed = trimOffTargetBullet(original)
        if (trimmed && trimmed !== original) {
          changes.push({
            original,
            tailored: trimmed,
            why: `Shortened this line because it does not help for ${focus}.`,
            section: 'Experience',
            action: 'trim',
          })
        }
      }
    }
  }

  const notAdding = missing.slice(0, 8).map((m) => ({
    item: m.requirement.text.split(/[,.(]/)[0].trim(),
    reason: 'Not on your resume, so we will not invent it.',
  }))

  const fullText = applyChangesToOriginalText(resumeText, changes)

  return {
    plan: {
      changes,
      notAdding,
      toRemove: missing.slice(0, 4).map((m) => ({
        item: m.requirement.text.split(/[,.(]/)[0].trim(),
        reason: 'Not supported on your resume for this application. Do not force it into the document.',
      })),
      emphasisNotes: [
        'Same resume structure and section order.',
        'Bullets were rewritten to mirror the job language where your experience already supports it.',
        'Nothing unsupported was added.',
      ],
    },
    tailored: {
      fullText,
      fileBaseName: 'Resume_Tailored',
      sections: sectionsFromPreservedText(fullText),
      formatPreserved: true,
      appliedChanges: changes,
    },
  }
}

/** Rewrite a bullet to lead with overlapping JD keywords already present in the line or weave nearby stack terms already in the line. */
function rewriteBulletForJob(original: string, jdKeywords: string[], focus: string): string | null {
  const cleaned = original.replace(/\s+/g, ' ').trim()
  const n = normalize(cleaned)
  const hits = jdKeywords.filter((k) => n.includes(normalize(k))).slice(0, 4)
  if (!hits.length) return null

  // Already leads with the key tech/phrase → still force a clearer JD-facing rewrite
  const hitLabel = formatKeywordList(hits)
  let next = cleaned

  // Swap vague "software/applications/features" for the matched stack when present in the line
  if (/\b(software|applications?|features?|systems?|platforms?|tools?)\b/i.test(next) && hits.length) {
    next = next.replace(
      /\b(production\s+)?(software|applications?|features?|systems?|platforms?)\b/i,
      (_m, prod) => `${prod || ''}${hitLabel}`.replace(/\s+/g, ' ').trim(),
    )
  }

  // If still almost identical, rebuild the opening clause
  if (isNearlySame(cleaned, next)) {
    const rest = cleaned.replace(/^[-•\u2022▪\s]+/, '')
    const action = rest.match(
      /^(Built|Developed|Created|Designed|Led|Managed|Shipped|Implemented|Improved|Delivered|Wrote|Maintained|Owned|Supported)\b/i,
    )?.[1]
    if (action) {
      const afterAction = rest.slice(action.length).replace(/^[\s,:-]+/, '')
      next = `${action} ${hitLabel} ${afterAction}`.replace(/\s+/g, ' ').trim()
      // Avoid duplicated tech if afterAction already starts with it
      for (const h of hits) {
        const re = new RegExp(`\\b${escapeRegExp(h)}\\b[\\s,]*${escapeRegExp(h)}\\b`, 'i')
        next = next.replace(re, h)
      }
    } else {
      next = `${rest} using ${hitLabel}`.replace(/\s+/g, ' ').trim()
    }
  }

  if (!/[.!?]$/.test(next)) next += '.'
  if (isNearlySame(cleaned, next)) return null
  // Keep length sane
  if (next.length > cleaned.length * 1.85 + 30) {
    next = next.slice(0, Math.floor(cleaned.length * 1.6)).replace(/\s+\S*$/, '') + '.'
  }
  void focus
  return next
}

function trimOffTargetBullet(original: string): string | null {
  const cleaned = original.replace(/\s+/g, ' ').trim()
  if (cleaned.length < 90) return null
  const cut = cleaned.slice(0, 88).replace(/\s+\S*$/, '')
  if (cut.length < 40) return null
  return `${cut}.`
}

function formatKeywordList(hits: string[]): string {
  const pretty = hits.map((h) =>
    h.length <= 3 ? h.toUpperCase() : h.charAt(0).toUpperCase() + h.slice(1),
  )
  if (pretty.length === 1) return pretty[0]
  if (pretty.length === 2) return `${pretty[0]} and ${pretty[1]}`
  return `${pretty.slice(0, -1).join(', ')}, and ${pretty[pretty.length - 1]}`
}

function isNearlySame(a: string, b: string): boolean {
  const strip = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#.]/g, '')
  return strip(a) === strip(b)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function localExtractResume(rawText: string): ResumeProfile {
  const lines = rawText
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const name = lines[0]?.length < 60 ? lines[0] : undefined
  const skills = extractSkillsFromText(rawText)
  const bullets = splitBullets(rawText)

  return {
    rawText,
    name,
    summary: bullets[0],
    skills,
    experience: [
      {
        title: 'Experience (from resume)',
        company: 'As listed',
        bullets: bullets.slice(0, 12),
      },
    ],
    projects: [],
    education: [],
    certifications: [],
    tools: skills.filter((s) =>
      ['Git', 'Docker', 'Aws', 'Figma', 'Jest', 'Cypress'].includes(s),
    ),
  }
}

export function localExtractJob(rawText: string): JobExtraction {
  const lines = rawText
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 2)

  const titleCandidate = lines.find(
    (l) =>
      l.length < 80 &&
      /engineer|developer|designer|manager|analyst|specialist|lead|intern|internship/i.test(l) &&
      !/this internship will|we are looking|about the role|responsibilities/i.test(l),
  )
  const title = titleCandidate || lines.find((l) => l.length < 60) || lines[0]

  const requirements: JobRequirement[] = []
  const seen = new Set<string>()

  const bulletLike = lines.filter(
    (l) =>
      /^[-•*●▪]/.test(l) ||
      /^\d+[.)]/.test(l) ||
      /required|must|prefer|experience|proficien|familiar/i.test(l),
  )

  const candidates = (bulletLike.length >= 3 ? bulletLike : lines).slice(0, 25)

  candidates.forEach((text, i) => {
    const cleaned = text.replace(/^[-•*●▪\d.)\s]+/, '').trim()
    if (cleaned.length < 8) return
    const key = normalize(cleaned).slice(0, 80)
    if (seen.has(key)) return
    seen.add(key)

    const preferred = /prefer|nice to have|bonus|plus/i.test(cleaned)
    const required = /required|must|mandatory|minimum/i.test(cleaned) || !preferred

    let category: JobRequirement['category'] = 'other'
    if (/year|yrs?\b/i.test(cleaned)) category = 'years_experience'
    else if (/degree|bachelor|master|phd|education/i.test(cleaned)) category = 'education'
    else if (/certif/i.test(cleaned)) category = 'certification'
    else if (/team|collaborat|communicat/i.test(cleaned)) category = 'collaboration'
    else if (/aws|docker|kubernetes|sql|api|cloud|linux/i.test(cleaned)) category = 'technical'
    else if (preferred) category = 'preferred_skill'
    else if (/experience|proficien|knowledge|skill/i.test(cleaned)) category = 'skill'
    else if (/responsib|will |you will|own /i.test(cleaned)) category = 'responsibility'

    requirements.push({
      id: `req-${i + 1}`,
      text: cleaned,
      category,
      priority: preferred ? 'preferred' : required ? 'required' : 'unspecified',
    })
  })

  // Ensure skill tokens appear as requirements if list is thin
  if (requirements.length < 5) {
    extractSkillsFromText(rawText).forEach((skill, i) => {
      requirements.push({
        id: `skill-${i + 1}`,
        text: skill,
        category: 'skill',
        priority: 'required',
      })
    })
  }

  return {
    title,
    company: undefined,
    rawText,
    requirements: requirements.slice(0, 18),
  }
}

function scoreRequirement(req: JobRequirement, resumeText: string): RequirementMatch {
  const resumeN = normalize(resumeText)
  const reqTokens = tokenize(req.text).filter((t) => t.length > 2)
  const meaningful = reqTokens.filter(
    (t) => !['and', 'the', 'with', 'for', 'you', 'our', 'will', 'have', 'ability', 'strong'].includes(t),
  )

  const hits = meaningful.filter((t) => resumeN.includes(t))
  const ratio = meaningful.length ? hits.length / meaningful.length : 0

  // Direct skill phrase check
  const skillHits = SKILL_PATTERNS.filter(
    (s) => normalize(req.text).includes(s) && resumeN.includes(s),
  )

  let status: RequirementMatch['status'] = 'missing'
  let evidence = 'This is not on your resume right now.'
  let reasoning =
    'Only add it if it is true. If you have real experience, write one concrete line. If not, leave it out.'

  if (skillHits.length > 0 || ratio >= 0.55) {
    status = 'strong'
    evidence = skillHits.length
      ? `Your resume already shows this (${skillHits.join(', ')}).`
      : `Your resume already covers this (${hits.slice(0, 5).join(', ')}).`
    reasoning = 'Keep this easy to find. Do not bury it.'
  } else if (ratio >= 0.28 || hits.length >= 2) {
    status = 'partial'
    evidence = `You are close, but it is not clear enough yet${hits.length ? ` (${hits.slice(0, 4).join(', ')})` : ''}.`
    reasoning =
      'Rewrite a real bullet so this requirement is obvious. Use work you actually did.'
  } else if (meaningful.length <= 2 && hits.length === 0) {
    status = 'unclear'
    evidence = 'The posting is too vague to judge cleanly.'
    reasoning = 'Do not guess. Only mention it if you can prove it.'
  }

  return { requirement: req, status, evidence, reasoning }
}

export function localMatch(
  job: JobExtraction,
  resumeText: string,
): RequirementMatch[] {
  return job.requirements.map((req) => scoreRequirement(req, resumeText))
}

export function localAssessFit(matches: RequirementMatch[]): FitAssessment {
  const required = matches.filter((m) => m.requirement.priority !== 'preferred')
  const preferred = matches.filter((m) => m.requirement.priority === 'preferred')

  const count = (list: RequirementMatch[], status: RequirementMatch['status']) =>
    list.filter((m) => m.status === status).length

  const requiredMatched = count(required, 'strong')
  const requiredPartial = count(required, 'partial')
  const requiredMissing = count(required, 'missing') + count(required, 'unclear')
  const preferredMatched = count(preferred, 'strong')
  const preferredPartial = count(preferred, 'partial')
  const preferredMissing = count(preferred, 'missing') + count(preferred, 'unclear')

  const requiredDenom = Math.max(required.length, 1)
  const score = Math.round(
    ((requiredMatched + requiredPartial * 0.45) / requiredDenom) * 100 -
      requiredMissing * 4 +
      preferredMatched * 2,
  )
  const clamped = Math.max(8, Math.min(96, score))

  let label: FitAssessment['label'] = 'Weak Fit'
  if (clamped >= 80 && requiredMissing <= 1) label = 'Strong Fit'
  else if (clamped >= 62 && requiredMissing <= 3) label = 'Reasonable Fit'
  else if (clamped >= 40) label = 'Stretch'
  else label = 'Weak Fit'

  const strongNames = matches
    .filter((m) => m.status === 'strong')
    .slice(0, 4)
    .map((m) => m.requirement.text.split(/[,.(]/)[0].trim())
  const missingNames = matches
    .filter((m) => m.status === 'missing')
    .slice(0, 3)
    .map((m) => m.requirement.text.split(/[,.(]/)[0].trim())

  const summary =
    label === 'Strong Fit'
      ? `You meet most of what this role asks for. Lean on ${strongNames.join(', ') || 'your strongest experience'}.${missingNames.length ? ` Still thin on: ${missingNames.join(', ')}.` : ''}`
      : label === 'Reasonable Fit'
        ? `You can compete here. ${requiredMatched} core items look solid${requiredPartial ? `, and ${requiredPartial} need clearer wording` : ''}.${preferredMissing ? ' Nice-to-haves can wait.' : ''}`
        : label === 'Stretch'
          ? `This is a stretch. Several must-haves are weak or missing${missingNames.length ? `, especially ${missingNames.join(', ')}` : ''}. Only tailor what you can prove.`
          : `Right now this is a weak fit. Too many must-haves are missing from your resume. Do not invent them.`

  return {
    score: clamped,
    label,
    summary: summary.trim(),
    whyFit:
      strongNames.length > 0
        ? `You already look credible on: ${strongNames.join(', ')}.`
        : 'Your resume does not clearly hit the main asks yet.',
    gaps:
      missingNames.length > 0
        ? `Biggest gaps: ${missingNames.join(', ')}. Fix only what is true. Skip the rest.`
        : 'No hard blockers stood out, but preferred items may still be soft.',
    wouldBeFit: strongNames.length
      ? strongNames.map((n) => `You can honestly claim strength in ${n}.`)
      : ['Your strongest lines still need to map more clearly to this posting.'],
    wouldNotBeFit: missingNames.length
      ? missingNames.map((n) => `They want ${n}, and it is not clear on your resume.`)
      : ['No major blockers, but preferred items may still be soft.'],
    requiredMatched,
    requiredPartial,
    requiredMissing,
    preferredMatched,
    preferredPartial,
    preferredMissing,
  }
}
