import { Link } from 'react-router-dom'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  to?: string
  children: ReactNode
  secondary?: boolean
  danger?: boolean
  size?: 'md' | 'sm'
}

export function Button({
  to,
  children,
  secondary,
  danger,
  size = 'md',
  className = '',
  ...rest
}: Props) {
  const sm = size === 'sm' ? 'sm' : ''
  const classes = danger
    ? `fitline-danger-btn ${className}`.trim()
    : secondary
      ? `fitline-secondary-btn ${sm} ${className}`.trim()
      : `zubuz-default-btn ${sm === 'sm' ? 'zubuz-header-btn' : ''} ${className}`.trim()

  const inner = secondary || danger ? children : <span>{children}</span>

  if (to) {
    return (
      <Link to={to} className={classes}>
        {inner}
      </Link>
    )
  }

  return (
    <button type="button" className={classes} {...rest}>
      {inner}
    </button>
  )
}
