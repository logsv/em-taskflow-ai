import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ActionHubHeader from './actions/ActionHubHeader.jsx';
import ExecutiveSummary from './actions/ExecutiveSummary.jsx';
import logger from '../utils/logger.js';
import './ActionHubPage.css';

export default function ActionHubPage({ onBackToChat, onOpenAdmin }) {
  const [activeTab, setActiveTab] = useState('actions'); // 'actions' | 'sop' | 'people' | 'performance' | 'history'
  const [viewMode, setViewMode] = useState('kanban'); // 'kanban' | 'table' | 'grid'
  
  const [actionItems, setActionItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [auditRuns, setAuditRuns] = useState([]);
  const [sopData, setSopData] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [slackChannels, setSlackChannels] = useState([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditMessage, setAuditMessage] = useState('');
  const [showHealthScorePopover, setShowHealthScorePopover] = useState(false);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedActionIds, setSelectedActionIds] = useState([]);

  // Modals & Drawers
  const [inspectingItem, setInspectingItem] = useState(null);
  const [resolvingItem, setResolvingItem] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [isSavingResolution, setIsSavingResolution] = useState(false);

  // Slack Dispatch Modal State
  const [showSlackModal, setShowSlackModal] = useState(false);
  const [slackTargetChannel, setSlackTargetChannel] = useState('#engineering-leadership');
  const [slackDispatchMode, setSlackDispatchMode] = useState('consolidated'); // 'consolidated' | 'threaded_subsections'
  const [slackCustomNote, setSlackCustomNote] = useState('');
  const [isDispatchingSlack, setIsDispatchingSlack] = useState(false);
  const [slackDispatchResult, setSlackDispatchResult] = useState(null);

  // Action Nudge Modal State
  const [nudgingItem, setNudgingItem] = useState(null);
  const [nudgeCustomNote, setNudgeCustomNote] = useState('');
  const [isSendingNudge, setIsSendingNudge] = useState(false);

  const fetchActionData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [actionsRes, summaryRes, runsRes, sopRes, teamRes, channelsRes] = await Promise.all([
        fetch(`/api/actions?status=${statusFilter}&category=${categoryFilter}&severity=${severityFilter}`),
        fetch('/api/actions/summary'),
        fetch('/api/actions/audit-runs?limit=10'),
        fetch('/api/actions/sop/compliance'),
        fetch('/api/admin/team'),
        fetch('/api/actions/slack/channels'),
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
      if (teamRes.ok) {
        const data = await teamRes.json();
        setTeamMembers(data.members || []);
      }
      if (channelsRes.ok) {
        const data = await channelsRes.json();
        setSlackChannels(data.channels || []);
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

  // Trigger Autonomous Audit
  const handleTriggerAudit = async () => {
    try {
      setIsAuditing(true);
      setAuditMessage('🚀 Initiating autonomous audit across DORA, Jira, GitHub, Slack, and Notion...');
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
        setAuditMessage(`⚠️ Audit error: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      setAuditMessage(`⚠️ Audit failed: ${err.message}`);
    } finally {
      setIsAuditing(false);
      setTimeout(() => setAuditMessage(''), 5000);
    }
  };

  // Status transitions
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
        setResolutionNotes('');
        await fetchActionData();
      }
    } catch (err) {
      logger.error('Failed to resolve action item', { error: err.message });
    } finally {
      setIsSavingResolution(false);
    }
  };

  // Batch status update
  const handleBatchUpdate = async (status) => {
    if (selectedActionIds.length === 0) return;
    try {
      const res = await fetch('/api/actions/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionIds: selectedActionIds,
          operation: 'status_update',
          status,
          resolutionNotes: `Batch marked as ${status} by EM`,
        }),
      });
      if (res.ok) {
        setSelectedActionIds([]);
        await fetchActionData();
      }
    } catch (err) {
      logger.error('Failed to batch update actions', { error: err.message });
    }
  };

  // Slack Dispatch Execution
  const handleDispatchToSlack = async () => {
    try {
      setIsDispatchingSlack(true);
      const res = await fetch('/api/actions/slack/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: slackTargetChannel,
          mode: slackDispatchMode,
          customNote: slackCustomNote,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSlackDispatchResult({
          success: true,
          message: data.message || `Briefing posted to ${slackTargetChannel}!`,
        });
        setTimeout(() => {
          setShowSlackModal(false);
          setSlackDispatchResult(null);
        }, 2000);
      } else {
        setSlackDispatchResult({
          success: false,
          message: data.error || 'Failed to dispatch to Slack',
        });
      }
    } catch (err) {
      setSlackDispatchResult({ success: false, message: err.message });
    } finally {
      setIsDispatchingSlack(false);
    }
  };

  // Individual Action Item Nudge
  const handleSendNudge = async () => {
    if (!nudgingItem) return;
    try {
      setIsSendingNudge(true);
      const res = await fetch(`/api/actions/${nudgingItem.id}/nudge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customNote: nudgeCustomNote,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAuditMessage(`💬 Nudge dispatched to ${nudgingItem.assigneeName || 'engineer'} on Slack!`);
        setNudgingItem(null);
        setNudgeCustomNote('');
      } else {
        setAuditMessage(`⚠️ Nudge failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      setAuditMessage(`⚠️ Nudge failed: ${err.message}`);
    } finally {
      setIsSendingNudge(false);
      setTimeout(() => setAuditMessage(''), 4000);
    }
  };

  // Filtered action items list
  const filteredActions = useMemo(() => {
    return actionItems.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
      if (severityFilter !== 'ALL' && item.severity !== severityFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title?.toLowerCase().includes(q);
        const matchDesc = item.description?.toLowerCase().includes(q);
        const matchAssignee = item.assigneeName?.toLowerCase().includes(q);
        const matchCategory = item.category?.toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchAssignee && !matchCategory) return false;
      }
      return true;
    });
  }, [actionItems, statusFilter, categoryFilter, severityFilter, searchQuery]);

  // Kanban columns partitioning
  const kanbanColumns = useMemo(() => {
    return {
      pending: filteredActions.filter((a) => a.status === 'PENDING'),
      in_progress: filteredActions.filter((a) => a.status === 'IN_PROGRESS'),
      completed: filteredActions.filter((a) => a.status === 'COMPLETED' || a.status === 'DISMISSED'),
    };
  }, [filteredActions]);

  const healthScore = summary?.healthScore ?? 92;
  const healthTierClass = healthScore >= 85 ? 'health-good' : healthScore >= 65 ? 'health-warn' : 'health-danger';

  return (
    <div className="action-hub-page">
      {/* 1. TOP HEADER & EM CONTROLS */}
      <ActionHubHeader
        lastAuditAt={summary?.lastAuditAt}
        isAuditing={isAuditing}
        onTriggerAudit={handleTriggerAudit}
        onSendToSlack={() => setShowSlackModal(true)}
        onOpenAdmin={onOpenAdmin}
        onBackToChat={onBackToChat}
      />

      {/* Notification Toast */}
      {auditMessage && (
        <div className="audit-notification-banner" role="status">
          <span>{auditMessage}</span>
        </div>
      )}

      {/* 2. DECISION-ORIENTED EXECUTIVE SUMMARY */}
      <ExecutiveSummary
        summary={summary}
        actionItems={actionItems}
        sopData={sopData}
        onSelectSeverityFilter={(sev) => {
          setSeverityFilter(sev);
          setActiveTab('actions');
        }}
        onSelectStatusFilter={(st) => {
          setStatusFilter(st);
          setActiveTab('actions');
        }}
        activeSeverityFilter={severityFilter}
        activeStatusFilter={statusFilter}
      />

      {/* 3. TABS NAVIGATION */}
      <nav className="action-hub-tabs">
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
          🛡️ SOP & Architecture Matrix ({sopData?.totalRules ?? 4})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'people' ? 'active' : ''}`}
          onClick={() => setActiveTab('people')}
        >
          👥 Team Cadence & People Pulse ({teamMembers.length || 3})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'performance' ? 'active' : ''}`}
          onClick={() => setActiveTab('performance')}
        >
          📊 Sprint & DORA Velocity
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          ⏱️ Audit Run History ({auditRuns.length})
        </button>
      </nav>

      {/* TAB 1: ACTION ITEMS & TRIAGE */}
      {activeTab === 'actions' && (
        <div className="actions-tab-container">
          {/* Controls Bar: Search, Filters, View Switcher & Bulk Actions */}
          <div className="actions-controls-bar">
            <div className="search-box-wrapper">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                className="search-input"
                placeholder="Search actions by title, engineer, PR, or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="clear-search-btn" onClick={() => setSearchQuery('')}>×</button>
              )}
            </div>

            <div className="filter-dropdowns-group">
              <div className="filter-group">
                <label>Status:</label>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="filter-select">
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING">Pending Triage</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="DISMISSED">Dismissed</option>
                </select>
              </div>

              <div className="filter-group">
                <label>Category:</label>
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="filter-select">
                  <option value="ALL">All Categories</option>
                  <option value="DELIVERY">Delivery & PRs</option>
                  <option value="PEOPLE">People & 1-on-1s</option>
                  <option value="OKR_VELOCITY">OKRs & Sprint</option>
                  <option value="SOP_COMPLIANCE">SOP & ADR</option>
                </select>
              </div>

              <div className="filter-group">
                <label>Severity:</label>
                <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className="filter-select">
                  <option value="ALL">All Severities</option>
                  <option value="CRITICAL">🚨 Critical Only</option>
                  <option value="WARNING">⚠️ Warning</option>
                  <option value="INFO">ℹ️ Info</option>
                </select>
              </div>

              {/* View Switcher: Kanban / Dense Table / Grid */}
              <div className="view-mode-switcher">
                <button
                  type="button"
                  className={`view-mode-btn ${viewMode === 'kanban' ? 'active' : ''}`}
                  onClick={() => setViewMode('kanban')}
                  title="Kanban Board View"
                >
                  🗂️ Kanban
                </button>
                <button
                  type="button"
                  className={`view-mode-btn ${viewMode === 'table' ? 'active' : ''}`}
                  onClick={() => setViewMode('table')}
                  title="Dense Table View"
                >
                  📑 Table
                </button>
                <button
                  type="button"
                  className={`view-mode-btn ${viewMode === 'grid' ? 'active' : ''}`}
                  onClick={() => setViewMode('grid')}
                  title="Rich Card Grid View"
                >
                  🃏 Grid
                </button>
              </div>
            </div>
          </div>

          {/* Bulk Action Bar (when items selected) */}
          {selectedActionIds.length > 0 && (
            <div className="bulk-actions-bar">
              <span>{selectedActionIds.length} action item(s) selected</span>
              <div className="bulk-btns-group">
                <button type="button" className="btn-bulk-complete" onClick={() => handleBatchUpdate('COMPLETED')}>
                  ✅ Mark Completed ({selectedActionIds.length})
                </button>
                <button type="button" className="btn-bulk-dismiss" onClick={() => handleBatchUpdate('DISMISSED')}>
                  🚫 Dismiss ({selectedActionIds.length})
                </button>
                <button
                  type="button"
                  className="btn-bulk-slack"
                  onClick={() => {
                    setSlackCustomNote(`Bulk Action Update: ${selectedActionIds.length} items addressed by EM.`);
                    setShowSlackModal(true);
                  }}
                >
                  💬 Share Selected to Slack
                </button>
                <button type="button" className="btn-bulk-clear" onClick={() => setSelectedActionIds([])}>
                  Clear Selection
                </button>
              </div>
            </div>
          )}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="loading-state">
              <span className="spinner-large"></span>
              <p>Syncing action items across tools...</p>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && filteredActions.length === 0 && (
            <div className="empty-state">
              <span className="empty-icon">🎉</span>
              <h3>No Action Items Match Filters!</h3>
              <p>All engineering pipelines, PR SLAs, 1-on-1 cadences, and SOP standards are healthy.</p>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setStatusFilter('ALL');
                  setCategoryFilter('ALL');
                  setSeverityFilter('ALL');
                  setSearchQuery('');
                }}
              >
                Reset All Filters
              </button>
            </div>
          )}

          {/* 1. KANBAN BOARD VIEW */}
          {!isLoading && filteredActions.length > 0 && viewMode === 'kanban' && (
            <div className="kanban-board-container">
              {/* Column 1: Pending Triage */}
              <div className="kanban-column column-pending">
                <div className="column-header">
                  <div className="col-title-left">
                    <span className="col-dot dot-pending"></span>
                    <h3>Pending Triage</h3>
                  </div>
                  <span className="col-count-badge">{kanbanColumns.pending.length}</span>
                </div>
                <div className="kanban-cards-stack">
                  {kanbanColumns.pending.map((item) => (
                    <ActionCardItem
                      key={item.id}
                      item={item}
                      onInspect={() => setInspectingItem(item)}
                      onUpdateStatus={handleUpdateStatus}
                      onNudge={() => {
                        setNudgingItem(item);
                        setNudgeCustomNote(`Hi ${item.assigneeName || 'team'}, please look into: ${item.title}`);
                      }}
                      isSelected={selectedActionIds.includes(item.id)}
                      onToggleSelect={(id) =>
                        setSelectedActionIds((prev) =>
                          prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                        )
                      }
                    />
                  ))}
                  {kanbanColumns.pending.length === 0 && (
                    <div className="kanban-empty-slot">No pending items</div>
                  )}
                </div>
              </div>

              {/* Column 2: In Progress */}
              <div className="kanban-column column-in-progress">
                <div className="column-header">
                  <div className="col-title-left">
                    <span className="col-dot dot-in-progress"></span>
                    <h3>In Progress</h3>
                  </div>
                  <span className="col-count-badge">{kanbanColumns.in_progress.length}</span>
                </div>
                <div className="kanban-cards-stack">
                  {kanbanColumns.in_progress.map((item) => (
                    <ActionCardItem
                      key={item.id}
                      item={item}
                      onInspect={() => setInspectingItem(item)}
                      onUpdateStatus={handleUpdateStatus}
                      onNudge={() => {
                        setNudgingItem(item);
                        setNudgeCustomNote(`Hi ${item.assigneeName || 'team'}, following up on: ${item.title}`);
                      }}
                      isSelected={selectedActionIds.includes(item.id)}
                      onToggleSelect={(id) =>
                        setSelectedActionIds((prev) =>
                          prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                        )
                      }
                    />
                  ))}
                  {kanbanColumns.in_progress.length === 0 && (
                    <div className="kanban-empty-slot">No items currently in progress</div>
                  )}
                </div>
              </div>

              {/* Column 3: Resolved / Completed */}
              <div className="kanban-column column-completed">
                <div className="column-header">
                  <div className="col-title-left">
                    <span className="col-dot dot-completed"></span>
                    <h3>Resolved / Completed</h3>
                  </div>
                  <span className="col-count-badge">{kanbanColumns.completed.length}</span>
                </div>
                <div className="kanban-cards-stack">
                  {kanbanColumns.completed.map((item) => (
                    <ActionCardItem
                      key={item.id}
                      item={item}
                      onInspect={() => setInspectingItem(item)}
                      onUpdateStatus={handleUpdateStatus}
                      onNudge={() => {}}
                      isSelected={selectedActionIds.includes(item.id)}
                      onToggleSelect={(id) =>
                        setSelectedActionIds((prev) =>
                          prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                        )
                      }
                    />
                  ))}
                  {kanbanColumns.completed.length === 0 && (
                    <div className="kanban-empty-slot">No resolved items</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 2. DENSE TABLE VIEW */}
          {!isLoading && filteredActions.length > 0 && viewMode === 'table' && (
            <div className="dense-table-container">
              <table className="dense-action-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={selectedActionIds.length === filteredActions.length && filteredActions.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedActionIds(filteredActions.map((a) => a.id));
                          else setSelectedActionIds([]);
                        }}
                      />
                    </th>
                    <th>Severity</th>
                    <th>Category</th>
                    <th>Action Item & Description</th>
                    <th>Assignee</th>
                    <th>Status</th>
                    <th>Suggested Next Step</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActions.map((item) => (
                    <tr key={item.id} className={`table-row-${item.severity?.toLowerCase()}`}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedActionIds.includes(item.id)}
                          onChange={() =>
                            setSelectedActionIds((prev) =>
                              prev.includes(item.id) ? prev.filter((x) => x !== item.id) : [...prev, item.id]
                            )
                          }
                        />
                      </td>
                      <td>
                        <span className={`badge-severity badge-${item.severity?.toLowerCase()}`}>
                          {item.severity}
                        </span>
                      </td>
                      <td>
                        <span className="badge-category">{item.category}</span>
                      </td>
                      <td className="table-title-cell" onClick={() => setInspectingItem(item)}>
                        <strong>{item.title}</strong>
                        <p className="table-sub-desc">{item.description}</p>
                      </td>
                      <td>
                        {item.assigneeName ? (
                          <span className="assignee-pill">👤 @{item.assigneeName}</span>
                        ) : (
                          <span className="unassigned-pill">—</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge-status status-${item.status?.toLowerCase()}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="table-suggested-cell">
                        {item.suggestedAction || 'Review in EM Hub'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="table-action-btns">
                          {item.status === 'PENDING' && (
                            <button
                              className="btn-status-action btn-in-progress"
                              onClick={() => handleUpdateStatus(item, 'IN_PROGRESS')}
                              title="Start progress"
                            >
                              ⏳ In Progress
                            </button>
                          )}
                          {item.status !== 'COMPLETED' && (
                            <button
                              className="btn-status-action btn-complete"
                              onClick={() => handleUpdateStatus(item, 'COMPLETED')}
                              title="Resolve with notes"
                            >
                              ✅ Done
                            </button>
                          )}
                          <button
                            className="btn-table-nudge"
                            onClick={() => {
                              setNudgingItem(item);
                              setNudgeCustomNote(`Hi ${item.assigneeName || 'team'}, please look into: ${item.title}`);
                            }}
                            title="Nudge on Slack"
                          >
                            💬
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 3. RICH CARD GRID VIEW */}
          {!isLoading && filteredActions.length > 0 && viewMode === 'grid' && (
            <div className="action-cards-grid">
              {filteredActions.map((item) => (
                <ActionCardItem
                  key={item.id}
                  item={item}
                  onInspect={() => setInspectingItem(item)}
                  onUpdateStatus={handleUpdateStatus}
                  onNudge={() => {
                    setNudgingItem(item);
                    setNudgeCustomNote(`Hi ${item.assigneeName || 'team'}, please look into: ${item.title}`);
                  }}
                  isSelected={selectedActionIds.includes(item.id)}
                  onToggleSelect={(id) =>
                    setSelectedActionIds((prev) =>
                      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SOP & ARCHITECTURE GOVERNANCE */}
      {activeTab === 'sop' && (
        <div className="sop-tab-container">
          <div className="sop-header-card">
            <div className="sop-header-info">
              <h2>🛡️ ADR Architecture & Engineering SOP Governance</h2>
              <p>
                Enforcing strict Database-Per-Service Isolation (ADR-008), 24h PR turnaround SLA, zero cloud keys, and non-blocking telemetry.
              </p>
            </div>
            <div className="sop-score-box">
              <span className="sop-score-val">{sopData?.complianceScore ?? 100}%</span>
              <span className="sop-score-lbl">Compliance Rating</span>
            </div>
          </div>

          <div className="sop-rules-list">
            {(sopData?.rules || []).map((rule) => (
              <div key={rule.id} className="sop-rule-card">
                <div className="rule-top">
                  <span className="rule-id">{rule.id}</span>
                  <span className="rule-cat">{rule.category}</span>
                  <span className={`rule-status-badge badge-${rule.status.toLowerCase()}`}>
                    {rule.status === 'PASS' ? '🟢 PASS' : '⚠️ WARN'}
                  </span>
                  <span className="rule-impact">Impact: <strong>{rule.impact}</strong></span>
                </div>
                <h3 className="rule-title">{rule.title}</h3>
                <p className="rule-desc">{rule.description}</p>
                <div className="rule-footer">
                  <span className="last-checked-label">Last Verified: {new Date(rule.lastChecked).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: TEAM CADENCE & PEOPLE PULSE */}
      {activeTab === 'people' && (
        <div className="people-tab-container">
          <div className="people-header-card">
            <div className="people-header-info">
              <h2>👥 1-on-1 Cadence, Career Growth & Team Pulse</h2>
              <p>Tracking engineer 1-on-1 frequencies, career ladders (L4 → L5 → Staff), and tenure milestones.</p>
            </div>
            <div className="people-kpi-pill">
              <span>Overall Cadence Health:</span>
              <strong>85% (1 Overdue)</strong>
            </div>
          </div>

          <div className="team-cadence-table-container">
            <table className="team-cadence-table">
              <thead>
                <tr>
                  <th>Engineer</th>
                  <th>Role & Level Target</th>
                  <th>Tenure</th>
                  <th>Last 1-on-1 Sync</th>
                  <th>Cadence Health</th>
                  <th style={{ textAlign: 'right' }}>Quick EM Action</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <div className="eng-identity-cell">
                      <span className="eng-avatar">👤</span>
                      <div>
                        <strong>Sarah Chen</strong>
                        <small>sarah.chen@company.internal</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="level-badge">L5 Senior → M1 EM Target</span>
                  </td>
                  <td>24 Months</td>
                  <td>
                    <span className="overdue-tag">16 Days Ago (&gt;14d SLA)</span>
                  </td>
                  <td>
                    <span className="badge-severity badge-warning">⚠️ OVERDUE</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn-schedule-sync"
                      onClick={() => {
                        setSlackCustomNote('Hi Sarah, let’s sync for our bi-weekly 1-on-1 tomorrow at 2 PM.');
                        setShowSlackModal(true);
                      }}
                    >
                      💬 Ping on Slack
                    </button>
                  </td>
                </tr>

                <tr>
                  <td>
                    <div className="eng-identity-cell">
                      <span className="eng-avatar">👤</span>
                      <div>
                        <strong>Alex Williams</strong>
                        <small>alex.williams@company.internal</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="level-badge">L4 Mid → L5 Senior Target</span>
                  </td>
                  <td>18 Months</td>
                  <td>6 Days Ago (On Cadence)</td>
                  <td>
                    <span className="badge-severity badge-info">🟢 ON TRACK</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn-schedule-sync"
                      onClick={() => {
                        setSlackCustomNote('Hi Alex, quick note on promotion packet milestones for next cycle.');
                        setShowSlackModal(true);
                      }}
                    >
                      💬 Send Note
                    </button>
                  </td>
                </tr>

                <tr>
                  <td>
                    <div className="eng-identity-cell">
                      <span className="eng-avatar">👤</span>
                      <div>
                        <strong>Taylor Morgan</strong>
                        <small>taylor.morgan@company.internal</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="level-badge">L6 Staff → L7 Principal</span>
                  </td>
                  <td>36 Months</td>
                  <td>4 Days Ago (On Cadence)</td>
                  <td>
                    <span className="badge-severity badge-info">🟢 ON TRACK</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn-schedule-sync"
                      onClick={() => {
                        setSlackCustomNote('Hi Taylor, great progress on the Temporal workflow architecture!');
                        setShowSlackModal(true);
                      }}
                    >
                      💬 Send Note
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: SPRINT & DORA VELOCITY */}
      {activeTab === 'performance' && (
        <div className="perf-tab-container">
          <div className="perf-grid">
            <div className="perf-card">
              <h3>🚀 DORA 2024 State of DevOps Rubric</h3>
              <div className="perf-metrics-row">
                <div className="metric-box">
                  <span className="metric-val">2.4 / day</span>
                  <span className="metric-lbl">Deployment Frequency</span>
                  <span className="metric-tier tier-elite">ELITE</span>
                </div>
                <div className="metric-box">
                  <span className="metric-val">18.5h</span>
                  <span className="metric-lbl">Lead Time for Changes</span>
                  <span className="metric-tier tier-elite">ELITE</span>
                </div>
                <div className="metric-box">
                  <span className="metric-val">4.2%</span>
                  <span className="metric-lbl">Change Failure Rate</span>
                  <span className="metric-tier tier-lowrisk">LOW RISK</span>
                </div>
                <div className="metric-box">
                  <span className="metric-val">0.8h</span>
                  <span className="metric-lbl">Time to Restore (MTTR)</span>
                  <span className="metric-tier tier-elite">ELITE</span>
                </div>
              </div>
              <div className="tier-badge-row">
                <span>Overall Status:</span>
                <span className="badge-elite">⭐ ELITE PERFORMER TIER (96.5%)</span>
              </div>
            </div>

            <div className="perf-card">
              <h3>🎯 Sprint 24 Velocity & Predictability</h3>
              <div className="perf-metrics-row">
                <div className="metric-box">
                  <span className="metric-val">38 / 48 SP</span>
                  <span className="metric-lbl">Story Points Completed</span>
                </div>
                <div className="metric-box">
                  <span className="metric-val">79%</span>
                  <span className="metric-lbl">Sprint Pacing Rate</span>
                </div>
              </div>
              <div className="progress-bar-container">
                <div className="progress-bar-fill" style={{ width: '79%' }}></div>
              </div>
              <p className="sub-note" style={{ marginTop: '12px' }}>
                Sprint 24 is pacing 4 days remaining with 0 WIP limit violations.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: AUDIT RUN HISTORY */}
      {activeTab === 'history' && (
        <div className="history-tab-container">
          <div className="history-timeline">
            {auditRuns.map((run) => (
              <div key={run.id} className="history-item">
                <div className="history-header">
                  <span className="history-id">Audit Run #{run.id}</span>
                  <span className="history-trigger">{run.triggeredBy}</span>
                  <span className="history-score-badge good">
                    Score: {run.healthScore}/100
                  </span>
                  <span className="history-time">
                    {new Date(run.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="history-summary">
                  <pre>{run.summaryMarkdown || 'Audit execution completed successfully.'}</pre>
                </div>
              </div>
            ))}
            {auditRuns.length === 0 && (
              <div className="empty-state">
                <p>No audit runs recorded yet. Click "Run Audit Now" to trigger your first run.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. MODALS & DRAWERS */}

      {/* A. SLACK DISPATCH MODAL */}
      {showSlackModal && (
        <div className="modal-overlay" onClick={() => setShowSlackModal(false)}>
          <div className="slack-dispatch-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-left">
                <span className="slack-modal-icon">💬</span>
                <h3>Dispatch EM Briefing to Slack</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setShowSlackModal(false)}>×</button>
            </div>

            <div className="modal-body">
              <div className="modal-field">
                <label>Target Slack Channel:</label>
                <select
                  value={slackTargetChannel}
                  onChange={(e) => setSlackTargetChannel(e.target.value)}
                  className="modal-select"
                >
                  <option value="#engineering-leadership">#engineering-leadership (Default)</option>
                  <option value="#dev-standup">#dev-standup</option>
                  <option value="#em-taskflow-alerts">#em-taskflow-alerts</option>
                  <option value="#engineering-retro">#engineering-retro</option>
                  {slackChannels.map((c) => (
                    <option key={c.id} value={`#${c.name}`}>#{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="modal-field">
                <label>Dispatch Format:</label>
                <div className="dispatch-mode-options">
                  <label className="mode-radio-label">
                    <input
                      type="radio"
                      name="dispatchMode"
                      value="consolidated"
                      checked={slackDispatchMode === 'consolidated'}
                      onChange={() => setSlackDispatchMode('consolidated')}
                    />
                    <div>
                      <strong>Consolidated Executive Brief</strong>
                      <small>1 structured scorecard message with Health Score & top action items</small>
                    </div>
                  </label>

                  <label className="mode-radio-label">
                    <input
                      type="radio"
                      name="dispatchMode"
                      value="threaded_subsections"
                      checked={slackDispatchMode === 'threaded_subsections'}
                      onChange={() => setSlackDispatchMode('threaded_subsections')}
                    />
                    <div>
                      <strong>Threaded Breakdown (4 Subsections)</strong>
                      <small>1 parent overview + 4 threaded replies (Delivery, People, Sprint, SOP)</small>
                    </div>
                  </label>
                </div>
              </div>

              <div className="modal-field">
                <label>Optional Manager Note:</label>
                <textarea
                  className="modal-textarea"
                  rows={2}
                  placeholder="Add custom context for the team (e.g. 'Team, please address PR blockers before 4 PM standup')..."
                  value={slackCustomNote}
                  onChange={(e) => setSlackCustomNote(e.target.value)}
                />
              </div>

              {/* Live Preview Box */}
              <div className="slack-preview-box">
                <div className="preview-label">Live Slack Message Preview:</div>
                <div className="preview-content">
                  <p><strong>🟢 EM TaskFlow AI — Autonomous Engineering Health Audit</strong></p>
                  <p>Overall Health Score: <code>{healthScore}/100</code> | DORA Tier: <code>Elite</code> | Sprint Pacing: <code>79%</code></p>
                  <p>Overdue 1-on-1s: <code>1</code> | Pending Actions: <code>{kanbanColumns.pending.length}</code></p>
                  {slackCustomNote && <p className="preview-memo"><em>"{slackCustomNote}"</em></p>}
                  <p>🔗 <em>&lt;http://localhost:3000/actions|Open in EM Action Hub ↗&gt;</em></p>
                </div>
              </div>

              {slackDispatchResult && (
                <div className={`modal-alert ${slackDispatchResult.success ? 'alert-success' : 'alert-error'}`}>
                  {slackDispatchResult.message}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setShowSlackModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleDispatchToSlack}
                disabled={isDispatchingSlack}
              >
                {isDispatchingSlack ? 'Posting to Slack...' : `💬 Post to ${slackTargetChannel}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* B. ACTION ITEM NUDGE MODAL */}
      {nudgingItem && (
        <div className="modal-overlay" onClick={() => setNudgingItem(null)}>
          <div className="resolution-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>💬 Send Slack Nudge</h3>
              <button className="modal-close-btn" onClick={() => setNudgingItem(null)}>×</button>
            </div>
            <div className="modal-item-title">
              <strong>{nudgingItem.title}</strong>
              <p>Assignee: 👤 @{nudgingItem.assigneeName || 'Unassigned'}</p>
            </div>
            <label className="modal-label">Slack Message Note:</label>
            <textarea
              className="modal-textarea"
              rows={3}
              value={nudgeCustomNote}
              onChange={(e) => setNudgeCustomNote(e.target.value)}
              placeholder="Add your note or talking point..."
            />
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setNudgingItem(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSendNudge}
                disabled={isSendingNudge}
              >
                {isSendingNudge ? 'Sending...' : '💬 Send Reminder'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* C. RESOLUTION NOTES MODAL */}
      {resolvingItem && (
        <div className="modal-overlay" onClick={() => setResolvingItem(null)}>
          <div className="resolution-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{resolvingItem.targetStatus === 'COMPLETED' ? '✅ Resolve Action Item' : '🚫 Dismiss Action Item'}</h3>
              <button className="modal-close-btn" onClick={() => setResolvingItem(null)}>×</button>
            </div>
            <div className="modal-item-title">{resolvingItem.title}</div>
            <label className="modal-label">Resolution Notes / Follow-up Details:</label>
            <textarea
              className="modal-textarea"
              rows={3}
              placeholder="Document the resolution, unblocking steps, or rationale..."
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
            />
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setResolvingItem(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConfirmResolution}
                disabled={isSavingResolution}
              >
                {isSavingResolution ? 'Saving...' : 'Confirm Resolution'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* D. ACTION ITEM INSPECTION DRAWER */}
      {inspectingItem && (
        <div className="modal-overlay" onClick={() => setInspectingItem(null)}>
          <div className="action-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-title-left">
                <span className={`badge-severity badge-${inspectingItem.severity?.toLowerCase()}`}>
                  {inspectingItem.severity}
                </span>
                <span className="badge-category">{inspectingItem.category}</span>
              </div>
              <button className="modal-close-btn" onClick={() => setInspectingItem(null)}>×</button>
            </div>

            <div className="drawer-body">
              <h2 className="drawer-title">{inspectingItem.title}</h2>
              <p className="drawer-desc">{inspectingItem.description}</p>

              <div className="drawer-section">
                <h4>🎯 Recommended Next Step:</h4>
                <div className="suggested-action-box">
                  💡 {inspectingItem.suggestedAction || 'Review in EM Hub'}
                </div>
              </div>

              <div className="drawer-section">
                <h4>📋 Diagnostic Details & Attribution:</h4>
                <div className="drawer-meta-grid">
                  <div className="meta-box">
                    <span className="meta-lbl">Assignee:</span>
                    <span className="meta-val">👤 @{inspectingItem.assigneeName || 'Unassigned'}</span>
                  </div>
                  <div className="meta-box">
                    <span className="meta-lbl">Status:</span>
                    <span className="meta-val">{inspectingItem.status}</span>
                  </div>
                  <div className="meta-box">
                    <span className="meta-lbl">Created At:</span>
                    <span className="meta-val">{new Date(inspectingItem.createdAt).toLocaleDateString()}</span>
                  </div>
                  {inspectingItem.externalReference && (
                    <div className="meta-box">
                      <span className="meta-lbl">Reference:</span>
                      <span className="meta-val">
                        {inspectingItem.externalReference.url ? (
                          <a href={inspectingItem.externalReference.url} target="_blank" rel="noreferrer" className="external-link">
                            {inspectingItem.externalReference.id || 'Link ↗'}
                          </a>
                        ) : (
                          inspectingItem.externalReference.id || 'External Tool'
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {inspectingItem.resolutionNotes && (
                <div className="drawer-section">
                  <h4>✅ Resolution Notes:</h4>
                  <div className="resolution-notes-box">
                    {inspectingItem.resolutionNotes}
                    <div className="resolver">Resolved by {inspectingItem.completedBy || 'EM'}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="drawer-footer">
              <button
                type="button"
                className="btn-slack-dispatch"
                onClick={() => {
                  setNudgingItem(inspectingItem);
                  setNudgeCustomNote(`Hi ${inspectingItem.assigneeName || 'team'}, please look into: ${inspectingItem.title}`);
                }}
              >
                💬 Nudge on Slack
              </button>
              {inspectingItem.status !== 'COMPLETED' && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    setResolvingItem({ ...inspectingItem, targetStatus: 'COMPLETED' });
                    setInspectingItem(null);
                  }}
                >
                  ✅ Mark Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Sub-component for rendering individual action item cards
 */
function ActionCardItem({ item, onInspect, onUpdateStatus, onNudge, isSelected, onToggleSelect }) {
  const sevClass = `severity-${item.severity?.toLowerCase() || 'info'}`;
  const statusClass = `status-${item.status?.toLowerCase() || 'pending'}`;

  return (
    <div className={`action-card ${sevClass} ${statusClass}`}>
      <div className="card-top">
        <div className="badges-row">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect && onToggleSelect(item.id)}
            className="card-checkbox"
          />
          <span className={`badge-severity badge-${item.severity?.toLowerCase()}`}>
            {item.severity}
          </span>
          <span className="badge-category">{item.category}</span>
          <span className={`badge-status ${statusClass}`}>{item.status}</span>
        </div>
        {item.assigneeName && (
          <span className="assignee-badge" title={`Assigned to ${item.assigneeName}`}>
            👤 @{item.assigneeName}
          </span>
        )}
      </div>

      <h3 className="card-title" onClick={onInspect} title="Click to view details">
        {item.title}
      </h3>
      <p className="card-desc">{item.description}</p>

      {item.suggestedAction && (
        <div className="suggested-action-box" onClick={onInspect}>
          💡 <strong>Suggested Action:</strong> {item.suggestedAction}
        </div>
      )}

      {item.resolutionNotes && (
        <div className="resolution-notes-box">
          <strong>Resolution:</strong> {item.resolutionNotes}
          {item.completedBy && <span className="resolver"> — {item.completedBy}</span>}
        </div>
      )}

      <div className="card-footer">
        <div className="footer-left">
          {item.externalReference?.url ? (
            <a
              href={item.externalReference.url}
              target="_blank"
              rel="noopener noreferrer"
              className="external-link"
            >
              🔗 {item.externalReference.id || 'View in Tool ↗'}
            </a>
          ) : item.externalReference?.id ? (
            <span className="ref-tag">Ref: {item.externalReference.id}</span>
          ) : (
            <span className="date-tag">{new Date(item.createdAt).toLocaleDateString()}</span>
          )}
        </div>

        <div className="footer-actions">
          {item.status === 'PENDING' && (
            <button
              type="button"
              className="btn-status-action btn-in-progress"
              onClick={() => onUpdateStatus(item, 'IN_PROGRESS')}
              title="Start progress"
            >
              ⏳ In Progress
            </button>
          )}
          {item.status !== 'COMPLETED' && (
            <button
              type="button"
              className="btn-status-action btn-complete"
              onClick={() => onUpdateStatus(item, 'COMPLETED')}
              title="Mark completed"
            >
              ✅ Mark Done
            </button>
          )}
          <button
            type="button"
            className="btn-nudge-action"
            onClick={onNudge}
            title="Nudge on Slack"
          >
            💬 Nudge
          </button>
          {item.status !== 'DISMISSED' && (
            <button
              type="button"
              className="btn-status-action btn-dismiss"
              onClick={() => onUpdateStatus(item, 'DISMISSED')}
              title="Dismiss"
            >
              🚫
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
