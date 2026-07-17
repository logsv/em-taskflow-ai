import React, { useState, useRef } from 'react';
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react';
import './Chat.css';

function Chat({ sessionSummary, setSessionSummary, isDrawerOpen, setIsDrawerOpen }) {
  const [input, setInput] = useState('');
  const [useAdvancedMode, setUseAdvancedMode] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const fileInputRef = useRef(null);
  
  const [feedbackSent, setFeedbackSent] = useState({}); // { messageIndex: 'thumbs_up' | 'thumbs_down' }
  const [sourcesMap, setSourcesMap] = useState({}); // { messageIndex: [...] }

  const [suggestions] = useState([
    'What should I focus on today?',
    'Do I have any scheduling conflicts?',
    'Show me my pending tasks',
    'What meetings do I have today?'
  ]);

  // Local runtime adapter definition
  const adapter = {
    async *run({ messages, abortSignal }) {
      const userMsg = messages[messages.length - 1];
      const textContent = userMsg.content[0]?.text || '';
      
      const payload = {
        message: textContent,
        mode: useAdvancedMode ? 'advanced' : 'baseline',
      };
      if (sessionSummary?.threadId) {
        payload.threadId = sessionSummary.threadId;
      }
      
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortSignal,
      });
      const data = await res.json();
      
      if (data?.threadId && data.threadId !== sessionSummary?.threadId) {
        setSessionSummary(prev => ({
          ...prev,
          threadId: data.threadId,
        }));
      }

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to get response');
      }

      // Map sources to assistant message index (messages.length)
      const assistantMessageIndex = messages.length;
      if (data?.sources) {
        setSourcesMap(prev => ({
          ...prev,
          [assistantMessageIndex]: data.sources,
        }));
      }

      yield {
        content: [{ type: 'text', text: data.answer || 'No response generated.' }]
      };
    }
  };

  const runtime = useLocalRuntime(adapter);
  const { messages, append, isLoading } = runtime;

  const sendMessage = (customMessage = null) => {
    const messageText = customMessage || input;
    if (!messageText.trim() || isLoading) return;
    
    append({
      role: 'user',
      content: [{ type: 'text', text: messageText }]
    });
    
    setInput('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
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
      const res = await fetch('/api/rag/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      
      if (data.status === 'success') {
        setUploadStatus(`File uploaded successfully! (${data.chunks} chunks processed)`);
        append({
          role: 'system',
          content: [{ type: 'text', text: `📄 File "${file.name}" has been uploaded and processed.` }]
        });
        setTimeout(() => setUploadStatus(''), 5000);
      } else {
        setUploadStatus('Upload failed. Please try again.');
        setTimeout(() => setUploadStatus(''), 3000);
      }
    } catch (err) {
      setUploadStatus('Error uploading PDF. Please try again.');
      setTimeout(() => setUploadStatus(''), 3000);
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFeedback = async (msgIndex, score) => {
    if (feedbackSent[msgIndex] === score) return;

    try {
      const payload = {
        score,
        threadId: sessionSummary?.threadId || undefined,
      };
      
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setFeedbackSent(prev => ({
          ...prev,
          [msgIndex]: score,
        }));
      }
    } catch (error) {
      console.error('Failed to submit feedback:', error);
    }
  };

  const formatMessage = (text) => {
    const safeText = typeof text === 'string' ? text : text == null ? '' : String(text);
    return safeText.replace(
      /<think>([\s\S]*?)<\/think>/g,
      '<span class="think-content">$1</span>'
    );
  };

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="chat-container">
        {/* Top Header Section */}
        <header className="chat-header">
          <h2>🤖 EM TaskFlow AI</h2>
          <div className="chat-header-actions">
            <button 
              className={`pdf-drawer-toggle-btn ${isDrawerOpen ? 'active' : ''}`}
              onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            >
              📄 PDF Drawer
            </button>
          </div>
        </header>

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
                    onClick={() => sendMessage(suggestion)}
                    disabled={isLoading}
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
          {messages.map((msg, idx) => {
            const role = msg.role;
            const textContent = msg.content.map(c => c.text || '').join('\n');
            const sources = sourcesMap[idx] || [];
            
            return (
              <div key={idx} className={`message-wrapper ${role}`}>
                <div className="message-content">
                  <div className="message-avatar">
                    {role === 'user' ? '👤' : role === 'assistant' ? '🤖' : '⚙️'}
                  </div>
                  <div className="message-body">
                    <div 
                      className="message-text"
                      dangerouslySetInnerHTML={{ __html: formatMessage(textContent) }}
                    />
                    
                    {role === 'assistant' && (
                      <>
                        {sources.length > 0 && (
                          <div className="message-sources">
                            <details>
                              <summary>Sources ({sources.length})</summary>
                              <ul>
                                {sources.map((src, i) => (
                                  <li key={i}>
                                    {(src?.metadata?.filename || src?.filename || 'unknown')} (chunk {((src?.metadata?.chunkIndex ?? src?.chunk_index ?? 0) + 1)})
                                  </li>
                                ))}
                              </ul>
                            </details>
                          </div>
                        )}
                        
                        {/* Feedback Telemetry Buttons */}
                        <div className="message-feedback">
                          <button 
                            className={`feedback-btn ${feedbackSent[idx] === 'thumbs_up' ? 'active-thumbs_up' : ''}`}
                            onClick={() => handleFeedback(idx, 'thumbs_up')}
                            title="Thumbs Up"
                          >
                            👍
                          </button>
                          <button 
                            className={`feedback-btn ${feedbackSent[idx] === 'thumbs_down' ? 'active-thumbs_down' : ''}`}
                            onClick={() => handleFeedback(idx, 'thumbs_down')}
                            title="Thumbs Down"
                          >
                            👎
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {isLoading && (
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
            <label className="mode-toggle" htmlFor="advanced-mode-toggle">
              <input
                id="advanced-mode-toggle"
                type="checkbox"
                checked={useAdvancedMode}
                onChange={(e) => setUseAdvancedMode(e.target.checked)}
                disabled={isLoading}
              />
              <span>Advanced RAG</span>
            </label>
            <div className="chat-input">
              <button 
                className="attachment-btn"
                onClick={() => fileInputRef.current?.click()}
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
                disabled={isLoading}
              />
              <button 
                className="send-btn"
                onClick={() => sendMessage()}
                disabled={isLoading || !input.trim()}
              >
                {isLoading ? '⏳' : '➤'}
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
    </AssistantRuntimeProvider>
  );
}

export default Chat;
