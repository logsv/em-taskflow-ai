import React, { useState, useEffect, useCallback } from 'react';
import logger from '../utils/logger.js';
import './ActionHubPage.css';

export default function ActionHubPage({ onBackToChat, onOpenAdmin }) {
  const [activeTab, setActiveTab] = useState('actions'); // 'actions' | 'sop' | 'performance' | 'history'
  const [actionItems, setActionItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [auditRuns, setAuditRuns] = useState([]);
  const [sopData, setSopData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditMessage, setAuditMessage] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Resolution modal
  const [resolvingItem, setResolvingItem] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [isSavingResolution, setIsSavingResolution] = useState(false);

  const fetchActionData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [actionsRes, summaryRes, runsRes, sopRes] = await Promise.all([
        fetch(`/api/actions?status=${statusFilter}&category=${categoryFilter}&severity=${severityFilter}`),
        fetch('/api/actions/summary'),
        fetch('/api/actions/audit-runs?limit=10'),
        fetch('/api/actions/sop/compliance'),
      ]);

      if (actionsRes.ok) {
        const data = await actionsRes.json();
        setActionItems(data.items || []);
      }
      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setSummary(data);
      }
      if (runsRes.ok) {
        const data = await runsRes.json();
        setAuditRuns(data.runs || []);
      }
      if (sopRes.ok) {
        const data = await sopRes.json();
        setSopData(data);
      }
    } catch (err) {
      logger.error('Failed to fetch EM Action Hub data', { error: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, categoryFilter, severityFilter]);

  useEffect(() => {
    fetchActionData();
  }, [fetchActionData]);

  const handleTriggerAudit = async () => {
    try {
      setIsAuditing(true);
      setAuditMessage('Initiating autonomous audit across all tools...');
      const res = await fetch('/api/actions/audit/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'consolidated' }),
      });
      const data = await res.json();
      if (res.ok) {
        setAuditMessage(data.message || 'Audit completed successfully!');
        await fetchActionData();
      } else {
        setAuditMessage(`Audit error: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      setAuditMessage(`Audit failed: ${err.message}`);
    } finally {
      setIsAuditing(false);
      setTimeout(() => setAuditMessage(''), 5000);
    }
  };

  const handleUpdateStatus = async (item, newStatus) => {
    if (newStatus === 'COMPLETED' || newStatus === 'DISMISSED') {
      setResolvingItem({ ...item, targetStatus: newStatus });
      setResolutionNotes('');
      return;
    }

    try {
      const res = await fetch(`/api/actions/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setActionItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: newStatus } : i))
        );
        fetchActionData();
      }
    } catch (err) {
      logger.error('Failed to update action item status', { error: err.message });
    }
  };

  const handleConfirmResolution = async () => {
    if (!resolvingItem) return;
    try {
      setIsSavingResolution(true);
      const res = await fetch(`/api/actions/${resolvingItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: resolvingItem.targetStatus || 'COMPLETED',
          resolutionNotes,
          completedBy: 'Engineering Manager',
        }),
      });
      if (res.ok) {
        setResolvingItem(null);
        fetchActionData();
      }
    } catch (err) {
      logger.error('Failed to resolve action item', { error: err.message });
    } finally {
      setIsSavingResolution(false);
    }
  };

  const filteredItems = actionItems.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (item.title || '').toLowerCase().includes(q) ||
      (item.description || '').toLowerCase().includes(q) ||
      (item.assigneeName || '').toLowerCase().includes(q) ||
      (item.category || '').toLowerCase().includes(q)
    );
  });

  const healthScore = summary?.healthScore ?? 92;
  const healthBadgeClass =
    healthScore >= 85 ? 'health-good' : healthScore >= 65 ? 'health-warn' : 'health-danger';

  return (
    <div className="action-hub-page">
      {/* Top Header */}
      <header className="action-hub-header">
        <div className="header-left">
          <button type="button" className="btn-secondary back-btn" onClick={onBackToChat}>
            ← Back to Chat
          </button>
          <div className="title-group">
            <h1>📋 EM Action Hub & Audit Cockpit</h1>
            <p className="subtitle">
              Autonomous 4-hour health checks, PR bottleneck triage, SOP compliance & 1-on-1 tracking
            </p>
          </div>
        </div>

        <div className="header-right">
          <div className={`health-score-pill ${healthBadgeClass}`}>
            <span className="health-dot" />
            <span className="health-label">Health Score:</span>
            <strong>{healthScore}/100</strong>
          </div>

          <button
            type="button"
            className="btn-primary audit-trigger-btn"
            onClick={handleTriggerAudit}
            disabled={isAuditing}
          >
            {isAuditing ? (
              <>
                <span className="spinner-icon" /> Running Audit...
              </>
            ) : (
              '🚀 Run Audit Now'
            )}
          </button>

          {onOpenAdmin && (
            <button type="button" className="btn-secondary" onClick={onOpenAdmin}>
              ⚙️ Admin Portal ↗
            </button>
          )}
        </div>
      </header>

      {auditMessage && (
        <div className="audit-notification-banner">
          <span>ℹ️ {auditMessage}</span>
        </div>
      )}

      {/* Summary Scorecard Cards */}
      <div className="action-hub-scorecards">
        <div className="scorecard-card card-critical">
          <div className="card-val">{summary?.summary?.criticalPending ?? 1}</div>
          <div className="card-label">🚨 Critical Actions</div>
          <span className="card-sub">Immediate attention required</span>
        </div>
        <div className="scorecard-card card-warning">
          <div className="card-val">{summary?.summary?.warningPending ?? 2}</div>
          <div className="card-label">⚠️ Warnings Pending</div>
          <span className="card-sub">PR delays & OKR drift</span>
        </div>
        <div className="scorecard-card card-completed">
          <div className="card-val">{summary?.summary?.completed ?? 0}</div>
          <div className="card-label">✅ Completed Tasks</div>
          <span className="card-sub">Resolved by EM</span>
        </div>
        <div className="scorecard-card card-sop">
          <div className="card-val">{sopData?.complianceScore ?? 100}%</div>
          <div className="card-label">🛡️ SOP & ADR Score</div>
          <span className="card-sub">Governance compliance</span>
        </div>
        <div className="scorecard-card card-cron">
          <div className="card-val">4h Cron</div>
          <div className="card-label">⏱️ Auto Background Sync</div>
          <span className="card-sub">Temporal schedule active</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="action-hub-tabs">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'actions' ? 'active' : ''}`}
          onClick={() => setActiveTab('actions')}
        >
          📋 Action Items & Triage ({actionItems.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'sop' ? 'active' : ''}`}
          onClick={() => setActiveTab('sop')}
        >
          📜 SOP & Guideline Matrix ({sopData?.totalRules || 4})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'performance' ? 'active' : ''}`}
          onClick={() => setActiveTab('performance')}
        >
          📊 Velocity & Performance
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          🕒 Audit Run History ({auditRuns.length})
        </button>
      </div>

      {/* Main Tab Content */}
      <div className="action-hub-content">
        {activeTab === 'actions' && (
          <div className="actions-tab-view">
            {/* Filter Bar */}
            <div className="actions-filter-bar">
              <input
                type="text"
                className="search-input"
                placeholder="Search actions by title, engineer, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />

              <div className="filter-group">
                <label>Status:</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="DISMISSED">Dismissed</option>
                </select>
              </div>

              <div className="filter-group">
                <label>Category:</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="ALL">All Categories</option>
                  <option value="DELIVERY">Delivery / PRs</option>
                  <option value="PEOPLE">People / 1-on-1s</option>
                  <option value="SOP_GOVERNANCE">SOP / Governance</option>
                  <option value="OKR_VELOCITY">OKR & Velocity</option>
                </select>
              </div>

              <div className="filter-group">
                <label>Severity:</label>
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="ALL">All Severities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="WARNING">Warning</option>
                  <option value="INFO">Info</option>
                </select>
              </div>
            </div>

            {/* Action Items List */}
            {isLoading ? (
              <div className="loading-state">
                <span className="spinner-icon" /> Loading EM action items...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">🎉</span>
                <h3>No Action Items Found</h3>
                <p>All items in this filter category have been resolved or no issues were detected.</p>
                <button type="button" className="btn-primary" onClick={handleTriggerAudit}>
                  Run Fresh Audit
                </button>
              </div>
            ) : (
              <div className="action-cards-grid">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className={`action-card severity-${(item.severity || 'info').toLowerCase()} status-${(item.status || 'pending').toLowerCase()}`}
                  >
                    <div className="card-top">
                      <div className="badges-row">
                        <span className={`badge-severity badge-${(item.severity || 'info').toLowerCase()}`}>
                          {item.severity === 'CRITICAL' ? '🚨 CRITICAL' : item.severity === 'WARNING' ? '⚠️ WARNING' : 'ℹ️ INFO'}
                        </span>
                        <span className="badge-category">{item.category}</span>
                        <span className={`badge-status status-${(item.status || 'pending').toLowerCase()}`}>
                          {item.status}
                        </span>
                      </div>

                      {item.assigneeName && (
                        <div className="assignee-badge" title={item.assigneeEmail || ''}>
                          👤 {item.assigneeName}
                        </div>
                      )}
                    </div>

                    <h3 className="card-title">{item.title}</h3>
                    <p className="card-desc">{item.description}</p>

                    {item.suggestedAction && (
                      <div className="suggested-action-box">
                        <strong>💡 Suggested Action:</strong> {item.suggestedAction}
                      </div>
                    )}

                    {item.resolutionNotes && (
                      <div className="resolution-notes-box">
                        <strong>📝 Resolution Notes:</strong> {item.resolutionNotes}
                        {item.completedBy && <span className="resolver"> (by {item.completedBy})</span>}
                      </div>
                    )}

                    <div className="card-footer">
                      <div className="footer-left">
                        {item.externalReference?.url ? (
                          <a
                            href={item.externalReference.url}
                            target="_blank"
                            rel="noreferrer"
                            className="external-link"
                          >
                            🔗 Open {item.externalReference.source?.toUpperCase() || 'Source'} ↗
                          </a>
                        ) : item.externalReference?.id ? (
                          <span className="ref-tag">Ref: {item.externalReference.id}</span>
                        ) : null}
                        <span className="created-date">
                          {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}
                        </span>
                      </div>

                      <div className="footer-actions">
                        {item.status === 'PENDING' && (
                          <button
                            type="button"
                            className="btn-status-action btn-in-progress"
                            onClick={() => handleUpdateStatus(item, 'IN_PROGRESS')}
                          >
                            ⏳ In Progress
                          </button>
                        )}

                        {item.status !== 'COMPLETED' && (
                          <button
                            type="button"
                            className="btn-status-action btn-complete"
                            onClick={() => handleUpdateStatus(item, 'COMPLETED')}
                          >
                            ✅ Mark Done
                          </button>
                        )}

                        {item.status !== 'DISMISSED' && (
                          <button
                            type="button"
                            className="btn-status-action btn-dismiss"
                            onClick={() => handleUpdateStatus(item, 'DISMISSED')}
                          >
                            🚫 Dismiss
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SOP & Guideline Matrix Tab */}
        {activeTab === 'sop' && (
          <div className="sop-tab-view">
            <div className="sop-header-card">
              <div className="sop-header-info">
                <h2>Internal Engineering SOPs & Architecture Decision Records (ADRs)</h2>
                <p>
                  Continuous compliance rules evaluated against codebase architectures, database isolation, PR review SLAs, and security standards.
                </p>
              </div>
              <div className="sop-score-box">
                <span className="sop-score-val">{sopData?.complianceScore ?? 100}%</span>
                <span className="sop-score-lbl">Compliance Score</span>
              </div>
            </div>

            <div className="sop-rules-list">
              {(sopData?.rules || []).map((rule) => (
                <div key={rule.id} className={`sop-rule-card status-${(rule.status || 'pass').toLowerCase()}`}>
                  <div className="rule-top">
                    <span className="rule-id">{rule.id}</span>
                    <span className="rule-cat">{rule.category}</span>
                    <span className={`rule-status-badge status-${(rule.status || 'pass').toLowerCase()}`}>
                      {rule.status === 'PASS' ? '🟢 PASS' : rule.status === 'WARN' ? '🟡 WARN' : '🔴 FAIL'}
                    </span>
                    <span className="rule-impact">Impact: {rule.impact}</span>
                  </div>

                  <h3 className="rule-title">{rule.title}</h3>
                  <p className="rule-desc">{rule.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Performance & Velocity Tab */}
        {activeTab === 'performance' && (
          <div className="performance-tab-view">
            <div className="perf-grid">
              <div className="perf-card">
                <h3>🚀 DORA Engineering Productivity</h3>
                <div className="perf-metrics-row">
                  <div className="metric-box">
                    <span className="metric-val">2.4 / day</span>
                    <span className="metric-lbl">Deployment Frequency</span>
                  </div>
                  <div className="metric-box">
                    <span className="metric-val">18.5 hrs</span>
                    <span className="metric-lbl">Lead Time for Changes</span>
                  </div>
                  <div className="metric-box">
                    <span className="metric-val">4.2%</span>
                    <span className="metric-lbl">Change Failure Rate</span>
                  </div>
                  <div className="metric-box">
                    <span className="metric-val">0.8 hrs</span>
                    <span className="metric-lbl">Time to Restore (MTTR)</span>
                  </div>
                </div>
                <div className="tier-badge-row">
                  <span>Overall Rating:</span>
                  <span className="badge-elite">🌟 Elite Performer</span>
                </div>
              </div>

              <div className="perf-card">
                <h3>🎯 Sprint Capacity & Burndown Pacing</h3>
                <div className="perf-metrics-row">
                  <div className="metric-box">
                    <span className="metric-val">38 / 48 SP</span>
                    <span className="metric-lbl">Points Completed</span>
                  </div>
                  <div className="metric-box">
                    <span className="metric-val">79%</span>
                    <span className="metric-lbl">Sprint Pacing Rate</span>
                  </div>
                  <div className="metric-box">
                    <span className="metric-val">0</span>
                    <span className="metric-lbl">WIP Violations</span>
                  </div>
                </div>
                <div className="progress-bar-container">
                  <div className="progress-bar-fill" style={{ width: '79%' }} />
                </div>
              </div>

              <div className="perf-card">
                <h3>👥 1-on-1 Cadence & People Health</h3>
                <div className="perf-metrics-row">
                  <div className="metric-box">
                    <span className="metric-val">85%</span>
                    <span className="metric-lbl">Cadence Health</span>
                  </div>
                  <div className="metric-box">
                    <span className="metric-val">1</span>
                    <span className="metric-lbl">Overdue (&gt;14d)</span>
                  </div>
                  <div className="metric-box">
                    <span className="metric-val">3</span>
                    <span className="metric-lbl">Team Members</span>
                  </div>
                </div>
                <div className="sub-note">
                  Next 1-on-1 needed: <strong>Sarah Chen</strong> (16 days since last sync)
                </div>
              </div>
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="history-tab-view">
            <div className="history-timeline">
              {auditRuns.map((run) => (
                <div key={run.id} className="history-item">
                  <div className="history-header">
                    <span className="history-id">Audit Run #{run.id}</span>
                    <span className="history-trigger">Triggered by: {run.triggeredBy}</span>
                    <span className={`history-score-badge ${run.healthScore >= 85 ? 'good' : 'warn'}`}>
                      Score: {run.healthScore}/100
                    </span>
                    <span className="history-time">
                      {run.createdAt ? new Date(run.createdAt).toLocaleString() : ''}
                    </span>
                  </div>

                  <div className="history-summary">
                    <pre>{run.summaryMarkdown}</pre>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Resolution Notes Modal */}
      {resolvingItem && (
        <div className="modal-overlay" onClick={() => setResolvingItem(null)}>
          <div className="resolution-modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              {resolvingItem.targetStatus === 'COMPLETED' ? '✅ Mark Action Completed' : '🚫 Dismiss Action Item'}
            </h3>
            <p className="modal-item-title">
              <strong>Item:</strong> {resolvingItem.title}
            </p>

            <label className="modal-label">Resolution Notes / Context (optional):</label>
            <textarea
              className="modal-textarea"
              rows={3}
              placeholder="e.g., Reviewed in 1-on-1 with Sarah; merged PR #42 after unblocking review queue."
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
            />

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setResolvingItem(null)}
                disabled={isSavingResolution}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConfirmResolution}
                disabled={isSavingResolution}
              >
                {isSavingResolution ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
