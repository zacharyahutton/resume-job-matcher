import { useEffect, useState } from 'react'
import { NavLink, Link } from 'react-router-dom'

const NAV = [
  { to: '/', end: true, label: 'Home' },
  { href: '/#how-it-works', label: 'How It Works' },
  { to: '/resume', label: 'Your Resume' },
  { to: '/analyze', label: 'Tailor Resume' },
] as const

export function Header() {
  const [open, setOpen] = useState(false)
  const [sticky, setSticky] = useState(false)

  useEffect(() => {
    const onScroll = () => setSticky(window.scrollY > 30)
    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    document.body.classList.toggle('fitline-menu-open', open)
    return () => {
      document.body.style.overflow = ''
      document.body.classList.remove('fitline-menu-open')
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const close = () => setOpen(false)
  const toggle = () => setOpen((v) => !v)

  return (
    <header
      className={`site-header site-header--menu-center zubuz-header-section ${sticky ? 'sticky-menu' : ''}`}
      id="sticky-menu"
    >
      <div className="container">
        <nav className="navbar site-navbar">
          <div className="brand-logo">
            <Link to="/" className="fitline-logo" onClick={close}>
              <img src="/assets/images/logo/fitline-logo.svg" alt="Fitline" width={36} height={36} />
              Fitline
            </Link>
          </div>

          <div className="menu-block-wrapper">
            <div className={`menu-overlay ${open ? 'active' : ''}`} onClick={close} />
            <nav
              className={`menu-block fitline-drawer ${open ? 'active' : ''}`}
              id="append-menu-header"
              aria-label="Mobile navigation"
            >
              <button
                type="button"
                className="fitline-drawer-close"
                onClick={close}
                aria-label="Close menu"
              >
                <span />
              </button>

              <Link to="/" className="fitline-drawer-logo" onClick={close}>
                <img src="/assets/images/logo/fitline-logo.svg" alt="" width={40} height={40} />
                <span>Fitline</span>
              </Link>

              <div className="fitline-drawer-menu">
                <ul className="site-menu-main">
                  {NAV.map((item) => (
                    <li className="nav-item" key={item.label}>
                      {'href' in item ? (
                        <a href={item.href} className="nav-link-item" onClick={close}>
                          {item.label}
                        </a>
                      ) : (
                        <NavLink
                          to={item.to}
                          end={'end' in item ? item.end : undefined}
                          className={({ isActive }) => `nav-link-item${isActive ? ' active' : ''}`}
                          onClick={close}
                        >
                          {item.label}
                        </NavLink>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="fitline-drawer-meta">
                <p>Get the interview for the job you want.</p>
                <p>Upload once. Tailor for every role.</p>
              </div>

              <div className="mobile-menu-cta fitline-drawer-cta d-lg-none">
                <Link className="zubuz-default-btn" to="/analyze" onClick={close}>
                  <span>Tailor Your Resume</span>
                </Link>
              </div>
            </nav>
          </div>

          <div className="header-btn header-btn-l1 ms-auto">
            <Link className="zubuz-default-btn zubuz-header-btn" to="/analyze">
              <span className="cta-full">Tailor Your Resume</span>
              <span className="cta-short">Tailor</span>
            </Link>
          </div>

          <div
            className="mobile-menu-trigger light"
            onClick={toggle}
            role="button"
            tabIndex={0}
            aria-label="Open menu"
            aria-expanded={open}
          >
            <span />
          </div>
        </nav>
      </div>
    </header>
  )
}
