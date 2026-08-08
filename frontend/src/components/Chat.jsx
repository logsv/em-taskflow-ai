import React, { useState, useRef, useEffect } from 'react';
import { useAuiState } from '@assistant-ui/react';
import { useGithubSync } from '../hooks/useGithubSync.js';
import logger from '../utils/logger.js';
import './Chat.css';

function Chat({ 
  sessionSummary, 
  setSessionSummary, 
  useAdvancedMode,
  setUseAdvancedMode,
  sourcesMap,
  setSourcesMap,
  traceMap,
  runtime
}) {
  const [input, setInput] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  
  const [feedbackSent, setFeedbackSent] = useState({}); // { messageIndex: 'thumbs_up' | 'thumbs_down' }

  // Reactive state from assistant-ui thread store with null-safety
  const rawMessages = useAuiState((s) => s?.thread?.messages);
  const isRunning = useAuiState((s) => s?.thread?.isRunning) || false;
  const messages = Array.isArray(rawMessages) ? rawMessages : [];

  // 5 Predefined Engineering Manager Prompts
  const predefinedPrompts = [
    {
      id: 'dora',
      icon: '📊',
      title: 'DORA Metrics Audit',
      domain: 'DORA',
      text: 'Analyze team DORA metrics for deployment frequency, lead time, and failure rate'
    },
    {
      id: 'sbi',
      icon: '💬',
      title: 'SBI Feedback Generator',
      domain: 'SBI Coaching',
      text: 'Draft an SBI coaching feedback for an engineer unblocking code reviews'
    },
    {
      id: 'delivery',
      icon: '🚀',
      title: 'Delivery & WIP Bottlenecks',
      domain: 'Delivery',
      text: 'Check current sprint delivery bottlenecks, WIP limit violations, and blocked PRs'
    },
    {
      id: 'sprint',
      icon: '⚡',
      title: 'Sprint Capacity Planning',
      domain: 'Sprint',
      text: 'Calculate team sprint velocity and capacity forecast for next sprint planning'
    },
    {
      id: 'okr',
      icon: '🎯',
      title: 'OKR & KPI Tracker',
      domain: 'OKR / KPI',
      text: 'Evaluate quarterly engineering Objectives & Key Results (OKRs) and team KPI scorecards'
    }
  ];

  // Auto-scroll to bottom of messages container
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isRunning]);

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

    setUploadStatus(`Extracting ${file.name}...`);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/chat/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      
      const processAttachment = (attachment) => {
        const fullText = attachment.extractedText || '';
        const textPreview = fullText.length > 20000 
          ? `${fullText.slice(0, 20000)}\n\n[...Truncated remaining ${fullText.length - 20000} characters]` 
          : fullText;

        setUploadStatus(`Attached "${file.name}" successfully!`);
        
        if (textPreview) {
          setInput((prev) => {
            const prefix = prev.trim() ? `${prev}\n\n` : '';
            return `${prefix}[Attachment: ${file.name}]\n${textPreview}`;
          });
        }
        
        runtime.thread.append({
          role: 'system',
          content: [{ type: 'text', text: `📎 Attached file "${file.name}" context ready (${attachment.extractionMethod || 'temporal'}, ${fullText.length} chars).` }]
        });
        setTimeout(() => setUploadStatus(''), 4000);
      };

      if (res.status === 202 && data.mode === 'temporal' && data.workflowId) {
        setUploadStatus('⏳ Temporal Workflow processing file...');
        const workflowId = data.workflowId;
        let attempts = 0;
        const pollInterval = setInterval(async () => {
          attempts += 1;
          try {
            const pollRes = await fetch(`/api/chat/upload/workflows/${workflowId}`);
            if (pollRes.ok) {
              const pollData = await pollRes.json();
              if (pollData.status === 'COMPLETED' && pollData.attachment) {
                clearInterval(pollInterval);
                processAttachment(pollData.attachment);
              } else if (pollData.status === 'FAILED') {
                clearInterval(pollInterval);
                setUploadStatus(`❌ Upload failed: ${pollData.error || 'Temporal Workflow failed extracting file.'}`);
                setTimeout(() => setUploadStatus(''), 5000);
              }
            }
          } catch (e) {
            // silent retry
          }
          if (attempts > 30) {
            clearInterval(pollInterval);
            setUploadStatus('⚠️ File extraction processing in background...');
            setTimeout(() => setUploadStatus(''), 3000);
          }
        }, 2000);
        return;
      }

      if (res.ok && data.success && data.attachment) {
        processAttachment(data.attachment);
      } else {
        setUploadStatus(`Upload failed: ${data.error || 'Unknown error'}`);
        setTimeout(() => setUploadStatus(''), 3000);
      }
    } catch (err) {
      setUploadStatus('Error uploading file attachment. Please try again.');
      setTimeout(() => setUploadStatus(''), 3000);
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFeedback = async (msgIndex, score) => {
    if (feedbackSent[msgIndex] === score) return;

    const traceMeta = traceMap?.[msgIndex] || {};
    try {
      const payload = {
        score,
        threadId: sessionSummary?.threadId || undefined,
        traceId: traceMeta.traceId || undefined,
        messageId: traceMeta.messageId || undefined,
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
      logger.error('Failed to submit feedback', { error: error.message });
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
      logger.error('Sync failed', { err: err.message });
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
        <div className="chat-header-title">
          <h2>🤖 EM TaskFlow AI</h2>
          <span className="agent-status-badge">🟢 10 Local Agents Active</span>
        </div>
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
              <div className="logo-icon">👔</div>
              <h1>Engineering Management Copilot</h1>
            </div>
            <p className="welcome-subtitle">Select an executive workflow or type your custom query below</p>
            
            <div className="suggestion-grid">
              {predefinedPrompts.map((prompt) => (
                <button
                  key={prompt.id}
                  className="suggestion-card"
                  onClick={() => sendMessage(prompt.text)}
                  disabled={isRunning}
                >
                  <div className="suggestion-header">
                    <span className="suggestion-icon">{prompt.icon}</span>
                    <span className="suggestion-domain">{prompt.domain}</span>
                  </div>
                  <div className="suggestion-title">{prompt.title}</div>
                  <div className="suggestion-text">{prompt.text}</div>
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
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        {uploadStatus && (
          <div className="upload-status">
            {uploadStatus}
          </div>
        )}
        
        {/* Quick Predefined Prompt Chips during active chat */}
        {messages.length > 0 && (
          <div className="quick-prompt-chips">
            {predefinedPrompts.map((p) => (
              <button
                key={p.id}
                className="chip-btn"
                onClick={() => sendMessage(p.text)}
                disabled={isRunning}
              >
                <span>{p.icon}</span>
                <span>{p.title}</span>
              </button>
            ))}
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
            accept=".pdf,.csv,.tsv,.xlsx,.xls,.docx,.txt,.md,.json,image/*"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
        </div>
        
        <div className="input-footer">
          <p>EM TaskFlow AI Powered by Local Ollama SLM Inference & LangGraph Supervisor.</p>
        </div>
      </div>
    </div>
  );
}

export default Chat;
