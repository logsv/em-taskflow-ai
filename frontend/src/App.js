import React, { useState } from 'react';
import Chat from './components/Chat';
import SummaryList from './components/SummaryList';
import NavBar from './components/NavBar';
import './App.css';

function App() {
  const [view, setView] = useState('chat');

  return (
    <div className="App">
      <NavBar setView={setView} currentView={view} />
      <main>
        {view === 'chat' ? <Chat /> : <SummaryList />}
      </main>
    </div>
  );
}

export default App;
