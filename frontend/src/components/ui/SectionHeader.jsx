import React from 'react';
import './SectionHeader.css';

/**
 * Standardized Section Header
 * @param {Object} props
 * @param {string | React.ReactNode} props.title
 * @param {number | string} [props.count] - Optional counter badge
 * @param {string | React.ReactNode} [props.description]
 * @param {React.ReactNode} [props.badge]
 * @param {React.ReactNode} [props.actions]
 * @param {'sm' | 'md' | 'lg'} [props.size='md']
 * @param {string} [props.className]
 */
export function SectionHeader({
  title,
  count,
  description,
  badge,
  actions,
  size = 'md',
  className = '',
  ...rest
}) {
  return (
    <div className={`ah-section-header ah-section-header-${size} ${className}`} {...rest}>
      <div className="ah-section-header-main">
        <div className="ah-section-header-title-row">
          <h2 className="ah-section-header-title">{title}</h2>
          {count !== undefined && count !== null && (
            <span className="ah-section-header-count">{count}</span>
          )}
          {badge}
        </div>
        {description && (
          <p className="ah-section-header-desc">{description}</p>
        )}
      </div>
      {actions && (
        <div className="ah-section-header-actions">
          {actions}
        </div>
      )}
    </div>
  );
}

export default SectionHeader;
