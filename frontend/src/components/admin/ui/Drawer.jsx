import React, { useEffect } from 'react';
import './ui.css';

export function Drawer({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  size = 'md', // 'md' | 'lg'
  children,
  footer,
  className = '',
}) {
  // ESC key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="admin-drawer-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className={`admin-drawer admin-drawer-${size} ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-drawer-header">
          <div className="admin-drawer-title-group">
            <h3>
              {icon && <span style={{ marginRight: '8px' }}>{icon}</span>}
              {title}
            </h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            type="button"
            className="admin-icon-btn admin-icon-btn-sm"
            onClick={onClose}
            aria-label="Close drawer"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        <div className="admin-drawer-body">
          {children}
        </div>

        {footer && (
          <div className="admin-drawer-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  size = 'md', // 'md' | 'lg'
  children,
  footer,
  className = '',
}) {
  // ESC key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="admin-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className={`admin-modal admin-modal-${size} ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-modal-header">
          <div className="admin-card-title-group">
            {icon && <span className="admin-card-icon">{icon}</span>}
            <div>
              {title && <h3 className="admin-card-title">{title}</h3>}
              {subtitle && <p className="admin-card-subtitle">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            className="admin-icon-btn admin-icon-btn-sm"
            onClick={onClose}
            aria-label="Close dialog"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        <div className="admin-modal-body">
          {children}
        </div>

        {footer && (
          <div className="admin-modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export default Drawer;
