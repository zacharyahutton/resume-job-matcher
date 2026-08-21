export function PhoneMockup() {
  return (
    <div className="fitline-phone" aria-hidden="true">
      <div className="fitline-phone-frame">
        <div className="fitline-phone-screen">
          <div className="fitline-phone-status">
            <span>9:41</span>
            <span className="fitline-phone-status-mid">Fitline</span>
            <span>100%</span>
          </div>
          <div className="fitline-phone-header">
            <div className="fitline-phone-brand">
              <img src="/assets/images/logo/fitline-logo.svg" alt="" />
              Job Match
            </div>
            <div className="fitline-phone-score-row">
              <div className="fitline-phone-ring">
                <strong>84%</strong>
              </div>
              <div>
                <h4>Strong Fit</h4>
                <p>Frontend Engineer · Acme Labs. 7 of 10 core requirements matched</p>
              </div>
            </div>
          </div>
          <div className="fitline-phone-body">
            <div className="fitline-phone-card">
              <h5>Requirements</h5>
              <div className="fitline-phone-row">
                <span className="fitline-phone-ico ok">✓</span>
                <span>React + TypeScript</span>
                <span className="meta">Strong</span>
              </div>
              <div className="fitline-phone-row">
                <span className="fitline-phone-ico ok">✓</span>
                <span>REST APIs & Git</span>
                <span className="meta">Strong</span>
              </div>
              <div className="fitline-phone-row">
                <span className="fitline-phone-ico warn">!</span>
                <span>Team collaboration</span>
                <span className="meta">Partial</span>
              </div>
              <div className="fitline-phone-row">
                <span className="fitline-phone-ico bad">✕</span>
                <span>AWS experience</span>
                <span className="meta">Missing</span>
              </div>
            </div>

            <div className="fitline-phone-card fitline-phone-bars">
              <h5>Coverage</h5>
              <div className="bar">
                <span>Required skills</span>
                <div className="track">
                  <div className="fill green" />
                </div>
              </div>
              <div className="bar">
                <span>Preferred skills</span>
                <div className="track">
                  <div className="fill blue" />
                </div>
              </div>
            </div>

            <button type="button" className="fitline-phone-cta">
              Tailor Your Resume
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
