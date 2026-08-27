import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useAuiState } from '@assistant-ui/react';
import { useGithubSync } from '../hooks/useGithubSync.js';
import { ALL_WORKFLOWS, WORKFLOW_CATEGORIES, FEATURED_WORKFLOW_IDS } from '../constants/agentPrompts.js';
import AgentPromptPalette from './AgentPromptPalette.jsx';
import logger from '../utils/logger.js';
import './Chat.css';

function formatRelativeTime(dateInput) {
  if (!dateInput) return null;
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return null;
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 2) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function deriveShortHeader(text) {
  if (!text || typeof text !== 'string') return 'New Chat';
  const clean = text
    .replace(/^#+\s+/gm, '')
    .replace(/[*_`~>]/g, '')
    .replace(/\[Attachment:\s*[^\]]+\]/gi, '')
    .replace(/# Document Executive Context:[^\n]+/gi, '')
    .trim();
  if (!clean) return 'New Chat';
  const firstLine = clean.split('\n')[0].trim();
  if (firstLine.length > 36) {
    return firstLine.slice(0, 34).trim() + '…';
  }
  return firstLine;
}

function Chat({ 
  sessionSummary, 
  setSessionSummary, 
  useAdvancedMode,
  setUseAdvancedMode,
  sourcesMap,
  setSourcesMap,
  traceMap,
  runtime,
  sessionsList = [],
  onSwitchSession,
  onOpenActionHub,
  onOpenDevSettings,
  isPaletteOpen = false,
  setIsPaletteOpen,
}) {
  const [input, setInput] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const [internalPaletteOpen, setInternalPaletteOpen] = useState(false);
  const paletteOpen = typeof setIsPaletteOpen === 'function' ? isPaletteOpen : internalPaletteOpen;
  const setPaletteOpen = typeof setIsPaletteOpen === 'function' ? setIsPaletteOpen : setInternalPaletteOpen;

  const [welcomeCategory, setWelcomeCategory] = useState('all');
  const [welcomeSearch, setWelcomeSearch] = useState('');
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  
  const [feedbackSent, setFeedbackSent] = useState({}); // { messageIndex: 'thumbs_up' | 'thumbs_down' }

  // Reactive state from assistant-ui thread store with null-safety
  const rawMessages = useAuiState((s) => s?.thread?.messages);
  const isRunning = useAuiState((s) => s?.thread?.isRunning) || false;
  const messages = Array.isArray(rawMessages) ? rawMessages : [];

  const { syncStatus, triggerSync, isSyncing } = useGithubSync();

  const filteredWelcomeWorkflows = useMemo(() => {
    const q = welcomeSearch.trim().toLowerCase();
    if (q) {
      return ALL_WORKFLOWS.filter((wf) =>
        wf.title.toLowerCase().includes(q) ||
        (wf.domain || '').toLowerCase().includes(q) ||
        (wf.shortDescription || '').toLowerCase().includes(q) ||
        (wf.text || '').toLowerCase().includes(q) ||
        wf.keywords?.some((k) => k.toLowerCase().includes(q))
      ).slice(0, 4);
    }
    if (welcomeCategory === 'all') {
      return ALL_WORKFLOWS.filter((wf) => FEATURED_WORKFLOW_IDS.includes(wf.id));
    }
    return ALL_WORKFLOWS.filter((wf) => wf.category === welcomeCategory).slice(0, 4);
  }, [welcomeCategory, welcomeSearch]);

  // Recent work (excluding current active session if empty)
  const recentWork = useMemo(() => {
    if (!Array.isArray(sessionsList) || sessionsList.length === 0) return [];
    return sessionsList
      .filter((s) => s.last_message && s.last_message.trim().length > 0)
      .slice(0, 3);
  }, [sessionsList]);

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
        setUploadStatus('⏳ Processing file attachment in background...');
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
                setUploadStatus(`❌ Upload failed: ${pollData.error || 'Failed extracting file.'}`);
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

  const formatMessage = (text) => {
    let safeText = typeof text === 'string' ? text : text == null ? '' : String(text);
    if (!safeText.trim()) return '';

    // 1. Convert <think> tags
    safeText = safeText.replace(
      /<think>([\s\S]*?)<\/think>/g,
      '<span class="think-content">$1</span>'
    );

    // 2. Pre-process LaTeX Math symbols in inline expressions
    safeText = safeText
      .replace(/\\le(q)?\b/g, '≤')
      .replace(/\\ge(q)?\b/g, '≥')
      .replace(/\\approx\b/g, '≈')
      .replace(/\\neq\b/g, '≠')
      .replace(/\\pm\b/g, '±')
      .replace(/\\times\b/g, '×')
      .replace(/\$([^\$\n]+)\$/g, '<span class="md-math">$1</span>');

    // 3. Extract and protect Fenced Code Blocks (```lang ... ```)
    const codeBlocks = [];
    safeText = safeText.replace(/```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g, (match, lang, code) => {
      const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
      const escapedCode = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      codeBlocks.push(
        `<div class="md-code-block-wrapper"><div class="md-code-header"><span>${lang || 'code'}</span></div><pre class="md-pre"><code class="md-code">${escapedCode}</code></pre></div>`
      );
      return placeholder;
    });

    // 4. Parse Blockquotes / Callout Notices (> ...)
    safeText = safeText.replace(/(?:^[ \t]*>[ \t]?(?:.*)(?:\r?\n|$))+/gm, (block) => {
      const lines = block.split(/\r?\n/)
        .map(line => line.replace(/^[ \t]*>[ \t]?/, '').trim())
        .filter(Boolean);
      const innerContent = lines.join('<br/>');
      
      let calloutClass = 'md-blockquote';
      if (innerContent.includes('✅') || innerContent.toLowerCase().includes('notice:')) {
        calloutClass += ' notice-callout';
      } else if (innerContent.includes('⚠️') || innerContent.toLowerCase().includes('warning:')) {
        calloutClass += ' warning-callout';
      } else if (innerContent.includes('❌') || innerContent.toLowerCase().includes('danger:')) {
        calloutClass += ' danger-callout';
      }
      return `\n\n<blockquote class="${calloutClass}">${innerContent}</blockquote>\n\n`;
    });

    // 5. Parse Markdown GFM Tables
    const tableRegex = /((?:^[ \t]*\|.+?\|[ \t]*(?:\r?\n|$))+)/gm;
    safeText = safeText.replace(tableRegex, (match) => {
      const rawLines = match.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (rawLines.length < 2) return match;

      const sepLine = rawLines[1];
      const isSep = /^\|?([ \t]*:?-+:?[ \t]*\|)+[ \t]*:?-+:?[ \t]*\|?$/.test(sepLine);
      if (!isSep) return match;

      const parseCells = (line) => {
        let trimmed = line.replace(/^\|/, '').replace(/\|$/, '');
        return trimmed.split('|').map(c => c.trim());
      };

      const headerCells = parseCells(rawLines[0]);
      const alignCells = parseCells(sepLine);
      const alignments = alignCells.map(c => {
        const starts = c.startsWith(':');
        const ends = c.endsWith(':');
        if (starts && ends) return 'center';
        if (ends) return 'right';
        return 'left';
      });

      const bodyRows = rawLines.slice(2);

      const formatCellContent = (content) => {
        let cell = content;
        if (/^(🔴|❌|CRITICAL|HIGH)\b/i.test(cell) || cell.includes('🔴') || cell.includes('High Risk') || cell.includes('Stalled') || cell.includes('Over Limit') || cell.includes('Blocked')) {
          cell = `<span class="table-pill pill-danger">${cell}</span>`;
        } else if (/^(🟡|⚠️|MEDIUM|WARN|Review Delays)\b/i.test(cell) || cell.includes('🟡') || cell.includes('Review Delays')) {
          cell = `<span class="table-pill pill-warning">${cell}</span>`;
        } else if (/^(🟢|✅|LOW|HEALTHY|OPTIMAL|PASS|OK)\b/i.test(cell) || cell.includes('🟢') || cell.includes('Healthy') || cell.includes('Optimal')) {
          cell = `<span class="table-pill pill-success">${cell}</span>`;
        } else if (/^(🔵|ℹ️|INFO)\b/i.test(cell)) {
          cell = `<span class="table-pill pill-info">${cell}</span>`;
        }
        return cell;
      };

      let tableHtml = '<div class="md-table-wrapper"><table class="md-table"><thead><tr>';
      headerCells.forEach((h, idx) => {
        const align = alignments[idx] || 'left';
        tableHtml += `<th style="text-align: ${align}">${h}</th>`;
      });
      tableHtml += '</tr></thead><tbody>';

      bodyRows.forEach((row) => {
        const cells = parseCells(row);
        tableHtml += '<tr>';
        cells.forEach((c, idx) => {
          const align = alignments[idx] || 'left';
          tableHtml += `<td style="text-align: ${align}">${formatCellContent(c)}</td>`;
        });
        tableHtml += '</tr>';
      });

      tableHtml += '</tbody></table></div>';
      return `\n\n${tableHtml}\n\n`;
    });

    // 6. Convert Inline Code (`code`)
    safeText = safeText.replace(/`([^`\r\n]+)`/g, '<code class="md-inline-code">$1</code>');

    // 7. Convert Markdown headers
    safeText = safeText
      .replace(/^#### (.*$)/gim, '<h4 class="md-h4">$1</h4>')
      .replace(/^### (.*$)/gim, '<h3 class="md-h3">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="md-h2">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="md-h1">$1</h1>');

    // 8. Convert Bold
    safeText = safeText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    safeText = safeText.replace(/__(.*?)__/g, '<strong>$1</strong>');

    // 9. Convert Italics
    safeText = safeText.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

    // 10. Convert Markdown links
    safeText = safeText.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>');

    // 11. Bullet lists
    safeText = safeText.replace(/^\s*[\+\*\-]\s+(.*$)/gim, '<li class="md-li">$1</li>');
    safeText = safeText.replace(/(<li class="md-li">[\s\S]*?<\/li>)/g, '<ul class="md-ul">$1</ul>');
    safeText = safeText.replace(/<\/ul>\s*<ul class="md-ul">/g, '');

    // 12. Numbered lists
    safeText = safeText.replace(/^\s*\d+\.\s+(.*$)/gim, '<li class="md-oli">$1</li>');
    safeText = safeText.replace(/(<li class="md-oli">[\s\S]*?<\/li>)/g, '<ol class="md-ol">$1</ol>');
    safeText = safeText.replace(/<\/ol>\s*<ol class="md-ol">/g, '');

    // 13. Paragraphs
    const paragraphs = safeText.split(/\n\n+/);
    safeText = paragraphs
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => {
        if (
          p.startsWith('<h') ||
          p.startsWith('<ul') ||
          p.startsWith('<ol') ||
          p.startsWith('<div') ||
          p.startsWith('<blockquote') ||
          p.startsWith('__CODE_BLOCK_')
        ) {
          return p;
        }
        return `<p class="md-p">${p.replace(/\n/g, '<br/>')}</p>`;
      })
      .join('');

    // 14. Restore Protected Code Blocks
    codeBlocks.forEach((block, i) => {
      safeText = safeText.replace(`__CODE_BLOCK_${i}__`, block);
    });

    return safeText;
  };

  const lastSyncDate = syncStatus?.postgresql?.lastSyncedAt
    ? formatRelativeTime(syncStatus.postgresql.lastSyncedAt)
    : null;

  return (
    <div className="chat-container">
      {/* Top Header Section */}
      <header className="chat-header">
        <div className="chat-header-title">
          <h2>🤖 EM TaskFlow AI</h2>
        </div>

        <div className="chat-header-actions">
          {/* Quiet GitHub Sync Indicator */}
          <div className="github-sync-indicator">
            <span className={`sync-status-dot ${isSyncing ? 'syncing' : ''}`} />
            <span className="sync-status-text">
              {isSyncing ? 'Syncing...' : lastSyncDate ? `GitHub Synced ${lastSyncDate}` : 'GitHub Connected'}
            </span>
            <button
              type="button"
              className="github-sync-refresh-btn"
              onClick={triggerSync}
              disabled={isSyncing}
              title="Refresh GitHub DB cache"
            >
              ↻
            </button>
          </div>

          <button
            type="button"
            className="header-quick-actions-btn"
            onClick={() => setPaletteOpen(true)}
            title="Open Quick Actions (⌘K)"
          >
            <span>⚡</span>
            <span>Quick Actions</span>
            <kbd className="header-kbd">⌘K</kbd>
          </button>
        </div>
      </header>

      {/* Main Messages & Welcome View */}
      {messages.length === 0 ? (
        <div className="welcome-screen">
          <div className="welcome-content">
            <div className="welcome-hero">
              <div className="hero-badge">👔 Engineering Management Copilot</div>
              <h1 className="hero-title">What would you like to work on?</h1>
              <p className="hero-subtitle">Ask your engineering management question, or select a workflow below</p>
            </div>

            {/* Primary Composer inside Home View */}
            <div className="welcome-composer-card">
              <div className="chat-input-bar">
                <button 
                  type="button"
                  className="input-tool-btn"
                  onClick={() => setPaletteOpen(true)}
                  title="Quick Actions (⚡)"
                >
                  ⚡
                </button>
                <button 
                  type="button"
                  className="input-tool-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach file (PDF, CSV, docx)"
                >
                  📎
                </button>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask about delivery bottlenecks, DORA metrics, people coaching, sprint capacity..."
                  rows="1"
                  disabled={isRunning}
                />
                <button 
                  type="button"
                  className="send-action-btn"
                  onClick={() => sendMessage()}
                  disabled={isRunning || !input.trim()}
                  title="Send message"
                >
                  {isRunning ? '⏳' : '➤'}
                </button>
              </div>
              {uploadStatus && (
                <div className="upload-status-bar">{uploadStatus}</div>
              )}
            </div>

            {/* Quick Actions Section */}
            <div className="welcome-section">
              <div className="welcome-section-header">
                <div className="section-title-group">
                  <span className="section-title">Quick Actions</span>
                </div>
                <div className="welcome-category-pills">
                  {WORKFLOW_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      className={`welcome-pill ${welcomeCategory === cat.id ? 'active' : ''}`}
                      onClick={() => setWelcomeCategory(cat.id)}
                    >
                      <span>{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 4 Concise Workflow Cards */}
              <div className="workflow-starter-grid">
                {filteredWelcomeWorkflows.map((wf) => (
                  <button
                    key={wf.id}
                    type="button"
                    className="workflow-starter-card"
                    onClick={() => sendMessage(wf.text)}
                    disabled={isRunning}
                    title={wf.shortDescription}
                  >
                    <div className="starter-card-top">
                      <span className="starter-card-icon">{wf.icon}</span>
                      <span className="starter-card-domain">{wf.domain}</span>
                    </div>
                    <div className="starter-card-title">{wf.title}</div>
                    <div className="starter-card-desc">{wf.shortDescription}</div>
                    <div className="starter-card-cta">
                      <span>Run →</span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="welcome-palette-cta-row">
                <button 
                  type="button"
                  className="browse-all-workflows-btn"
                  onClick={() => setPaletteOpen(true)}
                >
                  <span>⚡ Browse All Workflows ({ALL_WORKFLOWS.length})</span>
                </button>
              </div>
            </div>

            {/* Recent Work Section */}
            {recentWork.length > 0 && (
              <div className="welcome-recent-section">
                <span className="section-title">Recent Work</span>
                <div className="recent-work-grid">
                  {recentWork.map((s) => {
                    const title = s.active_thread_title && s.active_thread_title !== 'New Chat'
                      ? s.active_thread_title
                      : deriveShortHeader(s.last_message);
                    const timeAgo = formatRelativeTime(s.last_active_at || s.updated_at || s.created_at);

                    return (
                      <button
                        key={s.id}
                        type="button"
                        className="recent-work-card"
                        onClick={() => onSwitchSession && onSwitchSession(s.id, s.active_thread_id)}
                        title="Resume conversation"
                      >
                        <span className="recent-work-icon">💬</span>
                        <div className="recent-work-info">
                          <span className="recent-work-title">{title}</span>
                          <span className="recent-work-time">{timeAgo}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Active Conversation Messages View */
        <div className="chat-messages">
          {messages.map((msg, idx) => {
            const role = msg.role;
            const textContent = Array.isArray(msg.content)
              ? msg.content.map(c => (typeof c === 'string' ? c : c?.text || '')).join('\n')
              : (typeof msg.content === 'string' ? msg.content : (msg.content?.text || ''));
            const sources = sourcesMap[idx] || [];
            
            const isLastMessage = idx === messages.length - 1;
            const hasContent = textContent.trim().length > 0;
            const isMessageComplete = !isRunning || !isLastMessage;

            // Suppress empty assistant placeholder bubble while response is generating
            if (role === 'assistant' && !hasContent && isRunning && isLastMessage) {
              return null;
            }
            
            return (
              <div key={msg.id || idx} className={`message-wrapper ${role}`}>
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
                        <span className="stale-alert-text">⚠️ Telemetry was populated from PostgreSQL cache.</span>
                        <button 
                          type="button"
                          className="inline-refresh-btn" 
                          onClick={triggerSync}
                          disabled={isSyncing}
                        >
                          {isSyncing ? 'Syncing...' : '↻ Refresh Live Data'}
                        </button>
                      </div>
                    )}
                    
                    {role === 'assistant' && hasContent && isMessageComplete && (
                      <div className="assistant-message-actions-bar">
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
                        
                        {/* Decision-driven EM Action Buttons */}
                        {(textContent.includes('Scorecard') || textContent.includes('Bottleneck') || textContent.includes('DORA') || textContent.includes('WIP')) && (
                          <div className="decision-action-pills">
                            <button
                              type="button"
                              className="decision-pill-btn"
                              onClick={() => {
                                if (typeof onOpenActionHub === 'function') {
                                  onOpenActionHub();
                                } else {
                                  window.location.href = '/actions';
                                }
                              }}
                              title="Triage this in the EM Action Hub"
                            >
                              <span>📋 Action Hub</span>
                            </button>
                            <button
                              type="button"
                              className="decision-pill-btn"
                              onClick={() => sendMessage('Formulate a blameless de-bottlenecking action item for this sprint with clear owners')}
                              title="Ask follow-up de-bottlenecking action"
                            >
                              <span>🎯 Formulate Actions</span>
                            </button>
                          </div>
                        )}

                        {/* Feedback Telemetry Buttons */}
                        <div className="message-feedback">
                          <button 
                            type="button"
                            className={`feedback-btn ${feedbackSent[idx] === 'thumbs_up' ? 'active-thumbs_up' : ''}`}
                            onClick={() => handleFeedback(idx, 'thumbs_up')}
                            title="Helpful analysis"
                          >
                            👍
                          </button>
                          <button 
                            type="button"
                            className={`feedback-btn ${feedbackSent[idx] === 'thumbs_down' ? 'active-thumbs_down' : ''}`}
                            onClick={() => handleFeedback(idx, 'thumbs_down')}
                            title="Needs improvement"
                          >
                            👎
                          </button>
                        </div>
                      </div>
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
      )}

      {/* Floating Bottom Composer (Visible when in conversation) */}
      {messages.length > 0 && (
        <div className="chat-input-container">
          {uploadStatus && (
            <div className="upload-status-bar">
              {uploadStatus}
            </div>
          )}
          
          {/* Quick Predefined Workflow Chips */}
          <div className="quick-prompt-chips">
            <button
              type="button"
              className="chip-btn all-agents-chip"
              onClick={() => setPaletteOpen(true)}
              title="Open Quick Actions (⌘K)"
            >
              <span>⚡</span>
              <span>Quick Actions ▾</span>
            </button>
            {ALL_WORKFLOWS.slice(0, 6).map((wf) => (
              <button
                key={wf.id}
                type="button"
                className="chip-btn"
                onClick={() => sendMessage(wf.text)}
                disabled={isRunning}
                title={wf.shortDescription}
              >
                <span>{wf.icon}</span>
                <span>{wf.title}</span>
              </button>
            ))}
          </div>

          <div className="chat-input-wrapper">
            <div className="chat-input-bar">
              <button 
                type="button"
                className="input-tool-btn"
                onClick={() => setPaletteOpen(true)}
                title="Quick Actions (⚡)"
              >
                ⚡
              </button>
              <button 
                type="button"
                className="input-tool-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Attach file (PDF, CSV, docx)"
              >
                📎
              </button>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about delivery, people, planning, metrics (or ⚡ for Quick Actions)..."
                rows="1"
                disabled={isRunning}
              />
              <button 
                type="button"
                className="send-action-btn"
                onClick={() => sendMessage()}
                disabled={isRunning || !input.trim()}
                title="Send message"
              >
                {isRunning ? '⏳' : '➤'}
              </button>
            </div>
          </div>
          
          <div className="input-footer">
            <p>EM TaskFlow AI • Workflows & Engineering Management Copilot</p>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.csv,.tsv,.xlsx,.xls,.docx,.txt,.md,.json,image/*"
        onChange={handleFileUpload}
        style={{ display: 'none' }}
      />

      {/* Quick Actions Modal Palette */}
      <AgentPromptPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelectPrompt={(promptText) => sendMessage(promptText)}
        onInsertPrompt={(promptText) => setInput(promptText)}
        isRunning={isRunning}
      />
    </div>
  );
}

export default Chat;

