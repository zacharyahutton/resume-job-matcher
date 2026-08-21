import { Link } from 'react-router-dom'

export function TermsPage() {
  return (
    <div className="fitline-page">
      <div className="container" style={{ maxWidth: 760 }}>
        <div className="zubuz-section-title fl-enter" style={{ marginBottom: 28 }}>
          <h2>Terms of Service</h2>
          <p>Last updated {new Date().toLocaleDateString()}</p>
        </div>
        <div className="fitline-card fl-enter fl-enter-delay-1">
          <h3>What Fitline does</h3>
          <p>
            Fitline helps you compare a job posting to your existing resume and suggest truthful
            wording changes. It does not invent experience, employers, skills, or certifications.
          </p>
          <h3>Your responsibility</h3>
          <p>
            You are responsible for reviewing every tailored resume before you apply. Fit assessments
            are informational estimates, not hiring guarantees.
          </p>
          <h3>Acceptable use</h3>
          <p>
            Don’t use Fitline to fabricate qualifications or misrepresent your background. Don’t
            upload content you don’t have rights to process.
          </p>
          <h3>Availability</h3>
          <p>
            This product is provided as-is for personal use. Features, models, and availability may
            change without notice.
          </p>
          <p style={{ marginBottom: 0 }}>
            <Link to="/" style={{ color: 'var(--primary-color)', fontWeight: 600 }}>
              ← Back to home
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
