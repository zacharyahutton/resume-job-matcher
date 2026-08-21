import type { FitAssessment, JobExtraction, RequirementMatch, ResumeProfile } from '@/types'
import { callOpenAIJson, fitSchema } from '@/lib/ai/client'
import { localAssessFit } from '@/lib/ai/localEngine'
import { getApiKeys } from '@/lib/storage'

function withCounts(
  fit: Omit<
    FitAssessment,
    | 'requiredMatched'
    | 'requiredPartial'
    | 'requiredMissing'
    | 'preferredMatched'
    | 'preferredPartial'
    | 'preferredMissing'
  >,
  matches: RequirementMatch[],
): FitAssessment {
  const required = matches.filter((m) => m.requirement.priority !== 'preferred')
  const preferred = matches.filter((m) => m.requirement.priority === 'preferred')
  const c = (list: RequirementMatch[], s: RequirementMatch['status']) =>
    list.filter((m) => m.status === s).length

  return {
    ...fit,
    wouldBeFit: fit.wouldBeFit?.length ? fit.wouldBeFit : [fit.whyFit].filter(Boolean),
    wouldNotBeFit: fit.wouldNotBeFit?.length ? fit.wouldNotBeFit : [fit.gaps].filter(Boolean),
    requiredMatched: c(required, 'strong'),
    requiredPartial: c(required, 'partial'),
    requiredMissing: c(required, 'missing') + c(required, 'unclear'),
    preferredMatched: c(preferred, 'strong'),
    preferredPartial: c(preferred, 'partial'),
    preferredMissing: c(preferred, 'missing') + c(preferred, 'unclear'),
  }
}

/** Honest fit assessment. Required gaps weigh more than preferred. */
export async function assessFit(
  job: JobExtraction,
  matches: RequirementMatch[],
  resume: ResumeProfile,
): Promise<FitAssessment> {
  if (!getApiKeys().length) return localAssessFit(matches)

  try {
    const data = await callOpenAIJson<{
      score: number
      label: FitAssessment['label']
      summary: string
      whyFit: string
      gaps: string
      wouldBeFit: string[]
      wouldNotBeFit: string[]
    }>({
      schemaName: 'fit_assessment',
      schema: fitSchema,
      temperature: 0.1,
      maxTokens: 2500,
      system: [
        'Write an honest interview-fit assessment after reviewing every match.',
        'wouldBeFit: 3 to 6 concrete reasons they WOULD be a fit / get an interview, grounded in strong matches.',
        'wouldNotBeFit: 3 to 6 concrete reasons they would struggle or NOT be a fit, grounded in missing/partial must-haves.',
        'summary, whyFit, and gaps must be plain and direct. No jargon.',
        'Missing preferred items weigh less than missing required ones.',
        'Never encourage fabricating qualifications. Score 0-100.',
      ].join(' '),
      user: JSON.stringify({
        jobTitle: job.title,
        company: job.company,
        candidateName: resume.name,
        matches: matches.map((m) => ({
          id: m.requirement.id,
          text: m.requirement.text,
          priority: m.requirement.priority,
          status: m.status,
          evidence: m.evidence,
          reasoning: m.reasoning,
        })),
      }).slice(0, 10000),
    })

    return withCounts(data, matches)
  } catch (err) {
    if (err instanceof Error && err.name === 'GroqUserError') throw err
    return localAssessFit(matches)
  }
}
