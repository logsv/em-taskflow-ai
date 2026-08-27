import React from 'react';
import './IconButton.css';

/**
 * Standardized Accessible IconButton Component
 * @param {Object} props
 * @param {React.ReactNode} props.icon
 * @param {string} props.ariaLabel - Required accessible label
 * @param {'ghost' | 'secondary' | 'outline' | 'danger'} [props.variant='ghost']
 * @param {'sm' | 'md' | 'lg'} [props.size='md']
 * @param {string} [props.title]
 * @param {boolean} [props.disabled=false]
 * @param {Function} [props.onClick]
 * @param {string} [props.className]
 */
export function IconButton({
  icon,
  ariaLabel,
  variant = 'ghost',
  size = 'md',
  title,
  disabled = false,
  onClick,
  className = '',
  ...rest
}) {
  const classes = [
    'ah-icon-btn',
    `ah-icon-btn-${variant}`,
    `ah-icon-btn-${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel || title || 'icon button'}
      title={title || ariaLabel}
      {...rest}
    >
      <span className="ah-icon-btn-icon" aria-hidden="true">
        {icon}
      </span>
    </button>
  );
}

export default IconButton;
