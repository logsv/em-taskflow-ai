import React from 'react';
import './Card.css';

/**
 * Standardized Card Component
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {string} [props.className]
 * @param {'critical' | 'warning' | 'info' | 'success' | 'neutral'} [props.severity]
 * @param {boolean} [props.interactive] - Adds hover styles & pointer cursor
 * @param {boolean} [props.selected] - Selected border state
 * @param {'none' | 'sm' | 'md' | 'lg'} [props.padding='md']
 * @param {Function} [props.onClick]
 * @param {Object} [props.style]
 * @param {string} [props.role]
 * @param {number} [props.tabIndex]
 * @param {Function} [props.onKeyDown]
 */
export function Card({
  children,
  className = '',
  severity,
  interactive = false,
  selected = false,
  padding = 'md',
  onClick,
  style,
  role,
  tabIndex,
  onKeyDown,
  ...rest
}) {
  const classes = [
    'ah-card',
    severity ? `ah-card-sev-${severity.toLowerCase()}` : '',
    interactive ? 'ah-card-interactive' : '',
    selected ? 'ah-card-selected' : '',
    `ah-card-pad-${padding}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const handleKeyDown = (e) => {
    if (onKeyDown) {
      onKeyDown(e);
    } else if (interactive && onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick(e);
    }
  };

  return (
    <div
      className={classes}
      onClick={onClick}
      style={style}
      role={role || (interactive ? 'button' : undefined)}
      tabIndex={tabIndex !== undefined ? tabIndex : interactive ? 0 : undefined}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {children}
    </div>
  );
}

export default Card;
