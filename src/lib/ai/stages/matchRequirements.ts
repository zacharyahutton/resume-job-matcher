import type { JobExtraction, RequirementMatch, ResumeProfile } from '@/types'
import { callOpenAIJson, isAiAvailable, matchingSchema } from '@/lib/ai/client'
import { localMatch } from '@/lib/ai/localEngine'

/** Compare Job Model to Resume Model with evidence. */
export async function matchRequirements(
  job: JobExtraction,
  resume: ResumeProfile,
): Promise<RequirementMatch[]> {
  if (!(await isAiAvailable())) return localMatch(job, resume.rawText)

  try {
    const data = await callOpenAIJson<{
      matches: Array<{
        requirementId: string
        status: RequirementMatch['status']
        evidence: string
        reasoning: string
      }>
    }>({
      schemaName: 'requirement_matching',
      schema: matchingSchema,
      temperature: 0,
      maxTokens: 2800,
      system: [
        'Compare EACH job requirement to the resume carefully.',
        'Return one match object for every requirementId. Do not skip any.',
        'strong = clear proof on the resume. partial = related but unclear. missing = not supported. unclear = posting too vague.',
        'Quote or paraphrase real resume evidence. Prefer partial/missing over false strong.',
        'Write evidence and reasoning in plain coaching language.',
      ].join(' '),
      user: JSON.stringify({
        requirements: job.requirements,
        resumeProfile: {
          name: resume.name,
          summary: resume.summary,
          skills: resume.skills,
          tools: resume.tools,
          experience: resume.experience,
          projects: resume.projects,
          education: resume.education,
          certifications: resume.certifications,
        },
        resumeText: resume.rawText.slice(0, 8000),
      }).slice(0, 12000),
    })

    const byId = new Map(job.requirements.map((r) => [r.id, r]))
    const fromAi = data.matches
      .map((m) => {
        const requirement = byId.get(m.requirementId)
        if (!requirement) return null
        return {
          requirement,
          status: m.status,
          evidence: m.evidence,
          reasoning: m.reasoning,
        }
      })
      .filter(Boolean) as RequirementMatch[]

    const seen = new Set(fromAi.map((m) => m.requirement.id))
    const missing = job.requirements
      .filter((r) => !seen.has(r.id))
      .map((requirement) => ({
        requirement,
        status: 'unclear' as const,
        evidence: 'This item was not scored cleanly. Treat it carefully.',
        reasoning: 'Only claim it if you can prove it from real experience.',
      }))

    return [...fromAi, ...missing]
  } catch (err) {
    console.warn('[Fitline] match falling back to local', err)
    return localMatch(job, resume.rawText)
  }
}
