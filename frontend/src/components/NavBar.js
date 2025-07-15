import React from 'react';
import './NavBar.css';

function NavBar({ setView, view }) {
  return (
    <nav className="navbar">
      <div className="navbar-title">EM TaskFlow</div>
      <div className="navbar-toggle">
        <button onClick={() => setView('chat')} disabled={view === 'chat'}>Chat</button>
        <button onClick={() => setView('pdf')} disabled={view === 'pdf'}>PDF Upload</button>
      </div>
    </nav>
  );
}

export default NavBar;