import { Link } from 'react-router-dom'

const badgeCss = `
.zsb{--zb:#3538f5;--zt:#90a1b9;--z1:#8ea2ff;--z2:#fff;--zg:rgba(142,162,255,.45);display:inline-flex;align-items:center;gap:.5em;padding:.35em .7em .35em .4em;border-radius:999px;font:500 13px/1.3 "Space Grotesk","Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--zt);text-decoration:none;border:1px solid rgba(142,162,255,.18);background:rgba(53,56,245,.06);transition:border-color .3s,background .3s,transform .3s}
.zsb--light{--zt:#475569;--z1:#3538f5;--z2:#9aa8ff;--zg:rgba(53,56,245,.18);border-color:rgba(53,56,245,.16);background:rgba(53,56,245,.04)}
.zsb:hover,.zsb:focus-visible{border-color:rgba(142,162,255,.5);background:rgba(53,56,245,.12);transform:translateY(-1px)}
.zsb:focus-visible{outline:2px solid var(--z1);outline-offset:2px}
.zsb svg{flex:none;width:22px;height:22px;display:block}
.zsb .zsb-t{fill:var(--zb)}
.zsb .zsb-z{fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1;animation:zsb-d 1.4s .3s cubic-bezier(.65,0,.35,1) forwards}
.zsb .zsb-a{fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;opacity:0;animation:zsb-f .4s 1.6s forwards}
.zsb:hover .zsb-z{animation:zsb-r 1s cubic-bezier(.65,0,.35,1)}
.zsb:hover .zsb-a{animation:zsb-n .6s ease}
.zsb b{font-weight:700;letter-spacing:.01em;white-space:nowrap;background:linear-gradient(100deg,var(--z1) 0%,var(--z1) 36%,var(--z2) 50%,var(--z1) 64%,var(--z1) 100%);background-size:250% 100%;background-position:100% 0;-webkit-background-clip:text;background-clip:text;color:var(--z1);-webkit-text-fill-color:transparent;filter:drop-shadow(0 0 6px var(--zg));animation:zsb-s 7s 2s ease-in-out infinite}
.zsb:hover b{animation:zsb-h 1.2s ease}
@keyframes zsb-d{to{stroke-dashoffset:0}}
@keyframes zsb-r{0%{stroke-dashoffset:1}100%{stroke-dashoffset:0}}
@keyframes zsb-f{to{opacity:1}}
@keyframes zsb-n{0%{opacity:1;transform:none}40%{opacity:.4;transform:translateX(1.5px)}100%{opacity:1;transform:none}}
@keyframes zsb-s{0%,80%{background-position:100% 0}100%{background-position:0 0}}
@keyframes zsb-h{from{background-position:100% 0}to{background-position:0 0}}
@media (prefers-reduced-motion:reduce){.zsb,.zsb *{animation:none!important;transition:none!important}.zsb .zsb-z{stroke-dashoffset:0}.zsb .zsb-a{opacity:1}}
@media (forced-colors:active){.zsb b{-webkit-text-fill-color:currentColor;background:none;filter:none}}
.fitline-footer-badge{display:flex;max-width:100%;padding:0 0 28px}
.fitline-footer-badge .zsb{max-width:100%;box-sizing:border-box}
`

export function Footer() {
  return (
    <footer className="zubuz-footer-section main-footer">
      <style>{badgeCss}</style>
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
        <div className="fitline-footer-badge">
          <a
            className="zsb zsb--light"
            href="https://zacharyhutton.online"
            aria-label="Website built and maintained by Zach Sites (opens zacharyhutton.online)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle className="zsb-t" cx="12" cy="12" r="12" />
              <path className="zsb-z" pathLength="1" d="M7 7.5h9.5L7.5 16.5H15" />
              <path className="zsb-a" d="M13 14l2.6 2.5L13 19" />
            </svg>
            <span>
              Website built and maintained by <b>Zach Sites</b>
            </span>
          </a>
        </div>
      </div>
    </footer>
  )
}
