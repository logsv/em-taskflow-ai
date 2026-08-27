import React, { useState, useRef, useEffect } from 'react';
import './ui.css';

export function Dropdown({
  trigger,
  items = [], // Array of { label, icon, onClick, href, danger, divider }
  align = 'right', // 'left' | 'right'
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className={`admin-dropdown-container ${className}`} ref={containerRef} style={{ position: 'relative' }}>
      <div onClick={() => setIsOpen((prev) => !prev)}>
        {trigger}
      </div>

      {isOpen && (
        <div
          className="three-dot-dropdown"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            [align]: 0,
            zIndex: 150,
          }}
        >
          {items.map((item, idx) => {
            if (item.divider) {
              return <div key={idx} className="dropdown-divider" />;
            }
            if (item.header) {
              return (
                <div key={idx} className="dropdown-header">
                  {item.header}
                </div>
              );
            }
            if (item.href) {
              return (
                <a
                  key={idx}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`dropdown-item ${item.danger ? 'exit-btn' : ''}`}
                  onClick={() => setIsOpen(false)}
                >
                  {item.icon && <span>{item.icon}</span>}
                  <span>{item.label}</span>
                </a>
              );
            }
            return (
              <button
                key={idx}
                type="button"
                className={`dropdown-item ${item.danger ? 'exit-btn' : ''}`}
                onClick={() => {
                  setIsOpen(false);
                  if (item.onClick) item.onClick();
                }}
              >
                {item.icon && <span>{item.icon}</span>}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Dropdown;
