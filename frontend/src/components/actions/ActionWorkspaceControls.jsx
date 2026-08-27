import React, { useState, useRef, useEffect } from 'react';
import { Button, Badge } from '../ui';
import './ActionWorkspaceControls.css';

/**
 * Standardized Action Workspace Controls
 * Search bar + Filter Popover + Active Filter Chips + Kanban/List Switcher
 */
export function ActionWorkspaceControls({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  severityFilter,
  onSeverityFilterChange,
  onResetFilters,
  viewMode,
  onViewModeChange,
}) {
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const popoverRef = useRef(null);

  // Calculate active filter count
  const activeFiltersCount =
    (statusFilter !== 'ALL' ? 1 : 0) +
    (categoryFilter !== 'ALL' ? 1 : 0) +
    (severityFilter !== 'ALL' ? 1 : 0);

  // Close popover on outside click
  useEffect(() => {
    if (!filterPopoverOpen) return;
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setFilterPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [filterPopoverOpen]);

  const hasAnyActiveFilters = activeFiltersCount > 0 || !!searchQuery;

  return (
    <div className="ah-controls-container">
      {/* Top Bar: Search Input, Filter Button, View Switcher */}
      <div className="ah-controls-bar">
        {/* Always-visible Search Input */}
        <div className="ah-search-box">
          <span className="ah-search-icon" aria-hidden="true">🔍</span>
          <input
            type="text"
            className="ah-search-input"
            placeholder="Search actions by title, engineer, PR, or category..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search actions"
          />
          {searchQuery && (
            <button
              type="button"
              className="ah-search-clear-btn"
              onClick={() => onSearchChange('')}
              aria-label="Clear search input"
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {/* Right Controls: Filter Popover Trigger + View Switcher */}
        <div className="ah-controls-right">
          {/* Filter Popover Trigger */}
          <div className="ah-filter-popover-wrapper" ref={popoverRef}>
            <Button
              variant={activeFiltersCount > 0 ? 'primary' : 'secondary'}
              size="md"
              icon={<span aria-hidden="true">⚡</span>}
              rightIcon={<span aria-hidden="true" className="ah-filter-caret">▾</span>}
              onClick={() => setFilterPopoverOpen(!filterPopoverOpen)}
              title="Open filter settings"
            >
              Filter {activeFiltersCount > 0 && `(${activeFiltersCount})`}
            </Button>

            {/* Filter Popover Dropdown */}
            {filterPopoverOpen && (
              <div className="ah-filter-popover" role="dialog" aria-label="Action Filters">
                <div className="ah-filter-popover-header">
                  <span className="ah-filter-popover-title">Filter Actions</span>
                  {activeFiltersCount > 0 && (
                    <button
                      type="button"
                      className="ah-filter-reset-link"
                      onClick={() => {
                        onResetFilters();
                        setFilterPopoverOpen(false);
                      }}
                    >
                      Reset all
                    </button>
                  )}
                </div>

                <div className="ah-filter-popover-body">
                  {/* 1. Status Filter */}
                  <div className="ah-filter-section">
                    <label className="ah-filter-label" htmlFor="filter-status-select">Status</label>
                    <select
                      id="filter-status-select"
                      value={statusFilter}
                      onChange={(e) => onStatusFilterChange(e.target.value)}
                      className="ah-filter-select"
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="PENDING">Pending Triage</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="DISMISSED">Dismissed</option>
                    </select>
                  </div>

                  {/* 2. Severity Filter */}
                  <div className="ah-filter-section">
                    <label className="ah-filter-label" htmlFor="filter-severity-select">Severity</label>
                    <select
                      id="filter-severity-select"
                      value={severityFilter}
                      onChange={(e) => onSeverityFilterChange(e.target.value)}
                      className="ah-filter-select"
                    >
                      <option value="ALL">All Severities</option>
                      <option value="CRITICAL">🚨 Critical Only</option>
                      <option value="WARNING">⚠️ Warning</option>
                      <option value="INFO">ℹ️ Info</option>
                    </select>
                  </div>

                  {/* 3. Category Filter */}
                  <div className="ah-filter-section">
                    <label className="ah-filter-label" htmlFor="filter-category-select">Category</label>
                    <select
                      id="filter-category-select"
                      value={categoryFilter}
                      onChange={(e) => onCategoryFilterChange(e.target.value)}
                      className="ah-filter-select"
                    >
                      <option value="ALL">All Categories</option>
                      <option value="DELIVERY">Delivery & PRs</option>
                      <option value="PEOPLE">People & 1-on-1s</option>
                      <option value="OKR_VELOCITY">OKRs & Sprint</option>
                      <option value="SOP_COMPLIANCE">SOP & ADR Governance</option>
                    </select>
                  </div>
                </div>

                <div className="ah-filter-popover-footer">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setFilterPopoverOpen(false)}
                    className="w-full"
                  >
                    Done
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Segmented View Switcher (Kanban | List) */}
          <div className="ah-view-switcher" role="group" aria-label="View switching">
            <button
              type="button"
              className={`ah-view-btn ${viewMode === 'kanban' ? 'active' : ''}`}
              onClick={() => onViewModeChange('kanban')}
              title="Kanban Board View"
              aria-pressed={viewMode === 'kanban'}
            >
              <span aria-hidden="true">🗂️</span>
              <span>Kanban</span>
            </button>
            <button
              type="button"
              className={`ah-view-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => onViewModeChange('table')}
              title="Dense Table / List View"
              aria-pressed={viewMode === 'table'}
            >
              <span aria-hidden="true">📑</span>
              <span>List</span>
            </button>
          </div>
        </div>
      </div>

      {/* Active Filter Chips Strip */}
      {hasAnyActiveFilters && (
        <div className="ah-active-chips-strip" aria-label="Active filters">
          <span className="ah-chips-label">Active filters:</span>

          {searchQuery && (
            <span className="ah-filter-chip">
              <span>Query: "{searchQuery}"</span>
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="ah-chip-remove"
                aria-label="Remove search filter"
              >
                ×
              </button>
            </span>
          )}

          {statusFilter !== 'ALL' && (
            <span className="ah-filter-chip">
              <span>Status: {statusFilter.replace('_', ' ')}</span>
              <button
                type="button"
                onClick={() => onStatusFilterChange('ALL')}
                className="ah-chip-remove"
                aria-label="Remove status filter"
              >
                ×
              </button>
            </span>
          )}

          {severityFilter !== 'ALL' && (
            <span className="ah-filter-chip ah-chip-sev">
              <span>Severity: {severityFilter}</span>
              <button
                type="button"
                onClick={() => onSeverityFilterChange('ALL')}
                className="ah-chip-remove"
                aria-label="Remove severity filter"
              >
                ×
              </button>
            </span>
          )}

          {categoryFilter !== 'ALL' && (
            <span className="ah-filter-chip">
              <span>Category: {categoryFilter.replace('_', ' ')}</span>
              <button
                type="button"
                onClick={() => onCategoryFilterChange('ALL')}
                className="ah-chip-remove"
                aria-label="Remove category filter"
              >
                ×
              </button>
            </span>
          )}

          <button
            type="button"
            className="ah-clear-all-link"
            onClick={onResetFilters}
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

export default ActionWorkspaceControls;
