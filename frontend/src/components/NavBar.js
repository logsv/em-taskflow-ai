import React from 'react';
import './NavBar.css';

function NavBar({ setView, view }) {
  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <div className="brand-logo">🤖</div>
        <div className="brand-text">
          <h1 className="navbar-title">EM TaskFlow</h1>
        </div>
      </div>
      <div className="navbar-nav">
        <button 
          className={`nav-button ${view === 'chat' ? 'active' : ''}`}
          onClick={() => setView('chat')}
        >
          Chat
        </button>
        <button 
          className={`nav-button ${view === 'pdf' ? 'active' : ''}`}
          onClick={() => setView('pdf')}
        >
          Upload
        </button>
      </div>
    </nav>
  );
}

export default NavBar;