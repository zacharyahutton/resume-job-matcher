import type { AnalysisResult, FitLabel, MatchStatus, RenderMode, RequirementMatch } from '@/types'
import { Button } from '@/components/ui/Button'

function fitClass(label: FitLabel) {
  if (label === 'Strong Fit') return 'strong'
  if (label === 'Reasonable Fit') return 'reasonable'
  if (label === 'Stretch') return 'stretch'
  return 'weak'
}

function plainStatus(status: MatchStatus) {
  if (status === 'strong') return 'Covered'
  if (status === 'partial') return 'Needs a clearer line'
  if (status === 'missing') return 'Not on your resume'
  return 'Hard to tell'
}

function shortReq(text: string) {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= 72) return clean
  return `${clean.slice(0, 69).trim()}…`
}

/** Direct coaching line for each requirement, regardless of technical AI wording. */
function whatToDo(m: RequirementMatch): string {
  const tip = shortReq(m.requirement.text)
  if (m.status === 'strong') {
    return `Keep this easy to find. Your resume already backs it up.`
  }
  if (m.status === 'partial') {
    return `Tighten a real bullet so this reads clearly: “${tip}”. Use work you actually did. Do not invent it.`
  }
  if (m.status === 'missing') {
    return `Only add this if it is true. If you have real experience, write one concrete line. If you do not, leave it out.`
  }
  return `The posting is vague here. Skip guessing. Only mention it if you can prove it.`
}

function statusIcon(status: MatchStatus) {
  if (status === 'strong') return '✓'
  if (status === 'partial') return '!'
  if (status === 'missing') return '✕'
  return '?'
}

function verdictLine(label: FitLabel, score: number) {
  if (label === 'Strong Fit') {
    return `You are in good shape for this role (${score}%). Lead with what already matches.`
  }
  if (label === 'Reasonable Fit') {
    return `You can compete for this role (${score}%), but a few lines need to land harder.`
  }
  if (label === 'Stretch') {
    return `This is a stretch (${score}%). Be honest in applications, and only tailor what you can prove.`
  }
  return `This is a weak fit right now (${score}%). Do not force a match. Fix only what is true, or look at closer roles.`
}

interface Props {
  result: AnalysisResult
  generating?: boolean
  onGenerate: () => void
  onRefreshSuggestions?: () => void
  onDownloadPdf: () => void
  onDownloadDocx: () => void
  onRenderModeChange?: (mode: RenderMode) => void
}

