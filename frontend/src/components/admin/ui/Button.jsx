import React from 'react';
import './ui.css';

export function Button({
  children,
  variant = 'secondary', // 'primary' | 'secondary' | 'tertiary' | 'danger' | 'ghost'
  size = 'md', // 'sm' | 'md' | 'lg'
  icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  className = '',
  type = 'button',
  onClick,
  title,
  ...props
}) {
  return (
    <button
      type={type}
      className={`admin-btn admin-btn-${variant} admin-btn-${size} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
      title={title}
      {...props}
    >
      {loading && <span className="admin-btn-spinner" aria-hidden="true" />}
      {!loading && icon && iconPosition === 'left' && <span className="admin-btn-icon">{icon}</span>}
      <span>{children}</span>
      {!loading && icon && iconPosition === 'right' && <span className="admin-btn-icon">{icon}</span>}
    </button>
  );
}

export function IconButton({
  icon,
  size = 'md', // 'sm' | 'md'
  title,
  onClick,
  disabled = false,
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={`admin-icon-btn admin-icon-btn-${size} ${className}`}
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={title}
      {...props}
    >
      {icon}
    </button>
  );
}

export default Button;
