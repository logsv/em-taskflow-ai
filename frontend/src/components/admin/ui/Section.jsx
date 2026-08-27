import React from 'react';
import './ui.css';

export function Section({
  title,
  subtitle,
  icon,
  badge,
  actions,
  children,
  className = '',
  ...props
}) {
  return (
    <section className={`admin-section ${className}`} {...props}>
      {(title || subtitle || actions) && (
        <div className="admin-section-header">
          <div className="admin-section-title-area">
            {title && (
              <h2>
                {icon && <span className="admin-section-icon">{icon}</span>}
                <span>{title}</span>
                {badge && <span className="admin-section-badge">{badge}</span>}
              </h2>
            )}
            {subtitle && <p className="admin-section-desc">{subtitle}</p>}
          </div>
          {actions && <div className="admin-section-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export default Section;
