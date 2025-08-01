import React, { useState } from 'react';
import Chat from './components/Chat';
import PDFUpload from './components/PDFUpload';
import Sidebar from './components/Sidebar';
import './App.css';

function App() {
  const [view, setView] = useState('chat');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="app">
      <Sidebar 
        view={view} 
        setView={setView} 
        isOpen={sidebarOpen} 
        setIsOpen={setSidebarOpen} 
      />
      <main className={`main-content ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        <div className="content-wrapper">
          {view === 'chat' ? <Chat /> : <PDFUpload />}
        </div>
      </main>
    </div>
  );
}

export default App;
