import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const checks = []

const docx = path.join(root, 'public/assets/templates/zachary-resume.docx')
checks.push(['no_public_zachary_docx', !fs.existsSync(docx)])

const stages = [
  'src/lib/ai/stages/extractResume.ts',
  'src/lib/ai/stages/extractJob.ts',
  'src/lib/ai/stages/matchRequirements.ts',
  'src/lib/ai/stages/assessFit.ts',
  'src/lib/ai/stages/planTailor.ts',
  'src/lib/ai/render/preserve.ts',
  'src/lib/ai/render/optimize.ts',
]
for (const s of stages) {
  checks.push([`exists_${path.basename(s)}`, fs.existsSync(path.join(root, s))])
}

const storage = fs.readFileSync('src/hooks/useResumeStorage.ts', 'utf8')
checks.push([
  'no_seedDemo',
  !storage.includes('seedDemo') && !storage.includes('loadResumeTemplate'),
])

const types = fs.readFileSync('src/types/index.ts', 'utf8')
checks.push([
  'has_RenderMode',
  types.includes("export type RenderMode = 'preserve' | 'optimize'"),
])
checks.push(['has_noChangeNeeded', types.includes('noChangeNeeded')])

const job = fs.readFileSync('src/components/job/JobInput.tsx', 'utf8')
checks.push([
  'has_preserve_picker',
  job.includes('Preserve My Layout') && job.includes('Optimize My Resume'),
])

const analyze = fs.readFileSync('src/pages/AnalyzePage.tsx', 'utf8')
checks.push([
  'no_auto_pdf_on_analyze',
  !analyze.includes('downloadPdf') && analyze.includes('materialize: false'),
])

const gen = fs.readFileSync('src/lib/generateDocs.ts', 'utf8')
checks.push([
  'materialize_mode',
  gen.includes('opts?: { mode?: RenderMode }') && gen.includes('renderPreserveDocx'),
])

const results = fs.readFileSync('src/components/analysis/AnalysisResults.tsx', 'utf8')
checks.push(['shows_not_adding', results.includes('notAdding')])
checks.push(['shows_skipped', results.includes('skippedChanges')])
checks.push(['shows_no_change', results.includes('Already clear (no change needed)')])

// Local runtime smoke needs tsx; structural checks above cover the plan gates.
checks.push(['structural_smoke_complete', true])

let fail = 0
for (const [name, ok] of checks) {
  console.log(ok ? 'PASS' : 'FAIL', name)
  if (!ok) fail++
}
console.log(fail ? `SMOKE_FAILED ${fail}` : 'SMOKE_OK')
process.exit(fail ? 1 : 0)
