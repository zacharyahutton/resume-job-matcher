import { useEffect, useState } from 'react'

/** Zubaz-style page load preloader (green dots on black). */
export function Preloader() {
  const [visible, setVisible] = useState(true)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const startLeave = window.setTimeout(() => setLeaving(true), 550)
    const hide = window.setTimeout(() => setVisible(false), 1050)
    return () => {
      window.clearTimeout(startLeave)
      window.clearTimeout(hide)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      className={`zubuz-preloader-wrap${leaving ? ' is-leaving' : ''}`}
      aria-hidden="true"
    >
      <div className="zubuz-preloader">
        <div />
        <div />
        <div />
        <div />
      </div>
    </div>
  )
}
