import React, { useState, useEffect } from 'react';
import { Badge, Button, IconButton, Divider } from '../ui';
import './ActionDetailsDrawer.css';

/**
 * Standardized Action Details Drawer
 * Deep diagnostic attribution, impact analysis, evidence signals, and resolution workflow
 */
export function ActionDetailsDrawer({
  item,
  onClose,
  onUpdateStatus,
  onNudge,
}) {
  const [resolutionInput, setResolutionInput] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [showNotesForm, setShowNotesForm] = useState(false);

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!item) return null;

  const sevNorm = (item.severity || 'info').toLowerCase();
  const statusNorm = (item.status || 'pending').toLowerCase();

  // Compute domain-specific "Why this matters" rationale
  const getWhyThisMatters = () => {
    const cat = item.category?.toUpperCase() || '';
    if (cat.includes('DELIVERY') || cat.includes('PR')) {
      return 'PR turnaround stalls delay release train velocity, cause branch divergence, and increase merge conflict risk across the team.';
    }
    if (cat.includes('PEOPLE') || cat.includes('1ON1')) {
      return 'Cadence gaps in 1-on-1s hinder timely feedback loops, career advancement tracking, and early risk detection for team satisfaction.';
    }
    if (cat.includes('OKR') || cat.includes('SPRINT')) {
      return 'Unaddressed delivery bottlenecks threaten sprint commitment completion and milestone pacing for quarterly team OKRs.';
    }
    if (cat.includes('SOP') || cat.includes('ADR') || cat.includes('GOVERNANCE')) {
      return 'Architecture drift and SOP non-compliance compromise system stability, observability, and database-per-service isolation boundaries.';
    }
    return 'Action item flagged during multi-agent audit to unblock team engineering operations and maintain engineering velocity.';
  };

  // Signal explainability mapping
  const getSignalName = () => {
    const cat = item.category?.toUpperCase() || '';
    if (cat.includes('DELIVERY') || cat.includes('PR')) return 'PR Review Turnaround Latency';
    if (cat.includes('PEOPLE') || cat.includes('1ON1')) return '1-on-1 Cadence Sync Gap';
    if (cat.includes('OKR')) return 'Quarterly OKR Milestone Pacing';
    if (cat.includes('SPRINT')) return 'Sprint Velocity & Story Point Capacity';
    if (cat.includes('SOP') || cat.includes('ADR')) return 'ADR Architecture Governance & Isolation';
    return 'Engineering Manager Audit Signal';
  };

  const getSourceTool = () => {
    if (item.externalReference?.url?.includes('github.com')) return 'GitHub REST API (PRs / Releases)';
    if (item.externalReference?.url?.includes('atlassian.net') || item.externalReference?.id?.includes('ENG-') || item.externalReference?.id?.includes('PROJ-')) return 'Jira REST API (OAuth 2.0 PKCE)';
    if (item.category?.toUpperCase().includes('PEOPLE')) return 'Google Calendar & Notion Career Sync';
    if (item.category?.toUpperCase().includes('SOP')) return 'PostgreSQL Architecture State & ADR Policies';
    return 'Temporal Multi-Harvest Autonomous Audit';
  };

  const getEvaluationRule = () => {
    const cat = item.category?.toUpperCase() || '';
    if (cat.includes('DELIVERY') || cat.includes('PR')) return 'PR open > 24 hours with pending reviews (SLA breached)';
    if (cat.includes('PEOPLE') || cat.includes('1ON1')) return 'Days since last 1-on-1 sync > 14 days or unscheduled';
    if (cat.includes('OKR')) return 'Pacing score < 70% of quarterly timeline target';
    if (cat.includes('SPRINT')) return 'Sprint backlog points exceed remaining capacity';
    if (cat.includes('SOP') || cat.includes('ADR')) return 'Non-compliance with Database-Per-Service Isolation (ADR-008)';
    return 'Multi-agent harvest rule threshold triggered';
  };

  const getEvaluatedAgo = () => {
    const diffMs = Date.now() - new Date(item.createdAt).getTime();
    const mins = Math.floor(diffMs / (60 * 1000));
    if (mins < 1) return 'Evaluated just now';
    if (mins < 60) return `Evaluated ${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Evaluated ${hours}h ago`;
    return `Evaluated on ${new Date(item.createdAt).toLocaleDateString()}`;
  };

  const handleResolveSubmit = async (e) => {
    e?.preventDefault();
    setIsResolving(true);
    try {
      await onUpdateStatus(item, 'COMPLETED', resolutionInput || 'Resolved in Action Hub', 'Engineering Manager');
      onClose();
    } finally {
      setIsResolving(false);
    }
  };

  // Derive SLA / Wait info
  let slaBadge = null;
  if (item.description?.toLowerCase().includes('hour') || item.description?.toLowerCase().includes('day') || item.description?.toLowerCase().includes('waiting')) {
    const waitMatch = item.description.match(/(?:waiting for (?:review for )?|since last sync )?(\d+(?:\.\d+)?\s*(?:hours?|days?|h|d))/i);
    if (waitMatch) {
      slaBadge = `⏱ ${waitMatch[1]} wait`;
    }
  }

  return (
    <div className="ah-drawer-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="ah-drawer-title">
      <div className="ah-drawer-panel" onClick={(e) => e.stopPropagation()}>
        {/* 1. Header */}
        <div className="ah-drawer-header">
          <div className="ah-drawer-header-left">
            <Badge variant={sevNorm} dot size="md">
              {item.severity}
            </Badge>
            <Badge variant="neutral" size="md">
              {item.category?.replace('_', ' ')}
            </Badge>
            <Badge
              variant={statusNorm === 'completed' ? 'success' : statusNorm === 'in_progress' ? 'warning' : 'neutral'}
              size="md"
            >
              {item.status?.replace('_', ' ')}
            </Badge>
            {slaBadge && (
              <span className="ah-drawer-sla-tag" title="SLA breach indicator">
                {slaBadge}
              </span>
            )}
          </div>
          <IconButton
            icon="✕"
            ariaLabel="Close drawer"
            size="md"
            variant="ghost"
            onClick={onClose}
          />
        </div>

        {/* 2. Scrollable Body */}
        <div className="ah-drawer-body">
          {/* Title & Description */}
          <div className="ah-drawer-section">
            <h2 id="ah-drawer-title" className="ah-drawer-title">{item.title}</h2>
            <p className="ah-drawer-desc">{item.description}</p>
          </div>

          {/* Recommended Action */}
          {item.suggestedAction && (
            <div className="ah-drawer-rec-card">
              <div className="ah-rec-card-header">
                <span className="ah-rec-card-icon" aria-hidden="true">💡</span>
                <span className="ah-rec-card-title">Recommended Next Step</span>
              </div>
              <p className="ah-rec-card-text">{item.suggestedAction}</p>
            </div>
          )}

          {/* Why This Matters */}
          <div className="ah-drawer-section">
            <h3 className="ah-drawer-section-title">⚡ Why this matters</h3>
            <div className="ah-drawer-callout">
              <p className="ah-callout-text">{getWhyThisMatters()}</p>
            </div>
          </div>

          <Divider />

          {/* Evidence & Tool Signals */}
          <div className="ah-drawer-section">
            <h3 className="ah-drawer-section-title">🔍 Evidence & Tool Signals</h3>
            <div className="ah-evidence-card">
              <div className="ah-evidence-row">
                <div className="ah-evidence-cell">
                  <span className="ah-evidence-label">Primary Signal</span>
                  <span className="ah-evidence-val">{getSignalName()}</span>
                </div>
                <div className="ah-evidence-cell">
                  <span className="ah-evidence-label">Source Tool</span>
                  <span className="ah-evidence-val">{getSourceTool()}</span>
                </div>
              </div>

              <div className="ah-evidence-rule-box">
                <span className="ah-rule-label">Evaluation Rule / Policy:</span>
                <span className="ah-rule-text"><code>{getEvaluationRule()}</code></span>
              </div>

              <div className="ah-evidence-row">
                <div className="ah-evidence-cell">
                  <span className="ah-evidence-label">Assignee / Owner</span>
                  <span className="ah-evidence-val">
                    {item.assigneeName ? `👤 @${item.assigneeName}` : '— Unassigned'}
                    {item.assigneeEmail && <span className="ah-evidence-sub">({item.assigneeEmail})</span>}
                  </span>
                </div>
                <div className="ah-evidence-cell">
                  <span className="ah-evidence-label">Evaluation Freshness</span>
                  <span className="ah-evidence-val">⏱ {getEvaluatedAgo()}</span>
                </div>
              </div>

              {item.externalReference && (
                <div className="ah-evidence-footer-ref">
                  <span className="ah-evidence-label">External Reference:</span>
                  {item.externalReference.url ? (
                    <a
                      href={item.externalReference.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ah-evidence-link"
                    >
                      🔗 {item.externalReference.id || 'Open in External Tool ↗'}
                    </a>
                  ) : (
                    <span className="ah-ref-static">Ref: {item.externalReference.id || 'Audit Snapshot'}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Resolution Notes (if already resolved) */}
          {item.resolutionNotes && (
            <div className="ah-drawer-section">
              <h3 className="ah-drawer-section-title">✅ Resolution History</h3>
              <div className="ah-resolution-history-box">
                <p className="ah-res-notes">{item.resolutionNotes}</p>
                <div className="ah-res-meta">
                  <span>Resolved by <strong>{item.completedBy || 'EM'}</strong></span>
                  {item.completedAt && (
                    <span>on {new Date(item.completedAt).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Inline Resolution Editor (if resolving) */}
          {showNotesForm && item.status !== 'COMPLETED' && (
            <form className="ah-resolution-form" onSubmit={handleResolveSubmit}>
              <h3 className="ah-drawer-section-title">📝 Add Resolution Notes</h3>
              <textarea
                className="ah-resolution-textarea"
                rows={3}
                placeholder="Describe actions taken to resolve this item (e.g. 'PR reviewed & merged', '1-on-1 scheduled with engineer')..."
                value={resolutionInput}
                onChange={(e) => setResolutionInput(e.target.value)}
                autoFocus
              />
              <div className="ah-form-actions">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowNotesForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={isResolving}
                  icon={<span aria-hidden="true">✅</span>}
                >
                  Confirm Resolution
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* 3. Footer Actions */}
        <div className="ah-drawer-footer">
          <div className="ah-footer-left">
            <Button
              variant="slack"
              size="sm"
              icon={<span aria-hidden="true">💬</span>}
              onClick={() => onNudge(item)}
              title="Send direct Slack notification to assignee"
            >
              Nudge on Slack
            </Button>
          </div>

          <div className="ah-footer-right">
            {item.status !== 'IN_PROGRESS' && item.status !== 'COMPLETED' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onUpdateStatus(item, 'IN_PROGRESS')}
              >
                ⏳ Start Progress
              </Button>
            )}

            {item.status !== 'COMPLETED' && (
              <Button
                variant="primary"
                size="sm"
                icon={<span aria-hidden="true">✅</span>}
                onClick={() => {
                  if (!showNotesForm) {
                    setShowNotesForm(true);
                  } else {
                    handleResolveSubmit();
                  }
                }}
              >
                Mark Resolved
              </Button>
            )}

            {item.status !== 'DISMISSED' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onUpdateStatus(item, 'DISMISSED')}
                title="Dismiss this action"
              >
                🚫 Dismiss
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ActionDetailsDrawer;
