import React from 'react';
import './Button.css';

/**
 * Standardized Button Component
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'slack' | 'success'} [props.variant='secondary']
 * @param {'sm' | 'md' | 'lg'} [props.size='md']
 * @param {React.ReactNode} [props.icon]
 * @param {React.ReactNode} [props.rightIcon]
 * @param {boolean} [props.loading=false]
 * @param {boolean} [props.disabled=false]
 * @param {'button' | 'submit' | 'reset'} [props.type='button']
 * @param {Function} [props.onClick]
 * @param {string} [props.className]
 * @param {string} [props.title]
 * @param {string} [props.ariaLabel]
 */
export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  icon,
  rightIcon,
  loading = false,
  disabled = false,
  type = 'button',
  onClick,
  className = '',
  title,
  ariaLabel,
  ...rest
}) {
  const classes = [
    'ah-btn',
    `ah-btn-${variant}`,
    `ah-btn-${size}`,
    loading ? 'ah-btn-loading' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={classes}
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      aria-label={ariaLabel || (typeof children === 'string' ? children : undefined)}
      aria-busy={loading ? 'true' : undefined}
      {...rest}
    >
      {loading ? (
        <span className="ah-btn-spinner" aria-hidden="true" />
      ) : icon ? (
        <span className="ah-btn-icon" aria-hidden="true">{icon}</span>
      ) : null}
      <span className="ah-btn-text">{children}</span>
      {!loading && rightIcon && (
        <span className="ah-btn-icon ah-btn-right-icon" aria-hidden="true">{rightIcon}</span>
      )}
    </button>
  );
}

export default Button;
