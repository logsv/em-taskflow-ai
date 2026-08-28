import React from 'react';
import './EmptyState.css';

/**
 * Standardized Empty State Component
 * @param {Object} props
 * @param {React.ReactNode} [props.icon]
 * @param {string} props.title
 * @param {string | React.ReactNode} [props.description]
 * @param {React.ReactNode} [props.action]
 * @param {string} [props.className]
 */
export function EmptyState({
  icon = '📋',
  title,
  description,
  action,
  className = '',
  ...rest
}) {
  return (
    <div className={`ah-empty-state ${className}`} {...rest}>
      {icon && <div className="ah-empty-state-icon" aria-hidden="true">{icon}</div>}
      <h3 className="ah-empty-state-title">{title}</h3>
      {description && <p className="ah-empty-state-desc">{description}</p>}
      {action && <div className="ah-empty-state-action">{action}</div>}
    </div>
  );
}

export default EmptyState;
