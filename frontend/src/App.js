import React, { useState } from 'react';
import Chat from './components/Chat';
import SummaryList from './components/SummaryList';
import './App.css';

function App() {
  const [view, setView] = useState('chat');

  return (
    <div className="App">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>EM TaskFlow AI</h1>
        <div>
          <button onClick={() => setView('chat')} disabled={view === 'chat'}>Chat</button>
          <button onClick={() => setView('summary')} disabled={view === 'summary'}>Summary</button>
        </div>
      </header>
      <main>
        {view === 'chat' ? <Chat /> : <SummaryList />}
      </main>
    </div>
  );
}

export default App;
