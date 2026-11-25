import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ActionHubHeader from './actions/ActionHubHeader.jsx';
import ExecutiveSummary from './actions/ExecutiveSummary.jsx';
import NeedsAttentionSection from './actions/NeedsAttentionSection.jsx';
import ActionWorkspaceControls from './actions/ActionWorkspaceControls.jsx';
import ActionCard from './actions/ActionCard.jsx';
import ActionDetailsDrawer from './actions/ActionDetailsDrawer.jsx';
import BulkActionBar from './actions/BulkActionBar.jsx';
import WeeklyBriefModal from './actions/WeeklyBriefModal.jsx';
import { apiUrl } from '../services/apiClient.js';
import logger from '../utils/logger.js';
import './ActionHubPage.css';

/** Show a metric, or n/a when it was not measured (never a placeholder number). */
export function fmtMetric(value, suffix = '') {
  return value === null || value === undefined || value === '' ? 'n/a' : `${value}${suffix}`;
}

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
  const [showWeeklyBrief, setShowWeeklyBrief] = useState(false);

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
  const [resolutionError, setResolutionError] = useState('');

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
        fetch(apiUrl(`/actions?status=${statusFilter}&category=${categoryFilter}&severity=${severityFilter}`)),
        fetch(apiUrl('/actions/summary')),
        fetch(apiUrl('/actions/audit-runs?limit=10')),
        fetch(apiUrl('/actions/sop/compliance')),
        fetch(apiUrl('/admin/team')),
        fetch(apiUrl('/actions/slack/channels')),
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
      const res = await fetch(apiUrl('/actions/audit/trigger'), {
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
      const res = await fetch(apiUrl(`/actions/${item.id}`), {
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
    const targetStatus = resolvingItem.targetStatus || 'COMPLETED';
    // The backend requires a reason to dismiss (it no longer counts against the health score).
    const body = targetStatus === 'DISMISSED'
      ? { status: 'DISMISSED', dismissedReason: resolutionNotes.trim() }
      : { status: 'COMPLETED', resolutionNotes, completedBy: 'Engineering Manager' };
    try {
      setIsSavingResolution(true);
      setResolutionError('');
      const res = await fetch(apiUrl(`/actions/${resolvingItem.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setResolvingItem(null);
        setResolutionNotes('');
        await fetchActionData();
      } else {
        const data = await res.json().catch(() => ({}));
        setResolutionError(data.error || `Update failed (${res.status})`);
      }
    } catch (err) {
      logger.error('Failed to resolve action item', { error: err.message });
    } finally {
      setIsSavingResolution(false);
    }
  };

  // Lifecycle patch (snooze, due date). Returns an error message, or null on success.
  const handlePatchItem = async (item, patch) => {
    try {
      const res = await fetch(apiUrl(`/actions/${item.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return data.error || `Update failed (${res.status})`;
      if (data.item) setInspectingItem((cur) => (cur && cur.id === item.id ? { ...cur, ...data.item } : cur));
      await fetchActionData();
      return null;
    } catch (err) {
      logger.error('Failed to update action item', { error: err.message });
      return err.message;
    }
  };

  // Batch status update
  const handleBatchUpdate = async (status) => {
    if (selectedActionIds.length === 0) return;
    try {
      const res = await fetch(apiUrl('/actions/batch'), {
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
      const res = await fetch(apiUrl('/actions/slack/dispatch'), {
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
      const res = await fetch(apiUrl(`/actions/${nudgingItem.id}/nudge`), {
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
      // Snoozed items sit with the set-aside ones until they wake back to PENDING.
      completed: filteredActions.filter((a) => ['COMPLETED', 'DISMISSED', 'SNOOZED'].includes(a.status)),
    };
  }, [filteredActions]);

  const healthScore = summary?.healthScore ?? null;
  const metrics = summary?.metrics || null;
  const healthTierClass = healthScore === null ? '' : healthScore >= 85 ? 'health-good' : healthScore >= 65 ? 'health-warn' : 'health-danger';

  return (
    <div className="action-hub-page">
      {/* 1. TOP HEADER & EM CONTROLS */}
      <ActionHubHeader
        lastAuditAt={summary?.lastAuditAt}
        isAuditing={isAuditing}
        onTriggerAudit={handleTriggerAudit}
        onSendToSlack={() => setShowSlackModal(true)}
        onOpenWeeklyBrief={() => setShowWeeklyBrief(true)}
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
          🛡️ SOP & Architecture Matrix ({sopData?.totalRules ?? 0})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'people' ? 'active' : ''}`}
          onClick={() => setActiveTab('people')}
        >
          👥 Team Cadence & People Pulse ({teamMembers.length})
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
          {/* Top Priority Needs Attention Experience */}
          <NeedsAttentionSection
            actionItems={actionItems}
            onInspect={(item) => setInspectingItem(item)}
            onUpdateStatus={handleUpdateStatus}
            onNudge={(item) => {
              setNudgingItem(item);
              setNudgeCustomNote(`Hi ${item.assigneeName || 'team'}, please look into: ${item.title}`);
            }}
            onViewAll={() => {
              setStatusFilter('PENDING');
              setSeverityFilter('ALL');
            }}
          />

          {/* Controls Bar: Search, Filters Popover, Active Chips, View Switcher */}
          <ActionWorkspaceControls
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            severityFilter={severityFilter}
            onSeverityFilterChange={setSeverityFilter}
            onResetFilters={() => {
              setSearchQuery('');
              setStatusFilter('ALL');
              setCategoryFilter('ALL');
              setSeverityFilter('ALL');
            }}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />

          {/* Floating Bulk Action Bar (when items selected) */}
          <BulkActionBar
            selectedCount={selectedActionIds.length}
            onUpdateStatus={handleBatchUpdate}
            onShareSlack={() => {
              setSlackCustomNote(`Bulk Action Update: ${selectedActionIds.length} items addressed by EM.`);
              setShowSlackModal(true);
            }}
            onClear={() => setSelectedActionIds([])}
          />

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
                    <ActionCard
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
                    <ActionCard
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
                    <h3>Resolved / Set aside</h3>
                  </div>
                  <span className="col-count-badge">{kanbanColumns.completed.length}</span>
                </div>
                <div className="kanban-cards-stack">
                  {kanbanColumns.completed.map((item) => (
                    <ActionCard
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
              <span className="sop-score-val">{fmtMetric(sopData?.complianceScore, '%')}</span>
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

      {/* TAB 3: TEAM ROSTER & PEOPLE PULSE (real roster only) */}
      {activeTab === 'people' && (
        <div className="people-tab-container">
          <div className="people-header-card">
            <div className="people-header-info">
              <h2>👥 Team Roster & 1-on-1 Cadence</h2>
              <p>Engineers from your team roster (Admin → Team). 1-on-1 history appears once Google Calendar is connected.</p>
            </div>
            <div className="people-kpi-pill">
              <span>Overdue 1-on-1s (last audit):</span>
              <strong>{fmtMetric(metrics?.overdue1on1sCount)}</strong>
            </div>
          </div>

          <div className="team-cadence-table-container">
            {teamMembers.length === 0 ? (
              <p className="sub-note">No team members yet. Add them in Admin → Team, or run team sync.</p>
            ) : (
              <table className="team-cadence-table">
                <thead>
                  <tr>
                    <th>Engineer</th>
                    <th>Level → Target</th>
                    <th>Tenure</th>
                    <th style={{ textAlign: 'right' }}>Quick EM Action</th>
                  </tr>
                </thead>
                <tbody>
                  {teamMembers.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <div className="eng-identity-cell">
                          <span className="eng-avatar">👤</span>
                          <div>
                            <strong>{m.displayName}</strong>
                            {m.email && <small>{m.email}</small>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="level-badge">{m.currentLevel || 'level not set'} → {m.targetLevel || 'target not set'}</span>
                      </td>
                      <td>{m.tenureMonths ? `${m.tenureMonths} months` : 'not recorded'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn-schedule-sync"
                          onClick={() => {
                            setSlackCustomNote(`Hi ${String(m.displayName || '').split(' ')[0]}, `);
                            setShowSlackModal(true);
                          }}
                        >
                          💬 Message on Slack
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: SPRINT & DORA VELOCITY (values from the latest audit run) */}
      {activeTab === 'performance' && (
        <div className="perf-tab-container">
          {!metrics ? (
            <p className="sub-note">No audit has run yet. Trigger an audit to compute delivery and sprint metrics.</p>
          ) : (
            <div className="perf-grid">
              <div className="perf-card">
                <h3>🚀 DORA & Delivery (last audit)</h3>
                <div className="perf-metrics-row">
                  <div className="metric-box">
                    <span className="metric-val">{fmtMetric(metrics.deploymentFrequency, '/day')}</span>
                    <span className="metric-lbl">Deployment Frequency</span>
                  </div>
                  <div className="metric-box">
                    <span className="metric-val">{fmtMetric(metrics.mttrHours, 'h')}</span>
                    <span className="metric-lbl">Time to Restore (MTTR)</span>
                  </div>
                  <div className="metric-box">
                    <span className="metric-val">{fmtMetric(metrics.avgPrReviewWaitHours, 'h')}</span>
                    <span className="metric-lbl">Avg PR Review Wait</span>
                  </div>
                  <div className="metric-box">
                    <span className="metric-val">{fmtMetric(metrics.stalledPrsCount)} / {fmtMetric(metrics.openPrsCount)}</span>
                    <span className="metric-lbl">Stalled / Open PRs</span>
                  </div>
                </div>
                <div className="tier-badge-row">
                  <span>DORA Tier:</span>
                  <span className="badge-elite">{fmtMetric(metrics.doraTier)}</span>
                </div>
              </div>

              <div className="perf-card">
                <h3>🎯 Sprint Progress (last audit)</h3>
                <div className="perf-metrics-row">
                  <div className="metric-box">
                    <span className="metric-val">{fmtMetric(metrics.completedPoints)} / {fmtMetric(metrics.totalPoints)} SP</span>
                    <span className="metric-lbl">Story Points Completed</span>
                  </div>
                  <div className="metric-box">
                    <span className="metric-val">{fmtMetric(metrics.sprintPacingPct, '%')}</span>
                    <span className="metric-lbl">Sprint Pacing Rate</span>
                  </div>
                  <div className="metric-box">
                    <span className="metric-val">{fmtMetric(metrics.wipViolations)}</span>
                    <span className="metric-lbl">WIP Violations</span>
                  </div>
                </div>
                {Number.isFinite(Number(metrics.sprintPacingPct)) && metrics.sprintPacingPct !== null && (
                  <div className="progress-bar-container">
                    <div className="progress-bar-fill" style={{ width: `${Math.max(0, Math.min(100, Number(metrics.sprintPacingPct)))}%` }}></div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: AUDIT RUN HISTORY */}
      {activeTab === 'history' && (
        <div className="history-tab-container">
          <div className="history-timeline">
            {auditRuns.map((run) => (
              <div key={run.id} className="history-item">
                <div className="history-header">
                  <div className="history-header-left">
                    <span className="history-id">Audit Run #{run.id}</span>
                    <span className="history-trigger-badge">
                      {run.triggeredBy === 'cron' ? '⏱ 4h Cron' : '⚡ On-Demand'}
                    </span>
                    <span className={`history-score-badge ${run.healthScore >= 80 ? 'good' : 'warning'}`}>
                      Health Score: {run.healthScore}/100
                    </span>
                  </div>
                  <span className="history-time">
                    {new Date(run.createdAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <div className="history-domains-row">
                  <span className="history-domain-chip">📦 DORA & PR Delivery: <strong>Harvested</strong></span>
                  <span className="history-domain-chip">👥 People & 1-on-1s: <strong>Harvested</strong></span>
                  <span className="history-domain-chip">📊 Sprint & OKRs: <strong>Harvested</strong></span>
                  <span className="history-domain-chip">🛡️ SOP & ADR-008: <strong>Harvested</strong></span>
                </div>

                <div className="history-summary">
                  <pre>{run.summaryMarkdown || 'Audit execution completed successfully.'}</pre>
                </div>
              </div>
            ))}
            {auditRuns.length === 0 && (
              <div className="empty-state">
                <p>No audit runs recorded yet. Click "Run Audit" to trigger your first run.</p>
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
                  <p>Overall Health Score: <code>{fmtMetric(healthScore, '/100')}</code> | DORA Tier: <code>{fmtMetric(metrics?.doraTier)}</code> | Sprint Pacing: <code>{fmtMetric(metrics?.sprintPacingPct, '%')}</code></p>
                  <p>Overdue 1-on-1s: <code>{fmtMetric(metrics?.overdue1on1sCount)}</code> | Pending Actions: <code>{kanbanColumns.pending.length}</code></p>
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
            <label className="modal-label" htmlFor="resolution-notes">
              {resolvingItem.targetStatus === 'DISMISSED' ? 'Reason for dismissing (required):' : 'Resolution Notes / Follow-up Details:'}
            </label>
            <textarea
              id="resolution-notes"
              className="modal-textarea"
              rows={3}
              placeholder={resolvingItem.targetStatus === 'DISMISSED' ? 'Why this does not need action...' : 'Document the resolution, unblocking steps, or rationale...'}
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
            />
            {resolutionError && <div className="modal-error" role="alert">{resolutionError}</div>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setResolvingItem(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConfirmResolution}
                disabled={isSavingResolution || (resolvingItem.targetStatus === 'DISMISSED' && resolutionNotes.trim().length < 3)}
              >
                {isSavingResolution ? 'Saving...' : resolvingItem.targetStatus === 'DISMISSED' ? 'Confirm Dismiss' : 'Confirm Resolution'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showWeeklyBrief && <WeeklyBriefModal onClose={() => setShowWeeklyBrief(false)} />}

      {/* D. ACTION ITEM DETAILS DRAWER */}
      {inspectingItem && (
        <ActionDetailsDrawer
          item={inspectingItem}
          onClose={() => setInspectingItem(null)}
          onUpdateStatus={handleUpdateStatus}
          onPatchItem={handlePatchItem}
          onNudge={(item) => {
            setNudgingItem(item);
            setNudgeCustomNote(`Hi ${item.assigneeName || 'team'}, please look into: ${item.title}`);
          }}
        />
      )}
    </div>
  );
}
