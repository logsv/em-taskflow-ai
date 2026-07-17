import React, { useState, useEffect } from 'react';
import Chat from './components/Chat';
import PDFUpload from './components/PDFUpload';
import Sidebar from './components/Sidebar';
import './App.css';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sessionSummary, setSessionSummary] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function loadSession() {
      try {
        const response = await fetch('/api/session');
        const data = await response.json();
        if (!isMounted) return;
        setSessionSummary({
          sessionId: data?.sessionId || null,
          threadId: data?.threadId || null,
          created: !!data?.created,
        });
      } catch (error) {
        console.error('Failed to fetch session:', error);
      }
    }
    loadSession();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className={`app ${drawerOpen ? 'drawer-open' : ''}`}>
      <Sidebar 
        sessionSummary={sessionSummary}
        isDrawerOpen={drawerOpen}
        setIsDrawerOpen={setDrawerOpen}
        isOpen={sidebarOpen} 
        setIsOpen={setSidebarOpen} 
      />
      <main className={`main-content ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        <div className="content-wrapper">
          <Chat 
            sessionSummary={sessionSummary}
            setSessionSummary={setSessionSummary}
            isDrawerOpen={drawerOpen}
            setIsDrawerOpen={setDrawerOpen}
          />
        </div>
      </main>

      <div className={`pdf-drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="pdf-drawer-header">
          <h3>📄 PDF Documents</h3>
          <button className="close-drawer-btn" onClick={() => setDrawerOpen(false)}>✕</button>
        </div>
        <div className="pdf-drawer-content">
          <PDFUpload />
        </div>
      </div>
    </div>
  );
}

export default App;
