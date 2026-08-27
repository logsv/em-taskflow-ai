import React, { useState } from 'react';
import { SystemStatusDrawer } from './drawers/SystemStatusDrawer.jsx';
import { Dropdown } from './ui/Dropdown.jsx';
import { Button } from './ui/Button.jsx';
import './adminTokens.css';
import './AdminShell.css';

export function AdminShell({
  activeTab = 'overview',
  activeSubTab = null,
  onTabChange,
  onSubTabChange,
  onBackToChat,
  systemStatus,
  doraMetrics,
  adminSettings,
  documentsCount = 0,
  teamCount = 0,
  onTestAllConnections,
  isTestingConnections = false,
  connTestStatus = {},
  onSaveSettings,
  onResetSettings,
  onManualSync,
  onRunDeepBenchmark,
  onOpenActionHub,
  children,
}) {
  const [statusDrawerOpen, setStatusDrawerOpen] = useState(false);

  // Derive system health status
  const isHealthy =
    (systemStatus?.health?.details?.database === 'up' || systemStatus?.status === 'online') &&
    (doraMetrics?.overall_score ?? 96) >= 80;

  // Resolve main tab ID for nav highlighting
  const currentMainTab =
    activeTab === 'team' || activeTab === 'people'
      ? 'people'
      : activeTab === 'settings' || activeTab === 'models' || activeTab === 'tools' || activeTab === 'ai-platform'
      ? 'ai-platform'
      : activeTab === 'services' || activeTab === 'storage' || activeTab === 'operations'
      ? 'operations'
      : activeTab === 'evaluation' || activeTab === 'quality'
      ? 'quality'
      : 'overview';

  // Resolve subtab for nested sections
  const currentSubTab =
    activeSubTab ||
    (activeTab === 'tools' ? 'tools' : activeTab === 'storage' ? 'storage' : activeTab === 'services' ? 'services' : 'models');

  const mainNavTabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'people', label: 'People', icon: '👥', badge: teamCount ? String(teamCount) : null },
    { id: 'ai-platform', label: 'AI Platform', icon: '🤖' },
    { id: 'operations', label: 'Operations', icon: '🚀', badge: '8 Services' },
    { id: 'quality', label: 'Quality', icon: '🧪' },
  ];

  const quickActionItems = [
    { header: 'Quick Admin Actions' },
    {
      label: 'Test All Connections',
      icon: '⚡',
      onClick: onTestAllConnections,
    },
    {
      label: 'Save & Apply Settings',
      icon: '💾',
      onClick: onSaveSettings,
    },
    {
      label: 'Re-sync .env Defaults',
      icon: '🔄',
      onClick: onResetSettings,
    },
    { divider: true },
    {
      label: 'Sync GitHub Cache Now',
      icon: '🐙',
      onClick: onManualSync,
    },
    {
      label: 'Run Deep Eval Benchmark',
      icon: '🌙',
      onClick: onRunDeepBenchmark,
    },
    { divider: true },
    {
      label: 'Langfuse Dashboard ↗',
      icon: '📊',
      href: 'http://127.0.0.1:3001',
    },
    {
      label: 'Temporal Workflows ↗',
      icon: '⏳',
      href: 'http://127.0.0.1:8233',
    },
    {
      label: 'Adminer Postgres ↗',
      icon: '🗄️',
      href: 'http://127.0.0.1:8080/?pgsql=postgres&username=taskflow&db=taskflow_backend',
    },
    { divider: true },
    {
      label: 'Switch to Copilot Chat',
      icon: '💬',
      onClick: onBackToChat,
      danger: true,
    },
  ];

  return (
    <div className="admin-shell">
      {/* 🔝 Global Top Bar */}
      <header className="admin-shell-topbar">
        <div className="admin-shell-brand">
          <div className="admin-shell-logo-text">
            <h1>⚙️ EM TaskFlow AI</h1>
            <span className="admin-shell-badge">Admin</span>
          </div>
        </div>

        <div className="admin-shell-header-right">
          {/* Compact System Health Pill */}
          <button
            type="button"
            className="admin-health-pill-btn"
            onClick={() => setStatusDrawerOpen(true)}
            title="Click to inspect live system health & 10 domain agents diagnostics"
          >
            <span
              className={`health-pill-dot ${isHealthy ? 'health-pill-dot-healthy' : 'health-pill-dot-warning'}`}
            />
            <span>{isHealthy ? 'System Healthy' : 'System Notice'}</span>
            <span className="health-pill-sub">[10 Agents Active]</span>
          </button>

          {/* Quick Actions Dropdown */}
          <Dropdown
            trigger={
              <button type="button" className="admin-icon-btn" title="Quick Admin Actions">
                ⋮
              </button>
            }
            items={quickActionItems}
            align="right"
          />

          {/* Back to Chat CTA */}
          <Button
            variant="secondary"
            size="sm"
            icon="💬"
            onClick={onBackToChat}
            title="Return to Copilot Chat view"
          >
            Back to Chat
          </Button>
        </div>
      </header>

      {/* 🧭 Global Primary Navigation */}
      <nav className="admin-shell-navbar" role="tablist">
        <div className="admin-nav-group">
          {mainNavTabs.map((tab) => {
            const isActive = currentMainTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`admin-nav-link ${isActive ? 'active' : ''}`}
                onClick={() => onTabChange(tab.id)}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.badge && <span className="admin-nav-link-badge">{tab.badge}</span>}
              </button>
            );
          })}
        </div>
      </nav>

      {/* 📂 Sub-Navigation Bar (Progressive Sub-Tabs for AI Platform and Operations) */}
      {currentMainTab === 'ai-platform' && (
        <div className="admin-subnav-bar">
          <button
            type="button"
            className={`admin-subnav-pill ${currentSubTab === 'models' || activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => onSubTabChange ? onSubTabChange('models') : onTabChange('settings')}
          >
            🤖 Inference Models
          </button>
          <button
            type="button"
            className={`admin-subnav-pill ${currentSubTab === 'tools' ? 'active' : ''}`}
            onClick={() => onSubTabChange ? onSubTabChange('tools') : onTabChange('tools')}
          >
            🛠️ Tools & MCP Integrations
          </button>
        </div>
      )}

      {currentMainTab === 'operations' && (
        <div className="admin-subnav-bar">
          <button
            type="button"
            className={`admin-subnav-pill ${activeTab === 'services' || currentSubTab === 'services' ? 'active' : ''}`}
            onClick={() => onSubTabChange ? onSubTabChange('services') : onTabChange('services')}
          >
            🚀 Service Catalog (8)
          </button>
          <button
            type="button"
            className={`admin-subnav-pill ${activeTab === 'storage' || currentSubTab === 'storage' ? 'active' : ''}`}
            onClick={() => onSubTabChange ? onSubTabChange('storage') : onTabChange('storage')}
          >
            🗄️ Storage & RAG Management
          </button>
        </div>
      )}

      {/* 📄 Main Content Body */}
      <main className="admin-shell-main">
        {children}
      </main>

      {/* ⚡ Slide-Out System Diagnostics Drawer */}
      <SystemStatusDrawer
        isOpen={statusDrawerOpen}
        onClose={() => setStatusDrawerOpen(false)}
        systemStatus={systemStatus}
        doraMetrics={doraMetrics}
        adminSettings={adminSettings}
        documentsCount={documentsCount}
        onTestAllConnections={onTestAllConnections}
        isTestingConnections={isTestingConnections}
        connTestStatus={connTestStatus}
        onOpenActionHub={onOpenActionHub}
      />
    </div>
  );
}

export default AdminShell;
