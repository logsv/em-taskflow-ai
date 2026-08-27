import React from 'react';
import './ui.css';

export function Badge({
  children,
  variant = 'neutral', // 'healthy' | 'success' | 'warning' | 'critical' | 'danger' | 'info' | 'primary' | 'neutral'
  className = '',
  icon,
  ...props
}) {
  return (
    <span className={`admin-badge admin-badge-${variant} ${className}`} {...props}>
      {icon && <span className="admin-badge-icon">{icon}</span>}
      {children}
    </span>
  );
}

export function StatusBadge({
  status = 'healthy', // 'healthy' | 'success' | 'warning' | 'critical' | 'danger' | 'neutral'
  label,
  className = '',
  onClick,
  ...props
}) {
  const resolvedLabel = label || (
    status === 'healthy' || status === 'success'
      ? 'Healthy'
      : status === 'warning'
      ? 'Warning'
      : status === 'critical' || status === 'danger'
      ? 'Critical'
      : 'Unknown'
  );

  return (
    <span
      className={`admin-status-badge ${onClick ? 'clickable' : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      {...props}
    >
      <span className={`admin-status-dot admin-status-dot-${status}`} aria-hidden="true" />
      <span className="admin-status-label">{resolvedLabel}</span>
    </span>
  );
}

export default Badge;
