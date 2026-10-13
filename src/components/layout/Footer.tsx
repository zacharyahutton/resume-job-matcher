import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="zubuz-footer-section main-footer">
      <div className="container">
        <div className="zubuz-footer-top">
          <div className="row">
            <div className="col-xl-5 col-lg-12">
              <div className="zubuz-footer-textarea">
                <Link to="/" className="fitline-logo">
                  <img src="/assets/images/logo/fitline-logo.svg" alt="Fitline" width={36} height={36} />
                  Fitline
                </Link>
                <p>
                  Know if you’re close, then get interview-ready. Your resume stays on this device.
                  We tailor from real experience, never invent it.
                </p>
              </div>
            </div>
            <div className="col-xl-3 col-md-4">
              <div className="zubuz-footer-menu extar-margin">
                <div className="zubuz-footer-title">
                  <p>Product</p>
                </div>
                <ul>
                  <li>
                    <Link to="/">Home</Link>
                  </li>
                  <li>
                    <a href="/#how-it-works">How It Works</a>
                  </li>
                  <li>
                    <Link to="/resume">Your Resume</Link>
                  </li>
                  <li>
                    <Link to="/analyze">Tailor Resume</Link>
                  </li>
                </ul>
              </div>
            </div>
            <div className="col-xl-3 col-md-4">
              <div className="zubuz-footer-menu">
                <div className="zubuz-footer-title">
                  <p>Legal</p>
                </div>
                <ul>
                  <li>
                    <Link to="/privacy">Privacy Policy</Link>
                  </li>
                  <li>
                    <Link to="/terms">Terms of Service</Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
        <div className="zubuz-footer-bottom fitline-footer-bottom">
          <div className="zubuz-copywright">
            <p>
              <a
                href="https://zacharyhutton.online/"
                target="_blank"
                rel="noopener"
              >
                Website by Zachary Hutton
              </a>
              {' · '}© {new Date().getFullYear()} Fitline
            </p>
          </div>
          <div className="fitline-footer-links">
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
