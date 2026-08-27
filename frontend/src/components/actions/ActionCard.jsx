import React, { useState, useRef, useEffect } from 'react';
import { Card, Badge, Button, IconButton } from '../ui';
import './ActionCard.css';

/**
 * Standardized, Scannable Action Card Component for Kanban & Grid Views
 */
export function ActionCard({
  item,
  onInspect,
  onUpdateStatus,
  onNudge,
  isSelected = false,
  onToggleSelect,
}) {
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

  const sevNorm = (item.severity || 'info').toLowerCase();
  const statusNorm = (item.status || 'pending').toLowerCase();

  // Smart derivation of Primary CTA
  const isSlackNudgeSuggested =
    item.suggestedAction?.toLowerCase().includes('ping') ||
    item.suggestedAction?.toLowerCase().includes('slack') ||
    item.suggestedAction?.toLowerCase().includes('nudge') ||
    item.suggestedAction?.toLowerCase().includes('sync');

  const handlePrimaryCTA = (e) => {
    e.stopPropagation();
    if (isSlackNudgeSuggested && item.assigneeName) {
      onNudge(item);
    } else if (item.status === 'PENDING') {
      onUpdateStatus(item, 'IN_PROGRESS');
    } else if (item.status === 'IN_PROGRESS') {
      onUpdateStatus(item, 'COMPLETED');
    } else {
      onInspect(item);
    }
  };

  let primaryBtnLabel = 'Review Action';
  let primaryBtnIcon = '👁️';

  if (isSlackNudgeSuggested && item.assigneeName) {
    const firstName = item.assigneeName.split(' ')[0];
    primaryBtnLabel = item.suggestedAction?.length < 20 ? item.suggestedAction : `Ping @${firstName}`;
    primaryBtnIcon = '💬';
  } else if (item.status === 'PENDING') {
    primaryBtnLabel = item.suggestedAction?.length < 20 ? item.suggestedAction : 'Start Progress';
    primaryBtnIcon = '⏳';
  } else if (item.status === 'IN_PROGRESS') {
    primaryBtnLabel = 'Mark Done';
    primaryBtnIcon = '✅';
  }

  // Extract SLA / Age note from description or created timestamp
  let slaNote = null;
  if (item.description?.toLowerCase().includes('hour') || item.description?.toLowerCase().includes('day') || item.description?.toLowerCase().includes('waiting')) {
    const waitMatch = item.description.match(/(?:waiting for (?:review for )?|since last sync )?(\d+(?:\.\d+)?\s*(?:hours?|days?|h|d))/i);
    if (waitMatch) {
      slaNote = `⏱ ${waitMatch[1]} wait`;
    }
  }

  return (
    <Card
      severity={sevNorm}
      selected={isSelected}
      className={`ah-kanban-card ah-kanban-card-${statusNorm}`}
      padding="sm"
    >
      {/* 1. Header: Selection, Severity, Category, Overflow Menu */}
      <div className="ah-kcard-header">
        <div className="ah-kcard-header-left">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              onToggleSelect && onToggleSelect(item.id);
            }}
            className="ah-kcard-checkbox"
            aria-label={`Select action ${item.title}`}
          />
          <Badge variant={sevNorm} dot size="sm">
            {item.severity}
          </Badge>
          <Badge variant="neutral" size="sm">
            {item.category?.replace('_', ' ')}
          </Badge>
        </div>

        {/* Overflow Menu */}
        <div className="ah-kcard-menu-wrapper" ref={menuRef}>
          <IconButton
            icon="⋯"
            ariaLabel={`More actions for ${item.title}`}
            title="More actions"
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
          />
          {menuOpen && (
            <div className="ah-kcard-dropdown" role="menu" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="ah-kcard-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  onInspect(item);
                }}
                role="menuitem"
              >
                🔍 Inspect Details
              </button>
              {item.status !== 'IN_PROGRESS' && (
                <button
                  type="button"
                  className="ah-kcard-menu-item"
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
                  className="ah-kcard-menu-item text-success"
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
                className="ah-kcard-menu-item text-slack"
                onClick={() => {
                  setMenuOpen(false);
                  onNudge(item);
                }}
                role="menuitem"
              >
                💬 Nudge on Slack
              </button>
              {item.status !== 'DISMISSED' && (
                <button
                  type="button"
                  className="ah-kcard-menu-item text-danger"
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

      {/* 2. Title & Problem Description */}
      <div
        className="ah-kcard-body"
        onClick={() => onInspect(item)}
        role="button"
        tabIndex={0}
        aria-label={`Inspect action details: ${item.title}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onInspect(item);
          }
        }}
      >
        <h4 className="ah-kcard-title" title={item.title}>
          {item.title}
        </h4>
        <p className="ah-kcard-desc">{item.description}</p>
      </div>

      {/* 3. Metadata Row: SLA Tag & Assignee */}
      <div className="ah-kcard-meta-row">
        {slaNote ? (
          <span className="ah-kcard-sla-pill" title="Time elapsed / SLA status">
            {slaNote}
          </span>
        ) : (
          <span className="ah-kcard-date-tag">
            {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        )}

        {item.assigneeName && (
          <span className="ah-kcard-owner-pill" title={`Assigned to ${item.assigneeName}`}>
            👤 @{item.assigneeName}
          </span>
        )}
      </div>

      {/* 4. Recommendation Snippet */}
      {item.suggestedAction && (
        <div
          className="ah-kcard-rec-box"
          onClick={() => onInspect(item)}
          role="button"
          tabIndex={0}
          aria-label={`Recommended action: ${item.suggestedAction}. Click to inspect.`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onInspect(item);
            }
          }}
          title="Click to inspect full details"
        >
          <span className="ah-kcard-rec-icon" aria-hidden="true">💡</span>
          <span className="ah-kcard-rec-text">{item.suggestedAction}</span>
        </div>
      )}

      {/* Resolution Notes (if completed) */}
      {item.resolutionNotes && (
        <div className="ah-kcard-resolution-box">
          <span className="ah-kcard-res-label">Resolution:</span> {item.resolutionNotes}
          {item.completedBy && <span className="ah-kcard-res-by"> — {item.completedBy}</span>}
        </div>
      )}

      {/* 5. Footer: Ref Link & Primary CTA */}
      <div className="ah-kcard-footer">
        <div className="ah-kcard-footer-left">
          {item.externalReference?.url ? (
            <a
              href={item.externalReference.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ah-kcard-ref-link"
              onClick={(e) => e.stopPropagation()}
              title={`Open ${item.externalReference.id || 'tool'}`}
            >
              🔗 {item.externalReference.id || 'Link ↗'}
            </a>
          ) : item.externalReference?.id ? (
            <span className="ah-kcard-ref-tag">Ref: {item.externalReference.id}</span>
          ) : null}
        </div>

        <div className="ah-kcard-footer-right">
          <Button
            variant={statusNorm === 'completed' ? 'ghost' : sevNorm === 'critical' ? 'danger' : 'primary'}
            size="sm"
            icon={<span aria-hidden="true">{primaryBtnIcon}</span>}
            onClick={handlePrimaryCTA}
          >
            {primaryBtnLabel}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default ActionCard;
