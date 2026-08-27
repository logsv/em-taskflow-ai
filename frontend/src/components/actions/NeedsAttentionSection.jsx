import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Card, Badge, Button, IconButton } from '../ui';
import './NeedsAttentionSection.css';

/**
 * Individual Needs Attention Priority Item
 */
function PriorityActionItem({ item, onInspect, onUpdateStatus, onNudge }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const severityNorm = (item.severity || 'info').toLowerCase();

  // Smart derivation of Primary CTA
  const isSlackNudgeSuggested =
    item.suggestedAction?.toLowerCase().includes('ping') ||
    item.suggestedAction?.toLowerCase().includes('slack') ||
    item.suggestedAction?.toLowerCase().includes('nudge') ||
    item.suggestedAction?.toLowerCase().includes('sync');

  const handlePrimaryCTA = () => {
    if (isSlackNudgeSuggested && item.assigneeName) {
      onNudge(item);
    } else if (item.status === 'PENDING') {
      onUpdateStatus(item, 'IN_PROGRESS');
    } else {
      onUpdateStatus(item, 'COMPLETED');
    }
  };

  const primaryBtnLabel = isSlackNudgeSuggested && item.assigneeName
    ? (item.suggestedAction?.length < 24 ? item.suggestedAction : `💬 Ping @${item.assigneeName.split(' ')[0]}`)
    : (item.suggestedAction?.length < 24 ? item.suggestedAction : 'Start Progress');

  const primaryBtnIcon = isSlackNudgeSuggested ? '💬' : '⏳';

  return (
    <Card
      severity={severityNorm}
      className="ah-priority-card"
      interactive={false}
    >
      <div className="ah-priority-card-top">
        <div className="ah-priority-header-left">
          <Badge variant={severityNorm} dot size="sm">
            {item.severity}
          </Badge>
          <Badge variant="neutral" size="sm">
            {item.category?.replace('_', ' ')}
          </Badge>
          {item.assigneeName && (
            <span className="ah-priority-owner">
              👤 @{item.assigneeName}
            </span>
          )}
        </div>

        {/* Overflow Menu */}
        <div className="ah-priority-menu-wrapper" ref={menuRef}>
          <IconButton
            icon="⋯"
            ariaLabel={`More actions for ${item.title}`}
            title="More actions"
            size="sm"
            variant="ghost"
            onClick={() => setMenuOpen(!menuOpen)}
          />
          {menuOpen && (
            <div className="ah-priority-dropdown" role="menu">
              <button
                type="button"
                className="ah-dropdown-item"
                onClick={() => {
                  setMenuOpen(false);
                  onInspect(item);
                }}
                role="menuitem"
              >
                🔍 Inspect Details & Evidence
              </button>
              {item.status !== 'IN_PROGRESS' && (
                <button
                  type="button"
                  className="ah-dropdown-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onUpdateStatus(item, 'IN_PROGRESS');
                  }}
                  role="menuitem"
                >
                  ⏳ Mark In Progress
                </button>
              )}
              {item.status !== 'COMPLETED' && (
                <button
                  type="button"
                  className="ah-dropdown-item text-success"
                  onClick={() => {
                    setMenuOpen(false);
                    onUpdateStatus(item, 'COMPLETED');
                  }}
                  role="menuitem"
                >
                  ✅ Mark Done (with Notes)
                </button>
              )}
              <button
                type="button"
                className="ah-dropdown-item text-slack"
                onClick={() => {
                  setMenuOpen(false);
                  onNudge(item);
                }}
                role="menuitem"
              >
                💬 Send Slack Nudge
              </button>
              {item.status !== 'DISMISSED' && (
                <button
                  type="button"
                  className="ah-dropdown-item text-danger"
                  onClick={() => {
                    setMenuOpen(false);
                    onUpdateStatus(item, 'DISMISSED');
                  }}
                  role="menuitem"
                >
                  🚫 Dismiss Action
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Title & What Happened */}
      <h3
        className="ah-priority-title"
        onClick={() => onInspect(item)}
        title="Click to view details"
      >
        {item.title}
      </h3>
      <p className="ah-priority-desc">{item.description}</p>

      {/* Recommended Action Callout */}
      {item.suggestedAction && (
        <div className="ah-priority-rec-box">
          <span className="ah-rec-icon" aria-hidden="true">💡</span>
          <div className="ah-rec-content">
            <span className="ah-rec-label">Recommended:</span>
            <span className="ah-rec-text">{item.suggestedAction}</span>
          </div>
        </div>
      )}

      {/* Bottom Action Footer: 1 Primary CTA */}
      <div className="ah-priority-card-footer">
        <div className="ah-priority-footer-left">
          {item.externalReference?.url ? (
            <a
              href={item.externalReference.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ah-priority-ref-link"
            >
              🔗 {item.externalReference.id || 'View in Tool ↗'}
            </a>
          ) : item.externalReference?.id ? (
            <span className="ah-priority-ref-tag">Ref: {item.externalReference.id}</span>
          ) : null}
        </div>

        <div className="ah-priority-footer-right">
          <Button
            variant={severityNorm === 'critical' ? 'danger' : 'primary'}
            size="sm"
            icon={<span aria-hidden="true">{primaryBtnIcon}</span>}
            onClick={handlePrimaryCTA}
            title={item.suggestedAction || 'Take recommended action'}
          >
            {primaryBtnLabel}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/**
 * Needs Attention Section Container
 */
export function NeedsAttentionSection({
  actionItems = [],
  onInspect,
  onUpdateStatus,
  onNudge,
  onViewAll,
}) {
  // Prioritize critical and warning actions that are PENDING
  const priorityItems = useMemo(() => {
    return actionItems
      .filter((a) => a.status === 'PENDING')
      .sort((a, b) => {
        const sevOrder = { CRITICAL: 1, WARNING: 2, INFO: 3 };
        const orderA = sevOrder[a.severity] || 4;
        const orderB = sevOrder[b.severity] || 4;
        return orderA - orderB;
      })
      .slice(0, 3);
  }, [actionItems]);

  if (priorityItems.length === 0) {
    return null;
  }

  return (
    <section className="ah-needs-attention-section" aria-label="High Priority Actions Requiring Attention">
      <div className="ah-needs-attention-header">
        <div className="ah-na-title-group">
          <span className="ah-na-dot" aria-hidden="true" />
          <h2 className="ah-na-title">Needs Attention</h2>
          <span className="ah-na-count-badge">{priorityItems.length} Priority</span>
        </div>
        {onViewAll && (
          <button
            type="button"
            className="ah-na-view-all-btn"
            onClick={onViewAll}
            title="View all pending actions in workspace"
          >
            <span>View all</span>
            <span aria-hidden="true">→</span>
          </button>
        )}
      </div>

      <div className="ah-needs-attention-grid">
        {priorityItems.map((item) => (
          <PriorityActionItem
            key={item.id}
            item={item}
            onInspect={onInspect}
            onUpdateStatus={onUpdateStatus}
            onNudge={onNudge}
          />
        ))}
      </div>
    </section>
  );
}

export default NeedsAttentionSection;
