import { Link } from 'react-router-dom'

export function PrivacyPage() {
  return (
    <div className="fitline-page">
      <div className="container" style={{ maxWidth: 760 }}>
        <div className="zubuz-section-title fl-enter" style={{ marginBottom: 28 }}>
          <h2>Privacy Policy</h2>
          <p>Last updated {new Date().toLocaleDateString()}</p>
        </div>
        <div className="fitline-card fl-enter fl-enter-delay-1">
          <h3>Your resume stays on your device</h3>
          <p>
            Fitline stores your resume file and extracted text in your browser (IndexedDB). We do not
            require an account, and we do not permanently host your resume on our servers for this
            MVP.
          </p>
          <h3>Analysis requests</h3>
          <p>
            When you analyze a job, resume text and job text may be sent to our AI provider (Groq) to
            generate a fit assessment and tailored suggestions. Do not submit sensitive personal data
            you are not comfortable sharing with that provider.
          </p>
          <h3>Contact</h3>
          <p>
            Questions about this policy? Reach out to Zachary via the project contact you already use.
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
