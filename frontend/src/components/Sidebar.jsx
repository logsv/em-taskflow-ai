import React, { useState, useRef, useEffect } from 'react';
import { apiUrl } from '../services/apiClient.js';
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
            {session.last_message.slice(0, 48)}{session.last_message.length > 48 ? '…' : ''}
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
  onOpenDevSettings,
  onOpenQuickActions,
  onNewChat 
}) {
  const [pendingActionsCount, setPendingActionsCount] = useState(0);

  useEffect(() => {
    fetch(apiUrl('/actions/summary'))
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
        {/* Brand & New Chat */}
        <div className="sidebar-header">
          <button className="sidebar-toggle" onClick={toggleSidebar} title="Toggle Sidebar">
            <span className="hamburger-icon">☰</span>
          </button>
          
          <button className="new-chat-btn" onClick={startNewChat} title="Start New Conversation">
            <span className="plus-icon">+</span>
            <span className="new-chat-text">New chat</span>
          </button>
        </div>

        <div className="sidebar-scrollable-content">
          {/* Section: WORKSPACE */}
          <div className="sidebar-nav-section">
            <div className="sidebar-section-label">WORKSPACE</div>
            <div className="sidebar-nav-items">
              <button
                type="button"
                className="sidebar-nav-link active"
                onClick={startNewChat}
                title="Overview & Chat Copilot"
              >
                <span className="nav-item-icon">💬</span>
                <span className="nav-item-text">Overview</span>
              </button>

              <button
                type="button"
                className="sidebar-nav-link"
                onClick={() => {
                  if (typeof onOpenQuickActions === 'function') {
                    onOpenQuickActions();
                  }
                }}
                title="Quick Actions (Cmd+K)"
              >
                <span className="nav-item-icon">⚡</span>
                <span className="nav-item-text">Quick Actions</span>
                <span className="nav-shortcut-badge">⌘K</span>
              </button>

              <button
                type="button"
                className="sidebar-nav-link"
                onClick={() => {
                  if (typeof onOpenActionHub === 'function') {
                    onOpenActionHub();
                  } else {
                    window.location.href = '/actions';
                  }
                }}
                title="EM Action Hub & Audit Cockpit"
              >
                <span className="nav-item-icon">📋</span>
                <span className="nav-item-text">Action Items</span>
                {pendingActionsCount > 0 && (
                  <span className="nav-pending-badge">
                    {pendingActionsCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Section: RECENT */}
          <div className="sidebar-history-section">
            <div className="sidebar-section-label">RECENT</div>

            <div className="session-items-list">
              {sessionsList.length === 0 && !isSessionsLoading && (
                <div className="empty-sessions-notice">
                  <p>No recent conversations.</p>
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
            {totalSessions > 0 && totalPages > 1 && (
              <div className="sessions-pagination-bar">
                <button
                  type="button"
                  className="pagination-nav-btn"
                  onClick={() => onPageChange && onPageChange(currentPage - 1)}
                  disabled={!sessionsPagination.hasPrev || isSessionsLoading || currentPage <= 1}
                  title="Previous page"
                >
                  ◀
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
                  ▶
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Footer: User & Settings */}
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">👔</div>
            <div className="user-details">
              <div className="user-name">Engineering Manager</div>
              <div className="user-status">TaskFlow AI Copilot</div>
            </div>
          </div>

          <button
            type="button"
            className="sidebar-settings-btn"
            onClick={() => {
              if (typeof onOpenDevSettings === 'function') {
                onOpenDevSettings();
              } else if (typeof onOpenAdmin === 'function') {
                onOpenAdmin();
              }
            }}
            title="Settings & Developer Tools"
          >
            <span>⚙️</span>
            <span>Settings & Tools</span>
          </button>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
