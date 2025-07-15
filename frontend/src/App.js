import React, { useState } from 'react';
import Chat from './components/Chat';
import PDFUpload from './components/PDFUpload';
import NavBar from './components/NavBar';
import './App.css';

function App() {
  const [view, setView] = useState('chat');

  return (
    <div>
      <NavBar setView={setView} view={view} />
      <div style={{ margin: '20px' }}>
        <button onClick={() => setView('chat')} disabled={view === 'chat'}>Chat</button>
        <button onClick={() => setView('pdf')} disabled={view === 'pdf'}>PDF Upload</button>
      </div>
      {view === 'chat' ? <Chat /> : <PDFUpload />}
    </div>
  );
}

export default App;
