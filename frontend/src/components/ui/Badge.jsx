import React from 'react';
import './Badge.css';

/**
 * Standardized Badge Component
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {'critical' | 'warning' | 'success' | 'info' | 'neutral' | 'primary'} [props.variant='neutral']
 * @param {'sm' | 'md'} [props.size='sm']
 * @param {boolean} [props.dot=false] - Optional colored dot indicator
 * @param {React.ReactNode} [props.icon]
 * @param {string} [props.className]
 * @param {Object} [props.style]
 * @param {string} [props.title]
 */
export function Badge({
  children,
  variant = 'neutral',
  size = 'sm',
  dot = false,
  icon,
  className = '',
  style,
  title,
  ...rest
}) {
  const normVariant = (variant || 'neutral').toLowerCase();
  const classes = [
    'ah-badge',
    `ah-badge-${normVariant}`,
    `ah-badge-${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} style={style} title={title} {...rest}>
      {dot && <span className="ah-badge-dot" aria-hidden="true" />}
      {icon && <span className="ah-badge-icon" aria-hidden="true">{icon}</span>}
      <span className="ah-badge-text">{children}</span>
    </span>
  );
}

export default Badge;
