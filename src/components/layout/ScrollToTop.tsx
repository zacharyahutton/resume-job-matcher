import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** Jump to top on every route change so results land at the header. */
export function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname])

  return null
}
