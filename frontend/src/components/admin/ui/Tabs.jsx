import React from 'react';
import './ui.css';

export function Tabs({
  tabs = [], // Array of { id, label, icon, badge }
  activeTab,
  onTabChange,
  className = '',
}) {
  return (
    <nav className={`admin-tabs-nav ${className}`} role="tablist">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`admin-tab-item ${isActive ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.icon && <span className="admin-tab-icon">{tab.icon}</span>}
            <span className="admin-tab-label">{tab.label}</span>
            {tab.badge && <span className="admin-tab-badge">{tab.badge}</span>}
          </button>
        );
      })}
    </nav>
  );
}

export default Tabs;
