import React, { useState, useRef } from 'react';
import { useAuiState } from '@assistant-ui/react';
import { useGithubSync } from '../hooks/useGithubSync.js';
import './Chat.css';

function Chat({ 
  sessionSummary, 
  setSessionSummary, 
  useAdvancedMode,
  setUseAdvancedMode,
  sourcesMap,
  setSourcesMap,
  runtime
}) {
  const [input, setInput] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const fileInputRef = useRef(null);
  
  const [feedbackSent, setFeedbackSent] = useState({}); // { messageIndex: 'thumbs_up' | 'thumbs_down' }

  // Reactive state from assistant-ui thread store with null-safety
  const rawMessages = useAuiState((s) => s?.thread?.messages);
  const isRunning = useAuiState((s) => s?.thread?.isRunning) || false;
  const messages = Array.isArray(rawMessages) ? rawMessages : [];

  const [suggestions] = useState([
    'What should I focus on today?',
    'Do I have any scheduling conflicts?',
    'Show me my pending tasks',
    'What meetings do I have today?'
  ]);

  const sendMessage = (customMessage = null) => {
    const messageText = customMessage || input;
    if (!messageText.trim() || isRunning) return;
    
    runtime.thread.append({
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
        runtime.thread.append({
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

  const [isHeaderSyncing, setIsHeaderSyncing] = useState(false);

  const triggerGithubSync = async () => {
    if (isHeaderSyncing) return;
    setIsHeaderSyncing(true);
    try {
      const res = await fetch('/api/github/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: 'logsv/em-taskflow-ai' }),
      });
      const data = await res.json();
      if (data.success) {
        runtime.thread.append({
          role: 'system',
          content: [{ type: 'text', text: `🔄 GitHub Data Synced! Updated ${data.count} issue(s) into PostgreSQL and CSV.` }]
        });
      }
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setIsHeaderSyncing(false);
    }
  };

  const formatMessage = (text) => {
    let safeText = typeof text === 'string' ? text : text == null ? '' : String(text);

    // Convert <think> tags
    safeText = safeText.replace(
      /<think>([\s\S]*?)<\/think>/g,
      '<span class="think-content">$1</span>'
    );

    // Convert Markdown headers (###, ##, #)
    safeText = safeText
      .replace(/^### (.*$)/gim, '<h3 class="md-h3">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="md-h2">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="md-h1">$1</h1>');

    // Convert Bold (**text** or __text__)
    safeText = safeText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    safeText = safeText.replace(/__(.*?)__/g, '<strong>$1</strong>');

    // Convert Markdown links [text](url)
    safeText = safeText.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>');

    // Convert bullet list items (+ , * , - )
    safeText = safeText.replace(/^\s*[\+\*\-]\s+(.*$)/gim, '<li class="md-li">$1</li>');

    // Wrap continuous <li> elements in <ul>
    safeText = safeText.replace(/(<li class="md-li">[\s\S]*?<\/li>)/g, '<ul class="md-ul">$1</ul>');
    safeText = safeText.replace(/<\/ul>\s*<ul class="md-ul">/g, '');

    // Convert double newlines to paragraphs / line breaks
    const paragraphs = safeText.split(/\n\n+/);
    safeText = paragraphs
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => {
        if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<div')) {
          return p;
        }
        return `<p class="md-p">${p.replace(/\n/g, '<br/>')}</p>`;
      })
      .join('');

    return safeText;
  };

  return (
    <div className="chat-container">
      {/* Top Header Section */}
      <header className="chat-header">
        <h2>🤖 EM TaskFlow AI</h2>
        <div className="chat-header-actions">
          <button
            className={`github-header-sync-btn ${isHeaderSyncing ? 'syncing' : ''}`}
            onClick={triggerGithubSync}
            disabled={isHeaderSyncing}
            title="Refresh GitHub DB / CSV"
          >
            {isHeaderSyncing ? '🔄 Syncing...' : '🔄 Refresh GitHub Data'}
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
                  disabled={isRunning}
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
          
          const isLastMessage = idx === messages.length - 1;
          const hasContent = textContent.trim().length > 0;
          const isMessageComplete = !isRunning || !isLastMessage;

          // Suppress empty assistant placeholder bubble while response is generating
          if (role === 'assistant' && !hasContent && isRunning && isLastMessage) {
            return null;
          }
          
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

                  {role === 'assistant' && (textContent.includes('⚠️ **Notice**: Live GitHub MCP') || textContent.includes('Local Cache')) && (
                    <div className="stale-data-alert">
                      <span className="stale-alert-text">⚠️ Live GitHub MCP was unreachable. This evidence came from local DB/CSV cache and may be stale.</span>
                      <button 
                        className="inline-refresh-btn" 
                        onClick={triggerGithubSync}
                        disabled={isHeaderSyncing}
                      >
                        {isHeaderSyncing ? 'Syncing...' : '🔄 Refresh Live Data Now'}
                      </button>
                    </div>
                  )}
                  
                  {role === 'assistant' && hasContent && isMessageComplete && (
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
        {isRunning && (
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
              disabled={isRunning}
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
              disabled={isRunning}
            />
            <button 
              className="send-btn"
              onClick={() => sendMessage()}
              disabled={isRunning || !input.trim()}
            >
              {isRunning ? '⏳' : '➤'}
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
