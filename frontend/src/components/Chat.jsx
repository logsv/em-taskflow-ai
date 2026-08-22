import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useAuiState } from '@assistant-ui/react';
import { useGithubSync } from '../hooks/useGithubSync.js';
import { ALL_AGENT_PROMPTS, AGENT_CATEGORIES, FEATURED_AGENT_IDS } from '../constants/agentPrompts.js';
import AgentPromptPalette from './AgentPromptPalette.jsx';
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
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [welcomeCategory, setWelcomeCategory] = useState('featured');
  const [welcomeSearch, setWelcomeSearch] = useState('');
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  
  const [feedbackSent, setFeedbackSent] = useState({}); // { messageIndex: 'thumbs_up' | 'thumbs_down' }

  // Reactive state from assistant-ui thread store with null-safety
  const rawMessages = useAuiState((s) => s?.thread?.messages);
  const isRunning = useAuiState((s) => s?.thread?.isRunning) || false;
  const messages = Array.isArray(rawMessages) ? rawMessages : [];

  // All 11 Predefined Engineering Manager & Knowledge Agents
  const predefinedPrompts = ALL_AGENT_PROMPTS;

  const filteredWelcomePrompts = useMemo(() => {
    const q = welcomeSearch.trim().toLowerCase();
    if (q) {
      return ALL_AGENT_PROMPTS.filter((p) =>
        p.title.toLowerCase().includes(q) ||
        p.domain.toLowerCase().includes(q) ||
        (p.shortDescription || '').toLowerCase().includes(q) ||
        p.text.toLowerCase().includes(q) ||
        p.hints?.some((h) => h.toLowerCase().includes(q))
      ).slice(0, 4);
    }
    if (welcomeCategory === 'featured') {
      return ALL_AGENT_PROMPTS.filter((p) => FEATURED_AGENT_IDS.includes(p.id));
    }
    return ALL_AGENT_PROMPTS.filter((p) => p.category === welcomeCategory).slice(0, 4);
  }, [welcomeCategory, welcomeSearch]);

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

    // 7. Convert Markdown headers (####, ###, ##, #)
    safeText = safeText
      .replace(/^#### (.*$)/gim, '<h4 class="md-h4">$1</h4>')
      .replace(/^### (.*$)/gim, '<h3 class="md-h3">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="md-h2">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="md-h1">$1</h1>');

    // 8. Convert Bold (**text** or __text__)
    safeText = safeText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    safeText = safeText.replace(/__(.*?)__/g, '<strong>$1</strong>');

    // 9. Convert Italics (*text* or _text_)
    safeText = safeText.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

    // 10. Convert Markdown links [text](url)
    safeText = safeText.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>');

    // 11. Convert bullet list items (+ , * , - )
    safeText = safeText.replace(/^\s*[\+\*\-]\s+(.*$)/gim, '<li class="md-li">$1</li>');
    safeText = safeText.replace(/(<li class="md-li">[\s\S]*?<\/li>)/g, '<ul class="md-ul">$1</ul>');
    safeText = safeText.replace(/<\/ul>\s*<ul class="md-ul">/g, '');

    // 12. Convert numbered list items (1. , 2. )
    safeText = safeText.replace(/^\s*\d+\.\s+(.*$)/gim, '<li class="md-oli">$1</li>');
    safeText = safeText.replace(/(<li class="md-oli">[\s\S]*?<\/li>)/g, '<ol class="md-ol">$1</ol>');
    safeText = safeText.replace(/<\/ol>\s*<ol class="md-ol">/g, '');

    // 13. Convert double newlines to paragraphs / line breaks
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

  return (
    <div className="chat-container">
      {/* Top Header Section */}
      <header className="chat-header">
        <div className="chat-header-title">
          <h2>🤖 EM TaskFlow AI</h2>
        </div>
        <div className="chat-header-actions">
          <button
            className="agent-header-palette-btn"
            onClick={() => setIsPaletteOpen(true)}
            title="Browse all 11 Agent Prompt Hints"
          >
            <span>⚡</span> Agent Hints
          </button>
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
            <p className="welcome-subtitle">Select an executive workflow or choose a domain category below</p>

            {/* Fast Category Filter Pills */}
            <div className="welcome-category-pills">
              {AGENT_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`welcome-pill ${welcomeCategory === cat.id ? 'active' : ''}`}
                  onClick={() => setWelcomeCategory(cat.id)}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>
            
            {/* Clean Compact 2x2 Starter Grid */}
            <div className="suggestion-grid">
              {filteredWelcomePrompts.map((prompt) => (
                <button
                  key={prompt.id}
                  type="button"
                  className="suggestion-card"
                  onClick={() => sendMessage(prompt.text)}
                  disabled={isRunning}
                  title={prompt.text}
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

            {/* Prompt Library CTA */}
            <div className="welcome-palette-cta">
              <button 
                type="button"
                className="welcome-open-palette-btn"
                onClick={() => setIsPaletteOpen(true)}
              >
                <span>⚡</span> Browse All 11 Agents & Scenario Hints ({ALL_AGENT_PROMPTS.length})
              </button>
            </div>
          </div>
        </div>
      )}

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
            <button
              type="button"
              className="chip-btn all-agents-chip"
              onClick={() => setIsPaletteOpen(true)}
              title="Open full prompt library with all 11 agents & scenario hints"
            >
              <span>⚡</span>
              <span>All 11 Agents Hints ▾</span>
            </button>
            {predefinedPrompts.map((p) => (
              <button
                key={p.id}
                className="chip-btn"
                onClick={() => sendMessage(p.text)}
                disabled={isRunning}
                title={p.shortDescription || p.text}
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
              type="button"
              className="prompt-palette-trigger-btn"
              onClick={() => setIsPaletteOpen(true)}
              title="Fast Agent Prompts & Scenario Hints (⚡)"
            >
              ⚡
            </button>
            <button 
              type="button"
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
              placeholder="Message EM TaskFlow AI (or click ⚡ for Agent Hints)..."
              rows="1"
              disabled={isRunning}
            />
            <button 
              type="button"
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

      {/* Global Fast Agent Prompts & Scenario Hints Palette Modal */}
      <AgentPromptPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        onSelectPrompt={(promptText) => sendMessage(promptText)}
        onInsertPrompt={(promptText) => setInput(promptText)}
        isRunning={isRunning}
      />
    </div>
  );
}

export default Chat;
