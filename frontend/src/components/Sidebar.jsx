import React, { useState, useRef, useEffect } from 'react';
import { useGithubSync } from '../hooks/useGithubSync.js';
import logger from '../utils/logger.js';
import './Sidebar.css';

function formatRelativeTime(dateInput) {
  if (!dateInput) return null;
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return null;
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  // Don't show "Just now" — suppress timestamps under 2 minutes
  if (diffMin < 2) return null;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function deriveShortHeader(text) {
  if (!text || typeof text !== 'string') return 'New Chat';
  const clean = text
    .replace(/^#+\s+/gm, '')
    .replace(/[*_`~>]/g, '')
    .replace(/\[Attachment:\s*[^\]]+\]/gi, '')
    .replace(/# Document Executive Context:[^\n]+/gi, '')
    .trim();
  if (!clean) return 'New Chat';
  const firstLine = clean.split('\n')[0].trim();
  if (firstLine.length > 36) {
    return firstLine.slice(0, 34).trim() + '…';
  }
  return firstLine;
}

function SessionItem({ session, isActive, onSwitch, onDelete, onArchive }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const rawTitle = session.active_thread_title;
  const isDefaultTitle = !rawTitle || rawTitle === 'New Chat' || rawTitle === 'Chat';
  const displayTitle = !isDefaultTitle
    ? rawTitle
    : (session.last_message ? deriveShortHeader(session.last_message) : 'New Chat');
  const lastActivity = session.last_active_at || session.updated_at || session.created_at;
  const relTime = formatRelativeTime(lastActivity);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleMenuToggle = (e) => {
    e.stopPropagation();
    setMenuOpen((v) => !v);
  };

  const handleArchive = (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    onArchive(session.id);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    onDelete(session.id);
  };

  return (
    <div className={`session-history-item ${isActive ? 'active' : ''}`} ref={menuRef}>
      <button
        type="button"
        className="session-item-body"
        onClick={() => onSwitch(session.id, session.active_thread_id)}
        title={displayTitle}
      >
        <div className="session-item-header">
          <span className={`session-indicator-dot ${isActive ? 'active-dot' : ''}`} />
          <span className="session-item-title">{displayTitle}</span>
        </div>
        {session.last_message && (
          <p className="session-item-preview">
            {session.last_message.slice(0, 50)}{session.last_message.length > 50 ? '…' : ''}
          </p>
        )}
        {relTime && (
          <div className="session-item-meta">
            <span className="session-item-time">{relTime}</span>
          </div>
        )}
      </button>

      {/* Three-dot menu button — only visible on hover */}
      <button
        type="button"
        className="session-menu-trigger"
        onClick={handleMenuToggle}
        title="More options"
        aria-label="Session options"
      >
        ···
      </button>

      {menuOpen && (
        <div className="session-context-menu">
          <button type="button" className="ctx-menu-item" onClick={handleArchive}>
            <span className="ctx-icon">📦</span> Archive
          </button>
          <button type="button" className="ctx-menu-item ctx-menu-danger" onClick={handleDelete}>
            <span className="ctx-icon">🗑️</span> Delete
          </button>
        </div>
      )}
    </div>
  );
}

function Sidebar({ 
  sessionSummary, 
  sessionsList = [],
  sessionsPagination = { page: 1, limit: 10, total: 0, totalPages: 1, hasNext: false, hasPrev: false },
  isSessionsLoading = false,
  onPageChange,
  onSwitchSession,
  onDeleteSession,
  onArchiveSession,
  isOpen, 
  setIsOpen, 
  onOpenAdmin, 
  onOpenActionHub,
  onNewChat 
}) {
  const { syncStatus, syncMessage } = useGithubSync();
  const [showMetadata, setShowMetadata] = useState(false);
  const [pendingActionsCount, setPendingActionsCount] = useState(0);

  useEffect(() => {
    fetch('/api/actions/summary')
      .then((res) => res.json())
      .then((data) => {
        if (data?.summary?.criticalPending !== undefined) {
          setPendingActionsCount(data.summary.criticalPending + (data.summary.warningPending || 0));
        }
      })
      .catch(() => {});
  }, []);

  const toggleSidebar = () => setIsOpen(!isOpen);

  const startNewChat = async () => {
    logger.info('Starting new chat...');
    if (typeof onNewChat === 'function') {
      await onNewChat();
    } else {
      window.location.reload();
    }
  };

  const currentPage = sessionsPagination.page || 1;
  const totalPages = Math.max(1, sessionsPagination.totalPages || 1);
  const totalSessions = sessionsPagination.total || sessionsList.length || 0;

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className="sidebar-overlay" onClick={toggleSidebar} />
      )}
      
      <aside className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <button className="sidebar-toggle" onClick={toggleSidebar} title="Toggle Sidebar">
            <span className="hamburger-icon">☰</span>
          </button>
          
          <button className="new-chat-btn" onClick={startNewChat} title="Start New Conversation">
            <span className="plus-icon">+</span>
            <span className="new-chat-text">New chat</span>
          </button>
        </div>

        {syncMessage && (
          <div className="sync-toast">{syncMessage}</div>
        )}

        <div className="chat-history">
          {/* Sessions List — no header */}
          <div className="session-items-list">
            {sessionsList.length === 0 && !isSessionsLoading && (
              <div className="empty-sessions-notice">
                <span>💬</span>
                <p>No past sessions found. Start a new chat to begin!</p>
              </div>
            )}

            {sessionsList.map((s) => (
              <SessionItem
                key={s.id}
                session={s}
                isActive={s.id === sessionSummary?.sessionId}
                onSwitch={(sid, tid) => onSwitchSession && onSwitchSession(sid, tid)}
                onDelete={(sid) => onDeleteSession && onDeleteSession(sid)}
                onArchive={(sid) => onArchiveSession && onArchiveSession(sid)}
              />
            ))}
          </div>

          {/* Pagination Controls */}
          {totalSessions > 0 && (
            <div className="sessions-pagination-bar">
              <button
                type="button"
                className="pagination-nav-btn"
                onClick={() => onPageChange && onPageChange(currentPage - 1)}
                disabled={!sessionsPagination.hasPrev || isSessionsLoading || currentPage <= 1}
                title="Previous page"
              >
                ◀ Prev
              </button>
              <span className="pagination-page-label">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                className="pagination-nav-btn"
                onClick={() => onPageChange && onPageChange(currentPage + 1)}
                disabled={!sessionsPagination.hasNext || isSessionsLoading || currentPage >= totalPages}
                title="Next page"
              >
                Next ▶
              </button>
            </div>
          )}

          {/* Collapsible Active Session Diagnostics */}
          <div className="sidebar-collapsible-section">
            <button
              type="button"
              className="collapsible-toggle-btn"
              onClick={() => setShowMetadata(!showMetadata)}
            >
              <span>{showMetadata ? '▼' : '▶'}</span>
              <span>Active Diagnostics</span>
            </button>

            {showMetadata && (
              <div className="collapsible-body">
                <div className="session-card">
                  <div className="session-row">
                    <span className="session-label">Session ID</span>
                    <span className="session-value session-mono">
                      {sessionSummary?.sessionId || 'Loading...'}
                    </span>
                  </div>
                  <div className="session-row">
                    <span className="session-label">Thread ID</span>
                    <span className="session-value session-mono">
                      {sessionSummary?.threadId || 'Pending'}
                    </span>
                  </div>
                </div>

                <div className="session-card github-cache-card" style={{ marginTop: '8px' }}>
                  <div className="session-row">
                    <span className="session-label">PostgreSQL Cache</span>
                    <span className="session-value">
                      {syncStatus?.postgresql?.count ?? 0} issues
                    </span>
                  </div>
                  {syncStatus?.postgresql?.lastSyncedAt && (
                    <div className="session-row">
                      <span className="session-label">Last Synced</span>
                      <span className="session-value session-mono" style={{ fontSize: '11px' }}>
                        {new Date(syncStatus.postgresql.lastSyncedAt).toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">👤</div>
            <div className="user-details">
              <div className="user-name">EM TaskFlow User</div>
              <div className="user-status">PostgreSQL Isolated DB</div>
            </div>
          </div>
          <button
            type="button"
            className="action-hub-sidebar-btn"
            onClick={() => {
              if (typeof onOpenActionHub === 'function') {
                onOpenActionHub();
              } else {
                window.location.href = '/actions';
              }
            }}
            style={{
              marginTop: '10px',
              width: '100%',
              padding: '8px 12px',
              backgroundColor: '#0f172a',
              color: '#38bdf8',
              border: '1px solid #334155',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxSizing: 'border-box',
            }}
            title="Open EM Action Hub & Audit Cockpit"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>📋</span> EM Action Hub
            </span>
            {pendingActionsCount > 0 && (
              <span
                style={{
                  backgroundColor: '#ef4444',
                  color: '#ffffff',
                  borderRadius: '9999px',
                  padding: '2px 7px',
                  fontSize: '11px',
                  fontWeight: '700',
                }}
              >
                {pendingActionsCount}
              </span>
            )}
          </button>
          <a
            href="/admin"
            target="_blank"
            rel="noopener noreferrer"
            className="admin-portal-link-btn"
            style={{
              marginTop: '6px',
              width: '100%',
              padding: '8px 12px',
              backgroundColor: '#1e293b',
              color: '#94a3b8',
              border: '1px solid #334155',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              textDecoration: 'none',
              boxSizing: 'border-box',
            }}
          >
            <span>⚙️</span> Admin Portal ↗
          </a>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
