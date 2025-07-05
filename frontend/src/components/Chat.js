import React, { useState } from 'react';
import axios from 'axios';
import './Chat.css';

function Chat() {
  const [messages, setMessages] = useState([
    { 
      sender: 'ai', 
      text: 'Hi! I am your EM TaskFlow AI assistant. I can help you with:\n\n• Getting priorities: "What should I focus on today?"\n• Task updates: "Mark PROJ-123 as done"\n• Meeting conflicts: "Do I have any scheduling conflicts?"\n• Project summaries: "What\'s the status of my Notion projects?"\n\nWhat would you like to know?',
      timestamp: new Date().toLocaleTimeString()
    }
  ]);
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

  const sendMessage = async (e, messageText = null) => {
    e?.preventDefault();
    const message = messageText || input;
    if (!message.trim()) return;
    
    const userMsg = { 
      sender: 'user', 
      text: message, 
      timestamp: new Date().toLocaleTimeString() 
    };
    setMessages(msgs => [...msgs, userMsg]);
    setInput('');
    setLoading(true);
    
    try {
      const res = await axios.post('/api/llm-summary', { prompt: message });
      setMessages(msgs => [...msgs, { 
        sender: 'ai', 
        text: res.data.response,
        timestamp: new Date().toLocaleTimeString()
      }]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMsg = error.response?.data?.error || 'Sorry, I could not process your request. Please try again.';
      setMessages(msgs => [...msgs, { 
        sender: 'ai', 
        text: errorMsg,
        timestamp: new Date().toLocaleTimeString()
      }]);
    }
    setLoading(false);
  };

  const handleSuggestionClick = (suggestion) => {
    sendMessage(null, suggestion);
  };

  return (
    <div className="chat-container">
      <div className="chat-history">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg ${msg.sender}`}>
            <div 
              className="msg-content" 
              dangerouslySetInnerHTML={{ __html: formatMessage(msg.text) }}
            ></div>
            {msg.timestamp && <div className="msg-timestamp">{msg.timestamp}</div>}
          </div>
        ))}
        {loading && <div className="chat-msg ai">Thinking...</div>}
      </div>
      
      {/* Quick suggestion buttons */}
      {messages.length === 1 && (
        <div className="suggestions">
          <div className="suggestions-label">Try these:</div>
          {suggestions.map((suggestion, i) => (
            <button 
              key={i} 
              className="suggestion-btn" 
              onClick={() => handleSuggestionClick(suggestion)}
              disabled={loading}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
      
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