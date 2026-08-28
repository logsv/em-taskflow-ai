import React, { useState } from 'react';
import { Button } from '../ui';
import './ActionHubHeader.css';

function formatRelativeSyncTime(dateInput) {
  if (!dateInput) return 'Synced just now';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return 'Synced just now';
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Synced just now';
  if (diffMin < 60) return `Synced ${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Synced ${diffHours}h ago`;
  return `Synced ${date.toLocaleDateString()}`;
}

/**
 * Clean, decision-oriented Action Hub Header
 */
export function ActionHubHeader({
  lastAuditAt,
  isAuditing,
  onTriggerAudit,
  onSendToSlack,
  onOpenAdmin,
  onBackToChat,
}) {
  const syncLabel = formatRelativeSyncTime(lastAuditAt);

  return (
    <header className="ah-header">
      {/* Top Navigation Row */}
      <div className="ah-header-top-row">
        <button
          type="button"
          className="ah-back-to-chat-btn"
          onClick={onBackToChat}
          title="Return to Chat & Assistant"
        >
          <span className="ah-back-arrow" aria-hidden="true">←</span>
          <span>Chat</span>
        </button>

        <div className="ah-header-top-actions">
          <button
            type="button"
            className="ah-header-admin-link"
            onClick={onOpenAdmin}
            title="Open Administrative & System Ops Portal"
          >
            <span>Admin Portal</span>
            <span aria-hidden="true" className="ah-external-icon">↗</span>
          </button>
        </div>
      </div>

      {/* Main Title & Action Bar */}
      <div className="ah-header-main-row">
        <div className="ah-header-identity">
          <h1 className="ah-header-title">Action Hub</h1>
          <p className="ah-header-subtitle">
            Engineering actions requiring management attention and team unblocking
          </p>
        </div>

        <div className="ah-header-controls">
          {/* Compact Sync State Indicator */}
          <div className="ah-sync-badge" title="Temporal 4-hour background harvest active">
            <span className="ah-sync-dot" aria-hidden="true" />
            <span className="ah-sync-text">{syncLabel}</span>
          </div>

          {/* Secondary Send to Slack Action */}
          <Button
            variant="slack"
            size="md"
            icon={<span aria-hidden="true">💬</span>}
            onClick={onSendToSlack}
            title="Dispatch executive scorecard to Slack channels"
          >
            Send to Slack
          </Button>

          {/* Primary Run Audit Action */}
          <Button
            variant="primary"
            size="md"
            icon={!isAuditing ? <span aria-hidden="true">🚀</span> : null}
            loading={isAuditing}
            onClick={onTriggerAudit}
            title="Execute on-demand multi-agent audit across GitHub, Jira, Slack, and Notion"
          >
            {isAuditing ? 'Auditing Tools...' : 'Run Audit'}
          </Button>
        </div>
      </div>
    </header>
  );
}

export default ActionHubHeader;
