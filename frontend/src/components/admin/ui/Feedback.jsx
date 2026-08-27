import React from 'react';
import './ui.css';

export function SearchInput({
  value,
  onChange,
  onClear,
  placeholder = 'Search...',
  className = '',
  ...props
}) {
  return (
    <div className={`admin-search-input-wrapper ${className}`}>
      <span className="admin-search-icon" aria-hidden="true">🔍</span>
      <input
        type="text"
        className="admin-search-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        {...props}
      />
      {value && (
        <button
          type="button"
          className="admin-search-clear"
          onClick={() => {
            if (onClear) onClear();
            else if (onChange) onChange('');
          }}
          aria-label="Clear search"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  icon = '📭',
  title = 'No Data Available',
  description,
  action,
  className = '',
}) {
  return (
    <div className={`admin-empty-state ${className}`}>
      <div className="admin-empty-icon">{icon}</div>
      <h3 className="admin-empty-title">{title}</h3>
      {description && <p className="admin-empty-desc">{description}</p>}
      {action && <div className="admin-empty-action" style={{ marginTop: '8px' }}>{action}</div>}
    </div>
  );
}

export function Skeleton({
  width = '100%',
  height = '16px',
  borderRadius = 'var(--admin-radius-sm)',
  className = '',
  style = {},
}) {
  return (
    <div
      className={`admin-skeleton ${className}`}
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
    />
  );
}

export function Alert({
  variant = 'info', // 'info' | 'success' | 'warning' | 'danger'
  icon,
  children,
  action,
  className = '',
}) {
  const defaultIcon =
    variant === 'success'
      ? '✅'
      : variant === 'warning'
      ? '⚠️'
      : variant === 'danger'
      ? '❌'
      : 'ℹ️';

  return (
    <div className={`admin-alert admin-alert-${variant} ${className}`}>
      <span className="admin-alert-icon" aria-hidden="true">
        {icon || defaultIcon}
      </span>
      <div style={{ flex: 1 }}>{children}</div>
      {action && <div className="admin-alert-action">{action}</div>}
    </div>
  );
}
