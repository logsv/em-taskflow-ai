import React, { useState } from 'react';
import axios from 'axios';
import './Chat.css';

function Chat() {
  const [messages, setMessages] = useState([
    { sender: 'ai', text: 'Hi! I am your EM TaskFlow AI assistant. Ask me anything about your tasks, projects, or meetings.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    const userMsg = { sender: 'user', text: input };
    setMessages(msgs => [...msgs, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const res = await axios.post('/api/llm-summary', { prompt: input });
      setMessages(msgs => [...msgs, { sender: 'ai', text: res.data.summary }]);
    } catch {
      setMessages(msgs => [...msgs, { sender: 'ai', text: 'Sorry, I could not process your request.' }]);
    }
    setLoading(false);
  };

  return (
    <div className="chat-container">
      <div className="chat-history">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg ${msg.sender}`}>{msg.text}</div>
        ))}
        {loading && <div className="chat-msg ai">Thinking...</div>}
      </div>
      <form className="chat-input" onSubmit={sendMessage}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask me about your tasks, projects, or meetings..."
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()}>Send</button>
      </form>
    </div>
  );
}

export default Chat; 