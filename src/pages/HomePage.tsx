import { useState } from 'react'
import { Link } from 'react-router-dom'
import { HeroVisual } from '../components/hero/HeroVisual'
import { HowItWorksDemo } from '../components/demo/HowItWorksDemo'

export function HomePage() {
  const [demoOpen, setDemoOpen] = useState(false)

  return (
    <>
      <HowItWorksDemo open={demoOpen} onClose={() => setDemoOpen(false)} />

      <div
        className="zubuz-hero-section"
        style={{ backgroundImage: 'url(/assets/images/v1/hero-shape1.png)' }}
      >
        <div className="container">
          <div className="zubuz-hero-content center position-relative">
            <h1 className="wow fadeInUpX animated" style={{ animationDelay: '0s' }}>
              Get the interview for the job you want.
            </h1>
            <p className="wow fadeInUpX animated fitline-hero-lead" style={{ animationDelay: '0.15s' }}>
              <span className="fitline-hero-lead__full">
                Upload your resume once. Add the job you want. Fitline turns your real experience into
                a tailored resume that speaks to that role, so you show up interview-ready. No invented
                skills.
              </span>
              <span className="fitline-hero-lead__short">
                Upload once. Add the job. Get a tailored resume that speaks to that role. Nothing
                invented.
              </span>
            </p>
            <div
              className="zubuz-hero-btn-wrap center wow fadeInUpX animated"
              style={{ animationDelay: '0.3s' }}
            >
              <Link className="zubuz-default-btn" to="/analyze">
                <span>Tailor Your Resume</span>
              </Link>
              <button
                type="button"
                className="zubuz-hero-video"
                onClick={() => setDemoOpen(true)}
              >
                <img src="/assets/images/v1/h-play-btn.svg" alt="" width={28} height={28} />
                See How It Works
              </button>
            </div>
            <div className="zubuz-hero-shape">
              <img src="/assets/images/v1/shape.png" alt="" />
            </div>
          </div>

          <HeroVisual />
        </div>
      </div>

      <div className="section dark-bg zubuz-section-padding4">
        <div className="container">
          <div className="row align-items-center">
            <div className="col-lg-6">
              <div className="zubuz-brand-logo-content">
                <h3>Win the interview. Keep the truth.</h3>
              </div>
            </div>
            <div className="col-lg-6">
              <p style={{ color: 'rgba(255,255,255,0.75)', margin: 0 }}>
                Fitline shapes your real experience for the job you want so recruiters see why you
                belong in the interview. No fabricated skills. No fake years. Just a sharper resume
                for that role.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="section zubuz-section-padding3 bg-light" id="how-it-works">
        <div className="container">
          <div className="zubuz-section-title center">
            <h2>How it works</h2>
          </div>
          <div className="row">
            <div className="col-xl-3 col-md-6">
              <div className="zubuz-iconbox-wrap center">
                <div className="zubuz-iconbox-icon">
                  <img src="/assets/images/v1/icon3.png" alt="" />
                </div>
                <div className="zubuz-iconbox-data data-small">
                  <h3>01. Save Your Resume</h3>
                  <p>Upload once. It stays available on your device for every new role.</p>
                </div>
              </div>
            </div>
            <div className="col-xl-3 col-md-6">
              <div className="zubuz-iconbox-wrap center">
                <div className="zubuz-iconbox-icon">
                  <img src="/assets/images/v1/icon4.png" alt="" />
                </div>
                <div className="zubuz-iconbox-data data-small">
                  <h3>02. Add a Job</h3>
                  <p>Upload a screenshot, paste the description, or enter requirements.</p>
                </div>
              </div>
            </div>
            <div className="col-xl-3 col-md-6">
              <div className="zubuz-iconbox-wrap center">
                <div className="zubuz-iconbox-icon">
                  <img src="/assets/images/v1/icon5.png" alt="" />
                </div>
                <div className="zubuz-iconbox-data data-small">
                  <h3>03. Get Clear Feedback</h3>
                  <p>See what already helps you land the interview, and what to fix next.</p>
                </div>
              </div>
            </div>
            <div className="col-xl-3 col-md-6">
              <div className="zubuz-iconbox-wrap center">
                <div className="zubuz-iconbox-icon">
                  <img src="/assets/images/v1/icon6.png" alt="" />
                </div>
                <div className="zubuz-iconbox-data data-small">
                  <h3>04. Download & Apply</h3>
                  <p>Get a tailored resume for that job, then send it with confidence.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="section zubuz-section-padding2">
        <div className="container">
          <div className="row">
            <div className="col-lg-5">
              <div className="zubuz-thumb thumb-pr">
                <div className="fitline-brutal-card">
                  <div className="kicker">Requirements</div>
                  <h3>✓ React</h3>
                  <p>Strong evidence in Projects and Experience</p>
                </div>
                <div className="fitline-brutal-card">
                  <div className="kicker">Gap</div>
                  <h3>✕ AWS</h3>
                  <p>No supporting evidence. We won’t invent it.</p>
                </div>
              </div>
            </div>
            <div className="col-lg-7 d-flex align-items-center">
              <div className="zubuz-default-content">
                <h2>Built to get you into the interview room</h2>
                <p>
                  We line your real experience up with the job they posted, then rewrite what you
                  already have so it reads like you belong there. Gaps stay honest. Strengths get
                  loud.
                </p>
                <div className="zubuz-extara-mt">
                  <div className="zubuz-iconbox-wrap-left">
                    <div className="zubuz-iconbox-icon">
                      <img src="/assets/images/v1/icon1.png" alt="" />
                    </div>
                    <div className="zubuz-iconbox-data">
                      <span>What we’re changing</span>
                      <p>Clear before/after wording that helps you earn the interview.</p>
                    </div>
                  </div>
                  <div className="zubuz-iconbox-wrap-left">
                    <div className="zubuz-iconbox-icon">
                      <img src="/assets/images/v1/icon2.png" alt="" />
                    </div>
                    <div className="zubuz-iconbox-data">
                      <span>What we’re not adding</span>
                      <p>Unsupported skills stay off on purpose. Interviews need truth.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="zubuz-cta-section blue-bg">
        <div className="container">
          <div className="row">
            <div className="col-lg-8 d-flex align-items-center">
              <div className="zubuz-default-content light">
                <h2>Ready to chase the job you want?</h2>
                <p>
                  Save your resume, add the posting, and walk away with a tailored resume aimed at
                  getting you the interview.
                </p>
                <div className="zubuz-extara-mt">
                  <Link className="zubuz-default-btn" to="/analyze">
                    <span>Tailor Your Resume</span>
                  </Link>
                </div>
              </div>
            </div>
            <div className="col-lg-4 d-flex align-items-center justify-content-lg-end mt-4 mt-lg-0">
              <Link className="fitline-secondary-btn on-blue" to="/resume">
                Your Resume
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
