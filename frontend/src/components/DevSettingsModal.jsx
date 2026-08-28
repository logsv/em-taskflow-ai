import React, { useEffect } from 'react';
import { useGithubSync } from '../hooks/useGithubSync.js';
import './DevSettingsModal.css';

export default function DevSettingsModal({
  isOpen,
  onClose,
  sessionSummary,
  useAdvancedMode,
  setUseAdvancedMode,
  onOpenAdmin,
}) {
  const { syncStatus, syncMessage, triggerSync, isSyncing } = useGithubSync();

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
  };

  return (
    <div className="dev-modal-backdrop" onClick={onClose}>
      <div className="dev-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dev-modal-header">
          <div className="dev-modal-title">
            <span className="dev-modal-icon">⚙️</span>
            <div>
              <h3>Settings & Developer Tools</h3>
              <p>Configuration, AI retrieval modes, diagnostics, and external services</p>
            </div>
          </div>
          <button className="dev-modal-close" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </div>

        <div className="dev-modal-body">
          {/* Section 1: AI & Retrieval Settings */}
          <div className="dev-section">
            <h4 className="dev-section-title">
              <span>🧠</span> AI Retrieval & Inference
            </h4>
            <div className="dev-card">
              <div className="dev-setting-row">
                <div className="dev-setting-info">
                  <span className="dev-setting-label">Advanced RAG (HyDE + Multi-vector)</span>
                  <span className="dev-setting-desc">
                    Enables hypothetical document expansion and CTE Reciprocal Rank Fusion against <code>taskflow_ai</code> vector storage.
                  </span>
                </div>
                <label className="dev-switch">
                  <input
                    type="checkbox"
                    checked={useAdvancedMode}
                    onChange={(e) => setUseAdvancedMode(e.target.checked)}
                  />
                  <span className="dev-slider"></span>
                </label>
              </div>
              <div className="dev-setting-row">
                <div className="dev-setting-info">
                  <span className="dev-setting-label">Primary LLM Provider</span>
                  <span className="dev-setting-desc">100% Local SLM Inference (Ollama)</span>
                </div>
                <span className="dev-badge dev-badge-purple">hermes3:8b (Ollama)</span>
              </div>
            </div>
          </div>

          {/* Section 2: Session & Telemetry Diagnostics */}
          <div className="dev-section">
            <h4 className="dev-section-title">
              <span>🔍</span> Active Session Diagnostics
            </h4>
            <div className="dev-card">
              <div className="dev-diag-row">
                <span className="dev-diag-label">Session ID</span>
                <div className="dev-diag-val-group">
                  <code className="dev-mono">{sessionSummary?.sessionId || 'None'}</code>
                  {sessionSummary?.sessionId && (
                    <button
                      type="button"
                      className="dev-copy-btn"
                      onClick={() => copyToClipboard(sessionSummary.sessionId)}
                      title="Copy Session ID"
                    >
                      Copy
                    </button>
                  )}
                </div>
              </div>
              <div className="dev-diag-row">
                <span className="dev-diag-label">Thread ID</span>
                <div className="dev-diag-val-group">
                  <code className="dev-mono">{sessionSummary?.threadId || 'Pending'}</code>
                  {sessionSummary?.threadId && (
                    <button
                      type="button"
                      className="dev-copy-btn"
                      onClick={() => copyToClipboard(sessionSummary.threadId)}
                      title="Copy Thread ID"
                    >
                      Copy
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: PostgreSQL Cache & Integrations */}
          <div className="dev-section">
            <h4 className="dev-section-title">
              <span>🗄️</span> Isolated Databases & MCP Cache
            </h4>
            <div className="dev-card">
              <div className="dev-diag-row">
                <span className="dev-diag-label">PostgreSQL Issue Cache</span>
                <span className="dev-diag-val">
                  {syncStatus?.postgresql?.count ?? 0} issues cached
                </span>
              </div>
              {syncStatus?.postgresql?.lastSyncedAt && (
                <div className="dev-diag-row">
                  <span className="dev-diag-label">Last Synced</span>
                  <span className="dev-diag-val">
                    {new Date(syncStatus.postgresql.lastSyncedAt).toLocaleString()}
                  </span>
                </div>
              )}
              <div className="dev-diag-row" style={{ marginTop: '8px' }}>
                <span className="dev-diag-label">GitHub DB Sync</span>
                <button
                  type="button"
                  className={`dev-action-btn ${isSyncing ? 'syncing' : ''}`}
                  onClick={triggerSync}
                  disabled={isSyncing}
                >
                  {isSyncing ? '🔄 Syncing...' : '🔄 Force Cache Refresh'}
                </button>
              </div>
              {syncMessage && <div className="dev-sync-toast">{syncMessage}</div>}
            </div>
          </div>

          {/* Section 4: External Portals & Management */}
          <div className="dev-section">
            <h4 className="dev-section-title">
              <span>🚀</span> Admin & Observability Portals
            </h4>
            <div className="dev-portals-grid">
              <button
                type="button"
                className="dev-portal-card"
                onClick={() => {
                  onClose();
                  if (typeof onOpenAdmin === 'function') {
                    onOpenAdmin();
                  } else {
                    window.location.href = '/admin';
                  }
                }}
              >
                <span className="dev-portal-icon">⚙️</span>
                <div className="dev-portal-text">
                  <strong>Standalone Admin Portal</strong>
                  <span>Team directory, MCP credentials, benchmarks & DORA</span>
                </div>
                <span className="dev-portal-arrow">→</span>
              </button>

              <a
                href="http://localhost:3000"
                target="_blank"
                rel="noopener noreferrer"
                className="dev-portal-card"
              >
                <span className="dev-portal-icon">📊</span>
                <div className="dev-portal-text">
                  <strong>Langfuse Observability</strong>
                  <span>Trace graphs, LLM latency & token telemetry (Port 3000)</span>
                </div>
                <span className="dev-portal-arrow">↗</span>
              </a>

              <a
                href="http://localhost:8088"
                target="_blank"
                rel="noopener noreferrer"
                className="dev-portal-card"
              >
                <span className="dev-portal-icon">⏳</span>
                <div className="dev-portal-text">
                  <strong>Temporal Workflows UI</strong>
                  <span>Durable audit cron & RAG ingestion jobs (Port 8088)</span>
                </div>
                <span className="dev-portal-arrow">↗</span>
              </a>
            </div>
          </div>
        </div>

        <div className="dev-modal-footer">
          <span>EM TaskFlow AI • Local Architecture</span>
          <button type="button" className="dev-done-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