export function AnalysisResults({
  result,
  generating,
  onGenerate,
  onRefreshSuggestions,
  onDownloadPdf,
  onDownloadDocx,
  onRenderModeChange,
}: Props) {
  const { fit, matches, tailoring, tailored, job, renderMode, warnings } = result

  const covered = matches.filter((m) => m.status === 'strong')
  const fixThese = matches.filter((m) => m.status === 'partial')
  const leaveOut = matches.filter((m) => m.status === 'missing' || m.status === 'unclear')
  const mode = renderMode || 'preserve'
  const noChange = tailoring.noChangeNeeded || []
  const mustFix = [...fixThese, ...leaveOut.filter((m) => m.requirement.priority !== 'preferred')]

  const roleLine = [job.title, job.company].filter(Boolean).join(' at ')

  return (
    <div>
      <div className="fitline-card fl-score-pop">
        <div className="fitline-score-hero">
          <div className="fitline-score-circle" style={{ ['--score' as string]: fit.score }}>
            <span>{fit.score}%</span>
          </div>
          <div>
            <div className={`fitline-fit-label ${fitClass(fit.label)}`}>{fit.label}</div>
            {roleLine ? <p style={{ marginBottom: 8, fontWeight: 600 }}>{roleLine}</p> : null}
            <p style={{ margin: 0, fontSize: 18 }}>{verdictLine(fit.label, fit.score)}</p>
          </div>
        </div>

        <p className="fitline-plain-summary">{fit.summary}</p>

        <div className="fitline-stats">
          <div className="fitline-stat">
            <strong>{covered.length}</strong>
            already covered
          </div>
          <div className="fitline-stat">
            <strong>{fixThese.length}</strong>
            need a clearer line
          </div>
          <div className="fitline-stat">
            <strong>{leaveOut.length}</strong>
            not on your resume
          </div>
        </div>
      </div>

      <div className="fitline-card">
        <h3 style={{ marginBottom: 8 }}>Would you be a fit?</h3>
        <div className="fitline-hear-grid">
          <div>
            <div className="fitline-hear-label good">Why you would</div>
            <ul className="fitline-simple-list" style={{ margin: 0 }}>
              {(fit.wouldBeFit?.length ? fit.wouldBeFit : [fit.whyFit]).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="fitline-hear-label gap">Why you would not</div>
            <ul className="fitline-simple-list" style={{ margin: 0 }}>
              {(fit.wouldNotBeFit?.length ? fit.wouldNotBeFit : [fit.gaps]).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="fitline-card">
        <h3 style={{ marginBottom: 8 }}>What you need to hear</h3>
        <div className="fitline-hear-grid">
          <div>
            <div className="fitline-hear-label good">What’s working</div>
            <p style={{ margin: 0 }}>{fit.whyFit}</p>
          </div>
          <div>
            <div className="fitline-hear-label gap">What is holding you back</div>
            <p style={{ margin: 0 }}>{fit.gaps}</p>
          </div>
        </div>
      </div>

      <div className="fitline-card">
        <h3 style={{ marginBottom: 8 }}>What to fix on your resume</h3>
        <p style={{ marginBottom: 20 }}>
          Do these adjustments next. Only use experience that is real.
        </p>
        {mustFix.length === 0 ? (
          <p style={{ margin: 0 }}>Nothing major to force. Polish wording, then download the tailored version.</p>
        ) : (
          <div>
            {mustFix.map((m) => (
              <div className="fitline-req" key={m.requirement.id}>
                <div className={`fitline-req-status ${m.status}`}>{statusIcon(m.status)}</div>
                <div>
                  <div className={`fitline-plain-pill ${m.status}`}>{plainStatus(m.status)}</div>
                  <h4 style={{ margin: '8px 0 10px' }}>{m.requirement.text}</h4>
                  <p className="fitline-action-line">{whatToDo(m)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {covered.length > 0 ? (
        <div className="fitline-card">
          <h3 style={{ marginBottom: 8 }}>Already covered</h3>
          <p style={{ marginBottom: 16 }}>Leave these visible. Do not bury them.</p>
          <ul className="fitline-simple-list">
            {covered.map((m) => (
              <li key={m.requirement.id}>{m.requirement.text}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="fitline-card fitline-disclosure">
        <summary>
          <span>
            <strong>Edits we will make</strong>
            <span className="fitline-disclosure-meta">
              {tailoring.changes.length
                ? `${tailoring.changes.length} change${tailoring.changes.length === 1 ? '' : 's'} · click to expand`
                : 'No wording changes yet · click to expand'}
            </span>
          </span>
        </summary>
        <div className="fitline-disclosure-body">
          <p style={{ marginBottom: 20 }}>
            Exact lines from your resume, rewritten for this job. Nothing invented. Your section order stays.
            Upload DOCX for an exact layout match. PDF rebuilds in classic resume style.
          </p>
          {tailoring.changes.length === 0 ? (
            <p>No wording changes suggested yet.</p>
          ) : (
            tailoring.changes.map((change, i) => (
              <div key={i} style={{ marginBottom: 24 }}>
                {change.section ? (
                  <div style={{ fontSize: 14, color: '#7b878c', marginBottom: 8 }}>
                    {change.section}
                    {change.action === 'trim' ? ' · trim' : ' · rewrite'}
                  </div>
                ) : null}
                <div className="fitline-change-grid">
                  <div className="fitline-change-box original">
                    <div className="fitline-change-label">Now</div>
                    <p style={{ margin: 0 }}>{change.original}</p>
                  </div>
                  <div className="fitline-change-box tailored">
                    <div className="fitline-change-label">Change to</div>
                    <p style={{ margin: 0 }}>{change.tailored}</p>
                  </div>
                </div>
                <p style={{ marginTop: 12, marginBottom: 0, fontSize: 16 }}>{change.why}</p>
              </div>
            ))
          )}
        </div>
      </details>

      <details className="fitline-card fitline-disclosure">
        <summary>
          <span>
            <strong>What we will not add</strong>
            <span className="fitline-disclosure-meta">
              {tailoring.notAdding.length
                ? `${tailoring.notAdding.length} item${tailoring.notAdding.length === 1 ? '' : 's'} · click to expand`
                : 'Nothing flagged · click to expand'}
            </span>
          </span>
        </summary>
        <div className="fitline-disclosure-body">
          <p style={{ marginBottom: 20 }}>
            The job asks for these, but your resume does not support them. We leave them out on purpose.
          </p>
          {tailoring.notAdding.length === 0 ? (
            <p style={{ margin: 0 }}>Nothing unsafe to invent showed up.</p>
          ) : (
            <ul className="fitline-simple-list">
              {tailoring.notAdding.map((item) => (
                <li key={item.item}>
                  <strong>{item.item}</strong>
                  {item.reason ? ` · ${item.reason}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      <details className="fitline-card fitline-disclosure">
        <summary>
          <span>
            <strong>What to remove or de-emphasize</strong>
            <span className="fitline-disclosure-meta">
              {(tailoring.toRemove?.length || 0)
                ? `${tailoring.toRemove.length} item${tailoring.toRemove.length === 1 ? '' : 's'} · click to expand`
                : 'Nothing flagged · click to expand'}
            </span>
          </span>
        </summary>
        <div className="fitline-disclosure-body">
          <p style={{ marginBottom: 20 }}>
            For this job, these themes hurt focus. Trim or bury them so the strong matches stay easy to find.
          </p>
          {!tailoring.toRemove?.length ? (
            <p style={{ margin: 0 }}>Nothing clear to cut for this posting.</p>
          ) : (
            <ul className="fitline-simple-list">
              {tailoring.toRemove.map((item) => (
                <li key={item.item}>
                  <strong>{item.item}</strong>
                  {item.reason ? ` · ${item.reason}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      <div className="fitline-card">
        <h3 style={{ marginBottom: 8 }}>Get your tailored resume</h3>
        <p style={{ marginBottom: 12 }}>
          Review the plan above first. Then rebuild. Intelligence is the same either way. Only the
          layout strategy changes.
        </p>
        <div className="fitline-tabs" style={{ marginBottom: 12 }} role="radiogroup">
          <button
            type="button"
            className={mode === 'preserve' ? 'is-active' : ''}
            disabled={generating}
            onClick={() => onRenderModeChange?.('preserve')}
          >
            Preserve My Layout
          </button>
          <button
            type="button"
            className={mode === 'optimize' ? 'is-active' : ''}
            disabled={generating}
            onClick={() => onRenderModeChange?.('optimize')}
          >
            Optimize My Resume
          </button>
        </div>
        <p style={{ marginBottom: 16, fontSize: 14, color: '#7b878c' }}>
          {mode === 'preserve'
            ? 'Same design, better wording. DOCX keeps your Word formatting. PDF keeps content and section order (exact PDF design cannot be cloned).'
            : 'Fitline classic layout filled only with your experience from this upload.'}
        </p>
        {warnings?.length ? (
          <ul className="fitline-simple-list" style={{ marginBottom: 16 }}>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
        {noChange.length ? (
          <div style={{ marginBottom: 16 }}>
            <strong>Already clear (no change needed)</strong>
            <ul className="fitline-simple-list" style={{ marginTop: 8 }}>
              {noChange.map((n) => (
                <li key={`${n.section}-${n.note}`}>
                  <strong>{n.section}</strong>
                  {n.note ? ` · ${n.note}` : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {tailored?.skippedChanges?.length ? (
          <p style={{ marginBottom: 16, fontSize: 14, color: '#7b878c' }}>
            {tailored.skippedChanges.length} proposed edit
            {tailored.skippedChanges.length === 1 ? '' : 's'} could not be applied to your file
            (line not found or unsafe). Those were skipped.
          </p>
        ) : null}
        <p style={{ marginBottom: 20 }}>
          {tailoring.changes.length
            ? `${tailoring.changes.length} content change${tailoring.changes.length === 1 ? '' : 's'} planned.`
            : 'No wording changes planned. You can still export in the selected mode.'}{' '}
          Rebuild downloads a PDF automatically.
        </p>
        <div className="fitline-actions">
          <Button disabled={generating} onClick={onGenerate}>
            {generating ? 'Rebuilding…' : 'Rebuild & download'}
          </Button>
          {onRefreshSuggestions ? (
            <Button secondary disabled={generating} onClick={onRefreshSuggestions}>
              Refresh plan
            </Button>
          ) : null}
          {tailored?.pdfBlob || tailored?.docxBlob ? (
            <>
              <Button secondary onClick={onDownloadPdf}>
                Download PDF
              </Button>
              <Button secondary onClick={onDownloadDocx}>
                Download DOCX
              </Button>
            </>
          ) : null}
        </div>
        {tailored?.builtAt ? (
          <p style={{ marginTop: 16, marginBottom: 0, color: '#15803d', fontSize: 16, fontWeight: 600 }}>
            Ready: {tailored.fileBaseName}.pdf / .docx
          </p>
        ) : (
          <p style={{ marginTop: 16, marginBottom: 0, color: '#7b878c', fontSize: 16 }}>
            Plan ready. Click Rebuild & download when you want the files.
          </p>
        )}
      </div>
    </div>
  )
}
