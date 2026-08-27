import React, { useState, useEffect } from 'react';
import { Button } from '../ui';
import './BulkActionBar.css';

/**
 * Standardized Floating Bulk Actions Toolbar
 * Renders when multiple action items are selected
 */
export function BulkActionBar({
  selectedCount = 0,
  onUpdateStatus,
  onShareSlack,
  onClear,
}) {
  const [isBusy, setIsBusy] = useState(false);

  // ESC key clears selection
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && selectedCount > 0) {
        onClear();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCount, onClear]);

  if (selectedCount === 0) return null;

  const handleAction = async (status) => {
    setIsBusy(true);
    try {
      await onUpdateStatus(status);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div
      className="ah-bulk-toolbar-container"
      role="toolbar"
      aria-label="Bulk actions toolbar for selected action items"
    >
      <div className="ah-bulk-toolbar">
        {/* Selection Count Pill */}
        <div className="ah-bulk-count-group">
          <span className="ah-bulk-count-pill">{selectedCount}</span>
          <span className="ah-bulk-count-text">selected</span>
        </div>

        <div className="ah-bulk-divider" aria-hidden="true" />

        {/* Action Buttons */}
        <div className="ah-bulk-actions-group">
          <Button
            variant="secondary"
            size="sm"
            disabled={isBusy}
            icon={<span aria-hidden="true">⏳</span>}
            onClick={() => handleAction('IN_PROGRESS')}
            title="Mark selected actions as In Progress"
          >
            In Progress
          </Button>

          <Button
            variant="primary"
            size="sm"
            disabled={isBusy}
            icon={<span aria-hidden="true">✅</span>}
            onClick={() => handleAction('COMPLETED')}
            title="Mark selected actions as Resolved"
          >
            Resolve
          </Button>

          <Button
            variant="slack"
            size="sm"
            disabled={isBusy}
            icon={<span aria-hidden="true">💬</span>}
            onClick={onShareSlack}
            title="Post executive summary of selected actions to Slack"
          >
            Share to Slack
          </Button>

          <Button
            variant="danger"
            size="sm"
            disabled={isBusy}
            icon={<span aria-hidden="true">🚫</span>}
            onClick={() => handleAction('DISMISSED')}
            title="Dismiss selected actions"
          >
            Dismiss
          </Button>
        </div>

        <div className="ah-bulk-divider" aria-hidden="true" />

        {/* Deselect All */}
        <button
          type="button"
          className="ah-bulk-clear-btn"
          onClick={onClear}
          disabled={isBusy}
          aria-label="Deselect all items"
          title="Clear selection (Esc)"
        >
          ✕ Clear
        </button>
      </div>
    </div>
  );
}

export default BulkActionBar;
