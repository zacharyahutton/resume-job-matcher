export type JobInputLikelyKind =
  | 'job'
  | 'requirements_list'
  | 'resume'
  | 'cover_letter'
  | 'unrelated'
  | 'too_short'

export interface JobInputCheck {
  ok: boolean
  kind: JobInputLikelyKind
  /** 0 to 1, how sure we are it is job-related */
  score: number
  /** Short message safe to show in the UI */
  message: string
}

const JOB_SIGNALS: Array<{ re: RegExp; w: number }> = [
  { re: /\b(job\s+description|about\s+the\s+role|the\s+role|position\s+overview)\b/i, w: 3 },
  { re: /\b(responsibilities|requirements|qualifications|what\s+you.?ll\s+do)\b/i, w: 3 },
  { re: /\b(must\s+have|required|nice\s+to\s+have|preferred|bonus\s+points)\b/i, w: 2 },
  { re: /\b(years?\s+of\s+experience|\d+\+?\s*years?|minimum\s+of\s+\d+)\b/i, w: 2 },
  { re: /\b(we\s+are\s+looking|looking\s+for|you\s+will|you.?ll\s+be)\b/i, w: 2 },
  { re: /\b(full[- ]time|part[- ]time|remote|hybrid|on[- ]site|salary|compensation)\b/i, w: 1.5 },
  { re: /\b(apply|application|equal\s+opportunity|benefits|reports?\s+to)\b/i, w: 1.5 },
  {
    re: /\b(software\s+engineer|frontend|backend|full[- ]stack|product\s+manager|data\s+scientist|designer|analyst|developer|intern)\b/i,
    w: 1.5,
  },
  { re: /\b(proficien[ct]|familiar\s+with|experience\s+with|strong\s+knowledge)\b/i, w: 1.5 },
]

const RESUME_SIGNALS: Array<{ re: RegExp; w: number }> = [
  { re: /\b(professional\s+summary|selected\s+projects|technical\s+skills)\b/i, w: 4 },
  { re: /\b(dean.?s\s+list|gpa\s*:?\s*\d|references\s+available)\b/i, w: 3 },
  { re: /\b(linkedin\.com\/in\/|github\.com\/[a-z0-9_-]+)\b/i, w: 2.5 },
  { re: /\b(education|achievements|certifications)\b/i, w: 1.5 },
]

const COVER_SIGNALS: Array<{ re: RegExp; w: number }> = [
  { re: /\b(dear\s+(hiring|sir|madam|recruiter)|to\s+whom\s+it\s+may\s+concern)\b/i, w: 4 },
  { re: /\b(i\s+am\s+writing\s+to\s+apply|cover\s+letter|thank\s+you\s+for\s+your\s+consideration)\b/i, w: 4 },
  { re: /\b(i\s+would\s+be\s+a\s+great\s+fit|my\s+resume\s+is\s+attached)\b/i, w: 3 },
]

function countHits(text: string, signals: Array<{ re: RegExp; w: number }>): number {
  let score = 0
  for (const { re, w } of signals) {
    if (re.test(text)) score += w
  }
  return score
}

function looksLikeBulletList(text: string): boolean {
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length < 3) return false
  const bulletish = lines.filter(
    (l) =>
      /^[-•*●▪+]/.test(l) ||
      /^\d+[.)]/.test(l) ||
      (l.length < 90 && /experience|react|typescript|python|api|aws|sql|years?/i.test(l)),
  )
  return bulletish.length >= Math.min(3, Math.ceil(lines.length * 0.5))
}

/**
 * Decide whether pasted/typed/OCR text is actually a job description or
 * requirements list, vs a resume, cover letter, or unrelated text.
 */
export function assessJobInput(
  raw: string,
  opts?: { mode?: 'paste' | 'type' | 'image' },
): JobInputCheck {
  const text = (raw || '').replace(/\u00a0/g, ' ').trim()
  const mode = opts?.mode || 'paste'
  const minChars = mode === 'type' ? 12 : 40

  if (text.length < minChars) {
    return {
      ok: false,
      kind: 'too_short',
      score: 0,
      message:
        mode === 'type'
          ? 'Add a few more requirements (one per line) so we have something to match.'
          : 'That is too short to be a job description. Paste the full posting or a longer requirements list.',
    }
  }

  const jobScore = countHits(text, JOB_SIGNALS)
  const resumeScore = countHits(text, RESUME_SIGNALS)
  const coverScore = countHits(text, COVER_SIGNALS)
  const bulletList = looksLikeBulletList(text)

  // Typed short skill lists are intentionally thin on JD prose.
  if (mode === 'type' && bulletList && coverScore < 3 && resumeScore < 5) {
    return {
      ok: true,
      kind: 'requirements_list',
      score: 0.75,
      message: 'Looks like a requirements list.',
    }
  }

  if (coverScore >= 3 && coverScore >= jobScore) {
    return {
      ok: false,
      kind: 'cover_letter',
      score: 0.15,
      message:
        'This looks like a cover letter, not a job description. Paste the job posting or the role requirements instead.',
    }
  }

  if (resumeScore >= 4 && resumeScore > jobScore + 1) {
    return {
      ok: false,
      kind: 'resume',
      score: 0.2,
      message:
        'This looks like a resume, not a job description. Upload your resume in step 1, and paste the job posting here.',
    }
  }

  let score = Math.min(1, (jobScore + (bulletList ? 2 : 0)) / 10)

  // Image OCR can be messy; be slightly more forgiving if there are any job cues.
  if (mode === 'image' && jobScore >= 2) {
    score = Math.max(score, 0.55)
  }

  if (score >= 0.35 || (bulletList && jobScore >= 1) || (mode === 'type' && bulletList)) {
    return {
      ok: true,
      kind: bulletList && jobScore < 3 ? 'requirements_list' : 'job',
      score: Math.max(score, 0.45),
      message: 'Looks like a job description.',
    }
  }

  // Strong negative: long prose with zero job vocabulary
  if (text.length > 180 && jobScore === 0 && !bulletList) {
    return {
      ok: false,
      kind: 'unrelated',
      score: 0.1,
      message:
        'This does not look like a job description or requirements list. Paste the role posting (responsibilities, requirements, qualifications) so we can tailor your resume.',
    }
  }

  if (jobScore === 0 && !bulletList) {
    return {
      ok: false,
      kind: 'unrelated',
      score: 0.15,
      message:
        'We could not tell this is a job posting. Include the role title, requirements, or a short list of skills they want.',
    }
  }

  return {
    ok: true,
    kind: 'job',
    score: Math.max(score, 0.4),
    message: 'Looks usable as job input.',
  }
}

/** Throw a user-facing Error when input is not job-related. */
export function assertJobInput(raw: string, mode?: 'paste' | 'type' | 'image'): void {
  const check = assessJobInput(raw, { mode })
  if (!check.ok) throw new Error(check.message)
}
