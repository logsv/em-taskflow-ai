import React from 'react';
import './Sidebar.css';

function Sidebar({ sessionSummary, isDrawerOpen, setIsDrawerOpen, isOpen, setIsOpen }) {
  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  const startNewChat = () => {
    // In a real app, this would create a new chat session
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
          </div>
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
