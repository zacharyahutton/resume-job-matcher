import type { ResumeProfile } from '@/types'
import { callOpenAIJson, resumeProfileSchema } from '@/lib/ai/client'
import { localExtractResume } from '@/lib/ai/localEngine'
import { getApiKey } from '@/lib/storage'

function nullToUndef<T>(v: T | null | undefined): T | undefined {
  return v == null ? undefined : v
}

/** Full resume → Canonical Resume Model (Groq + local fallback). */
export async function extractResumeProfile(rawText: string): Promise<ResumeProfile> {
  if (!getApiKey()) return localExtractResume(rawText)

  try {
    const data = await callOpenAIJson<{
      name: string | null
      contact: {
        email: string | null
        phone: string | null
        location: string | null
        links: string[]
      }
      summary: string | null
      skills: string[]
      experience: Array<{
        id: string
        title: string
        company: string
        dates: string | null
        bullets: string[]
        technologies: string[]
      }>
      projects: Array<{
        id: string
        name: string
        description: string
        technologies: string[]
        bullets: string[]
      }>
      education: Array<{
        id: string
        school: string
        degree: string | null
        dates: string | null
      }>
      certifications: string[]
      tools: string[]
      otherSections: Array<{ heading: string; content: string }>
      extractionNotes: string[]
    }>({
      schemaName: 'resume_profile',
      schema: resumeProfileSchema,
      temperature: 0,
      maxTokens: 10000,
      system: [
        'Build a thorough Canonical Resume Model from the FULL resume text.',
        'Extract contact, summary, every role with every bullet, projects, education, skills, tools, certifications, and other sections.',
        'Copy bullet and summary wording closely so later edits can find exact strings in the original.',
        'List technologies only when they appear in that entry or nearby text. Never invent.',
        'Ids like exp-1, proj-1, edu-1. extractionNotes for unclear parsing only.',
        'Thorough enough for good decisions, not a bloated schema dump.',
      ].join(' '),
      user: `Resume text (understand everything present):\n\n${rawText.slice(0, 24000)}`,
    })

    return {
      rawText,
      name: nullToUndef(data.name),
      contact: {
        email: nullToUndef(data.contact?.email),
        phone: nullToUndef(data.contact?.phone),
        location: nullToUndef(data.contact?.location),
        links: data.contact?.links || [],
      },
      summary: nullToUndef(data.summary),
      skills: data.skills || [],
      experience: (data.experience || []).map((e) => ({
        id: e.id,
        title: e.title,
        company: e.company,
        dates: nullToUndef(e.dates),
        bullets: e.bullets || [],
        technologies: e.technologies || [],
      })),
      projects: (data.projects || []).map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        technologies: p.technologies || [],
        bullets: p.bullets || [],
      })),
      education: (data.education || []).map((e) => ({
        id: e.id,
        school: e.school,
        degree: nullToUndef(e.degree),
        dates: nullToUndef(e.dates),
      })),
      certifications: data.certifications || [],
      tools: data.tools || [],
      otherSections: data.otherSections || [],
      extractionNotes: data.extractionNotes || [],
    }
  } catch {
    return localExtractResume(rawText)
  }
}
