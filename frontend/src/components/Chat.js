import React, { useState, useRef } from 'react';
import './Chat.css';

function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const fileInputRef = useRef(null);
  const [suggestions] = useState([
    'What should I focus on today?',
    'Do I have any scheduling conflicts?',
    'Show me my pending tasks',
    'What meetings do I have today?'
  ]);

  const formatMessage = (text) => {
    const safeText =
      typeof text === 'string' ? text : text == null ? '' : String(text);
    return safeText.replace(
      /<think>([\s\S]*?)<\/think>/g,
      '<span class="think-content">$1</span>'
    );
  };

  const sendMessage = async (customMessage = null) => {
    const messageText = customMessage || input;
    if (!messageText.trim()) return;
    
    setMessages(prev => [...prev, { sender: 'user', text: messageText, timestamp: new Date() }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/rag-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: messageText }),
      });
      const data = await res.json();

      if (!res.ok) {
        const errorText =
          data && typeof data.error === 'string' && data.error.trim()
            ? data.error
            : 'I apologize, but I encountered an error while generating a response. Please try again.';

        setMessages(prev => [
          ...prev,
          {
            sender: 'assistant',
            text: errorText,
            timestamp: new Date()
          }
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          {
            sender: 'assistant',
            text: data && typeof data.answer === 'string' && data.answer.trim()
              ? data.answer
              : 'No response generated.',
            sources: Array.isArray(data?.sources) ? data.sources : [],
            timestamp: new Date()
          }
        ]);
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { 
          sender: 'assistant', 
          text: 'I apologize, but I encountered an error while generating a response. Please try again.',
          timestamp: new Date()
        }
      ]);
    }
    setLoading(false);
  };

  const handleSuggestionClick = (suggestion) => {
    sendMessage(suggestion);
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setUploadStatus('Please select a PDF file.');
      setTimeout(() => setUploadStatus(''), 3000);
      return;
    }

    setUploadStatus('Uploading...');
    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const res = await fetch('/api/upload-pdf', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      
      if (data.status === 'success') {
        setUploadStatus(`File uploaded successfully! (${data.chunks} chunks processed)`);
        setMessages(prev => [
          ...prev,
          { 
            sender: 'system', 
            text: `📄 File "${file.name}" has been uploaded and processed. You can now ask questions about its content.`,
            timestamp: new Date()
          }
        ]);
        setTimeout(() => setUploadStatus(''), 5000);
      } else {
        setUploadStatus('Upload failed. Please try again.');
        setTimeout(() => setUploadStatus(''), 3000);
      }
    } catch (err) {
      setUploadStatus('Error uploading PDF. Please try again.');
      setTimeout(() => setUploadStatus(''), 3000);
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="chat-container">
      {messages.length === 0 && (
        <div className="welcome-screen">
          <div className="welcome-content">
            <div className="logo">
              <div className="logo-icon">🤖</div>
              <h1>EM TaskFlow AI</h1>
            </div>
            <p className="welcome-subtitle">How can I help you today?</p>
            
            <div className="suggestion-grid">
              {suggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  className="suggestion-card"
                  onClick={() => handleSuggestionClick(suggestion)}
                  disabled={loading}
                >
                  <span className="suggestion-icon">💡</span>
                  <span className="suggestion-text">{suggestion}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="chat-messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message-wrapper ${msg.sender}`}>
            <div className="message-content">
              <div className="message-avatar">
                {msg.sender === 'user' ? '👤' : msg.sender === 'assistant' ? '🤖' : '📄'}
              </div>
              <div className="message-body">
                <div 
                  className="message-text"
                  dangerouslySetInnerHTML={{ __html: formatMessage(msg.text) }}
                />
                {msg.sender === 'assistant' && msg.sources && msg.sources.length > 0 && (
                  <div className="message-sources">
                    <details>
                      <summary>Sources ({msg.sources.length})</summary>
                      <ul>
                        {msg.sources.map((src, i) => (
                          <li key={i}>{src.filename} (chunk {src.chunk_index + 1})</li>
                        ))}
                      </ul>
                    </details>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="message-wrapper assistant">
            <div className="message-content">
              <div className="message-avatar">🤖</div>
              <div className="message-body">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="chat-input-container">
        {uploadStatus && (
          <div className="upload-status">
            {uploadStatus}
          </div>
        )}
        
        <div className="chat-input-wrapper">
          <div className="chat-input">
            <button 
              className="attachment-btn"
              onClick={triggerFileUpload}
              title="Upload PDF"
            >
              📎
            </button>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Message EM TaskFlow AI..."
              rows="1"
              disabled={loading}
            />
            <button 
              className="send-btn"
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
            >
              {loading ? '⏳' : '➤'}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
        </div>
        
        <div className="input-footer">
          <p>EM TaskFlow AI can make mistakes. Consider checking important information.</p>
        </div>
      </div>
    </div>
  );
}

export default Chat;
