import React, { useState } from 'react';
import axios from 'axios';
import './Chat.css';

function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions] = useState([
    'What should I focus on today?',
    'Do I have any scheduling conflicts?',
    'Show me my pending tasks',
    'What meetings do I have today?'
  ]);

  const formatMessage = (text) => {
    // Parse <think> tags and make them grey
    return text.replace(/<think>([\s\S]*?)<\/think>/g, '<span class="think-content">$1</span>');
  };

  const sendMessage = async () => {
    if (!input) return;
    setMessages([...messages, { sender: 'user', text: input }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/rag-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: input }),
      });
      const data = await res.json();
      setMessages((msgs) => [
        ...msgs,
        { sender: 'bot', text: data.answer, sources: data.sources }
      ]);
    } catch (err) {
      setMessages((msgs) => [
        ...msgs,
        { sender: 'bot', text: 'Error getting answer.' }
      ]);
    }
    setLoading(false);
  };

  const handleSuggestionClick = (suggestion) => {
    sendMessage(null, suggestion);
  };

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`chat-message ${msg.sender}`}>
            <div>{msg.text}</div>
            {msg.sender === 'bot' && msg.sources && msg.sources.length > 0 && (
              <div className="chat-sources">
                <strong>Sources:</strong>
                <ul>
                  {msg.sources.map((src, i) => (
                    <li key={i}>{src.filename} (chunk {src.chunk_index + 1})</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
        {loading && <div className="chat-message bot">Loading...</div>}
      </div>
      <div className="chat-input">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' ? sendMessage() : null}
          placeholder="Type your question..."
        />
        <button onClick={sendMessage} disabled={loading || !input}>Send</button>
      </div>
    </div>
  );
};

export default Chat;