import React from 'react';
import { useGithubSync } from '../hooks/useGithubSync.js';
import logger from '../utils/logger.js';
import './Sidebar.css';

function Sidebar({ sessionSummary, isOpen, setIsOpen, onOpenAdmin, onNewChat }) {
  const { syncStatus, syncMessage } = useGithubSync();

  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  const startNewChat = async () => {
    logger.info('Starting new chat...');
    if (typeof onNewChat === 'function') {
      await onNewChat();
    } else {
      window.location.reload();
    }
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className="sidebar-overlay" onClick={toggleSidebar} />
      )}
      
      <aside className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <button className="sidebar-toggle" onClick={toggleSidebar}>
            <span className="hamburger-icon">☰</span>
          </button>
          
          <button className="new-chat-btn" onClick={startNewChat}>
            <span className="plus-icon">+</span>
            <span className="new-chat-text">New chat</span>
          </button>
        </div>

        {syncMessage && (
          <div className="sync-toast">{syncMessage}</div>
        )}

        <div className="chat-history">
          <div className="history-header">
            <h3>Session</h3>
          </div>

          <div className="session-card">
            <div className="session-row">
              <span className="session-label">Status</span>
              <span className="session-value">
                {sessionSummary?.created ? 'New session' : 'Active session'}
              </span>
            </div>
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

          {/* GitHub Cache Info Card */}
          <div className="history-header" style={{ marginTop: '16px' }}>
            <h3>GitHub DB Cache</h3>
          </div>
          <div className="session-card github-cache-card">
            <div className="session-row">
              <span className="session-label">PostgreSQL</span>
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

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">👤</div>
            <div className="user-details">
              <div className="user-name">EM TaskFlow User</div>
              <div className="user-status">Free Plan</div>
            </div>
          </div>
          <a
            href="/admin"
            onClick={(e) => {
              e.preventDefault();
              if (onOpenAdmin) onOpenAdmin();
            }}
            className="admin-portal-link-btn"
            style={{
              marginTop: '10px',
              width: '100%',
              padding: '8px 12px',
              backgroundColor: '#1e293b',
              color: '#38bdf8',
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
