import React, { useEffect, useState } from 'react';
import './Sidebar.css';

function Sidebar({ view, setView, isOpen, setIsOpen }) {
  const [chatHistory, setChatHistory] = useState([]);

  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  const startNewChat = () => {
    // In a real app, this would create a new chat session
    console.log('Starting new chat...');
  };

  useEffect(() => {
    let isMounted = true;
    async function loadThreads() {
      try {
        const response = await fetch('/api/threads?limit=20');
        const data = await response.json();
        if (!isMounted) return;
        const threads = Array.isArray(data?.threads) ? data.threads : [];
        setChatHistory(
          threads.map((thread) => ({
            id: thread.id,
            title: thread.title || (thread.last_user_message || 'New Chat'),
            date: new Date(thread.updated_at || thread.created_at || Date.now()).toLocaleDateString(),
          })),
        );
      } catch (error) {
        if (isMounted) {
          setChatHistory([]);
        }
      }
    }
    loadThreads();
    return () => {
      isMounted = false;
    };
  }, []);

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
              className={`nav-item ${view === 'chat' ? 'active' : ''}`}
              onClick={() => setView('chat')}
            >
              <span className="nav-icon">💬</span>
              <span className="nav-text">Chat</span>
            </button>
            
            <button 
              className={`nav-item ${view === 'pdf' ? 'active' : ''}`}
              onClick={() => setView('pdf')}
            >
              <span className="nav-icon">📄</span>
              <span className="nav-text">Upload</span>
            </button>
          </div>
        </nav>

        <div className="chat-history">
          <div className="history-header">
            <h3>Recent Chats</h3>
          </div>
          
          <div className="history-list">
            {chatHistory.map((chat) => (
              <button key={chat.id} className="history-item">
                <div className="history-title">{chat.title}</div>
                <div className="history-date">{chat.date}</div>
              </button>
            ))}
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
