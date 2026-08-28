import React from 'react';
import './ui.css';

export function Card({
  children,
  className = '',
  hoverable = false,
  onClick,
  ...props
}) {
  return (
    <div
      className={`admin-card ${hoverable ? 'admin-card-hover' : ''} ${onClick ? 'clickable' : ''} ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  icon,
  action,
  children,
  className = '',
}) {
  return (
    <div className={`admin-card-header ${className}`}>
      <div className="admin-card-title-group">
        {icon && <span className="admin-card-icon">{icon}</span>}
        <div>
          {title && <h3 className="admin-card-title">{title}</h3>}
          {subtitle && <p className="admin-card-subtitle">{subtitle}</p>}
          {children}
        </div>
      </div>
      {action && <div className="admin-card-header-action">{action}</div>}
    </div>
  );
}

export function CardBody({ children, className = '', ...props }) {
  return (
    <div className={`admin-card-body ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className = '', ...props }) {
  return (
    <div className={`admin-card-footer ${className}`} {...props}>
      {children}
    </div>
  );
}

export function MetricCard({
  icon,
  value,
  label,
  subtext,
  trend,
  trendDirection = 'up', // 'up' | 'down' | 'warning'
  tier,
  onClick,
  className = '',
  ...props
}) {
  return (
    <div
      className={`admin-metric-card ${onClick ? 'clickable' : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      {...props}
    >
      <div className="admin-metric-top">
        {icon && <span className="admin-metric-icon">{icon}</span>}
        {tier && (
          <span className={`admin-badge admin-badge-${tier.toLowerCase() === 'elite' ? 'success' : tier.toLowerCase() === 'high' ? 'primary' : 'neutral'}`}>
            {tier}
          </span>
        )}
      </div>
      <div className="admin-metric-value">{value}</div>
      <div className="admin-metric-label">{label}</div>
      {subtext && <div className="admin-metric-sub">{subtext}</div>}
      {trend && (
        <div className={`admin-metric-trend admin-metric-trend-${trendDirection}`}>
          {trend}
        </div>
      )}
    </div>
  );
}

export default Card;
