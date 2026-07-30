import React, { useState, useEffect } from 'react';
import './Sidebar.css';

function Sidebar({ sessionSummary, isDrawerOpen, setIsDrawerOpen, isOpen, setIsOpen }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncMessage, setSyncMessage] = useState('');

  const fetchSyncStatus = async () => {
    try {
      const res = await fetch('/api/github/sync-status');
      if (res.ok) {
        const data = await res.json();
        setSyncStatus(data);
      }
    } catch (err) {
      console.warn('Failed to fetch GitHub sync status:', err);
    }
  };

  useEffect(() => {
    fetchSyncStatus();
  }, []);

  const handleGithubSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncMessage('Syncing GitHub issues...');

    try {
      const res = await fetch('/api/github/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: 'logsv/em-taskflow-ai' }),
      });
      const data = await res.json();

      if (data.success) {
        setSyncMessage(`Synced ${data.count} issue(s)!`);
        await fetchSyncStatus();
      } else {
        setSyncMessage(`Sync failed: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      setSyncMessage(`Error syncing GitHub data`);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncMessage(''), 4000);
    }
  };

  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  const startNewChat = () => {
    console.log('Starting new chat...');
    window.location.reload();
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

        <nav className="sidebar-nav">
          <div className="nav-section">
            <button 
              className="nav-item active"
              onClick={() => setIsDrawerOpen(false)}
            >
              <span className="nav-icon">💬</span>
              <span className="nav-text">Chat</span>
            </button>
            
            <button 
              className={`nav-item ${isDrawerOpen ? 'active' : ''}`}
              onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            >
              <span className="nav-icon">📄</span>
              <span className="nav-text">PDF Docs</span>
            </button>

            {/* Refresh GitHub Data Action Button */}
            <button 
              className={`nav-item github-refresh-btn ${isSyncing ? 'syncing' : ''}`}
              onClick={handleGithubSync}
              disabled={isSyncing}
              title="Sync live GitHub issues into PostgreSQL / CSV cache"
            >
              <span className={`nav-icon sync-icon ${isSyncing ? 'spin' : ''}`}>🔄</span>
              <span className="nav-text">{isSyncing ? 'Syncing...' : 'Refresh GitHub Data'}</span>
            </button>
          </div>
          {syncMessage && (
            <div className="sync-toast">{syncMessage}</div>
          )}
        </nav>

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
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
