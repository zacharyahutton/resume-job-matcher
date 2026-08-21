/**
 * Zubaz-style hero: floating cards + large cropped phone.
 * Cards are HTML (source PNGs had checkerboard baked in).
 */
import { PhoneMockup } from '@/components/hero/PhoneMockup'

export function HeroVisual() {
  return (
    <div className="zubuz-hero-bottom fitline-hero-bottom">
      <div className="fitline-hero-glow" aria-hidden="true" />

      <div
        className="zubuz-hero-card card1 wow fadeInUpX animated"
        style={{ animationDelay: '0.05s' }}
      >
        <div className="fitline-card-float">
          <div className="fitline-hero-pill">
            <span className="fitline-hero-pill-dot" aria-hidden="true">
              ✓
            </span>
            Interview ready
          </div>
        </div>
      </div>

      <div
        className="zubuz-hero-card card2 wow fadeInUpX animated"
        style={{ animationDelay: '0.15s' }}
      >
        <div className="fitline-card-float delay-a">
          <div className="fitline-float-card fitline-float-resume">
            <div className="fitline-float-ico" aria-hidden="true">
              ▣
            </div>
            <div>
              <div className="fitline-float-kicker">Resume status</div>
              <div className="fitline-float-title">Saved locally</div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="zubuz-hero-card card3 wow fadeInUpX animated"
        style={{ animationDelay: '0.25s' }}
      >
        <div className="fitline-card-float delay-b">
          <div className="fitline-float-photo">
            <div className="fitline-float-photo-inner">
              <img src="/assets/images/v1/hero-card-person.png" alt="" />
            </div>
            <span className="fitline-spark" aria-hidden="true">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <path
                  d="M28 6 L30 16 M34 4 L33 14 M40 8 L36 17 M44 14 L36 20"
                  stroke="#000"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </div>
        </div>
      </div>

      <div
        className="zubuz-hero-card card4 wow fadeInUpX animated"
        style={{ animationDelay: '0.35s' }}
      >
        <div className="fitline-card-float delay-c">
          <div className="fitline-float-card fitline-float-bars">
            <div className="fitline-float-title">Match breakdown</div>
            <div className="fitline-float-bar">
              <span>Matched 7</span>
              <div className="track">
                <i className="green" />
              </div>
            </div>
            <div className="fitline-float-bar">
              <span>Gaps 3</span>
              <div className="track">
                <i className="gray" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="zubuz-hero-thumb wow fadeInUpX animated"
        style={{ animationDelay: '0.1s' }}
      >
        <PhoneMockup />
      </div>
    </div>
  )
}
