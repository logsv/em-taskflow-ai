import React from 'react';
import './NavBar.css';

function NavBar({ setView, currentView }) {
  return (
    <nav className="navbar">
      <div className="navbar-brand">EM TaskFlow AI</div>
      <ul className="navbar-nav">
        <li className="nav-item">
          <button 
            className={`nav-link ${currentView === 'chat' ? 'active' : ''}`}
            onClick={() => setView('chat')}
          >
            Chat
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${currentView === 'summary' ? 'active' : ''}`}
            onClick={() => setView('summary')}
          >
            Summary
          </button>
        </li>
        {/* Add more navigation items here if needed */}
      </ul>
    </nav>
  );
}

export default NavBar;