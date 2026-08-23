import React, { useState, useMemo, useEffect, useRef } from "react";
import { ALL_AGENT_PROMPTS, AGENT_CATEGORIES } from "../constants/agentPrompts.js";
import "./AgentPromptPalette.css";

function AgentPromptPalette({ isOpen, onClose, onSelectPrompt, onInsertPrompt, isRunning }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [expandedAgentId, setExpandedAgentId] = useState(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery("");
      setSelectedCategory("all");
      setExpandedAgentId(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const filteredAgents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return ALL_AGENT_PROMPTS.filter((agent) => {
      const matchesCategory = selectedCategory === "all" || agent.category === selectedCategory;
      if (!matchesCategory) return false;
      if (!query) return true;

      const inTitle = agent.title.toLowerCase().includes(query);
      const inDomain = agent.domain.toLowerCase().includes(query);
      const inDesc = (agent.shortDescription || "").toLowerCase().includes(query);
      const inText = agent.text.toLowerCase().includes(query);
      const inHints = agent.hints?.some((h) => h.toLowerCase().includes(query));

      return inTitle || inDomain || inDesc || inText || inHints;
    });
  }, [searchQuery, selectedCategory]);

  if (!isOpen) return null;

  const handleCardClick = (promptText, autoSend = true) => {
    if (autoSend) {
      onSelectPrompt(promptText);
      onClose();
    } else {
      onInsertPrompt(promptText);
      onClose();
    }
  };

  const toggleExpand = (e, agentId) => {
    e.stopPropagation();
    setExpandedAgentId((prev) => (prev === agentId ? null : agentId));
  };

  return (
    <div className="agent-palette-backdrop" onClick={onClose}>
      <div className="agent-palette-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="palette-header">
          <div className="palette-header-title">
            <span className="palette-header-icon">⚡</span>
            <div>
              <h3>Fast Agent Prompts & Hints</h3>
              <p>1-click launch for all 10 Local Micro-Agents + Docs RAG</p>
            </div>
          </div>
          <button className="palette-close-btn" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </div>

        {/* Search & Category Filter Bar */}
        <div className="palette-controls">
          <div className="palette-search-wrapper">
            <span className="search-icon">🔍</span>
            <input
              ref={searchInputRef}
              type="text"
              className="palette-search-input"
              placeholder="Search prompts (e.g. DORA, bottleneck, 1:1, sprint, retro, okr, security)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="clear-search-btn" onClick={() => setSearchQuery("")}>
                ✕
              </button>
            )}
          </div>

          <div className="palette-category-pills">
            {AGENT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                className={`category-pill ${selectedCategory === cat.id ? "active" : ""}`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Agent Cards List */}
        <div className="palette-agent-list">
          {filteredAgents.length === 0 ? (
            <div className="palette-empty-state">
              <span>🔍 No agent prompts match "{searchQuery}"</span>
              <button className="reset-filter-btn" onClick={() => { setSearchQuery(""); setSelectedCategory("all"); }}>
                Reset Filters
              </button>
            </div>
          ) : (
            filteredAgents.map((agent) => {
              const isExpanded = expandedAgentId === agent.id;
              return (
                <div key={agent.id} className="palette-agent-card">
                  <div className="agent-card-main">
                    <div className="agent-card-header">
                      <div className="agent-card-identity">
                        <span className="agent-card-icon">{agent.icon}</span>
                        <div>
                          <div className="agent-title-row">
                            <span className="agent-card-title">{agent.title}</span>
                            <span className="agent-card-domain">{agent.domain}</span>
                          </div>
                          <p className="agent-card-desc">{agent.shortDescription}</p>
                        </div>
                      </div>

                      <div className="agent-card-actions">
                        {agent.hints && agent.hints.length > 0 && (
                          <button
                            className={`toggle-hints-btn ${isExpanded ? "expanded" : ""}`}
                            onClick={(e) => toggleExpand(e, agent.id)}
                            title="View specific prompt hints"
                          >
                            {isExpanded ? "Hide Hints ▴" : `⚡ ${agent.hints.length} Hints ▾`}
                          </button>
                        )}
                        <button
                          className="use-prompt-btn"
                          onClick={() => handleCardClick(agent.text, true)}
                          disabled={isRunning}
                          title="Send prompt directly"
                        >
                          Run ➤
                        </button>
                      </div>
                    </div>

                    <div className="primary-prompt-preview">
                      <span className="prompt-label">Primary Prompt:</span>
                      <span className="prompt-text">"{agent.text}"</span>
                    </div>
                  </div>

                  {/* Sub-Hints Accordion */}
                  {isExpanded && agent.hints && (
                    <div className="agent-sub-hints">
                      <div className="sub-hints-header">
                        <span>Specific Scenarios & Fast Hints:</span>
                      </div>
                      <div className="sub-hints-grid">
                        {agent.hints.map((hint, idx) => (
                          <div key={idx} className="sub-hint-item">
                            <span className="sub-hint-bullet">💡</span>
                            <span className="sub-hint-text">{hint}</span>
                            <div className="sub-hint-actions">
                              <button
                                className="sub-hint-edit-btn"
                                onClick={() => handleCardClick(hint, false)}
                                title="Insert into message box to edit"
                              >
                                Edit ✏️
                              </button>
                              <button
                                className="sub-hint-run-btn"
                                onClick={() => handleCardClick(hint, true)}
                                disabled={isRunning}
                                title="Send immediately"
                              >
                                Send ➤
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="palette-footer">
          <span>💡 Tip: Click <strong>Run ➤</strong> to send immediately, or <strong>Edit ✏️</strong> to customize your prompt.</span>
          <span className="palette-count">{filteredAgents.length} Agents Available</span>
        </div>
      </div>
    </div>
  );
}

export default AgentPromptPalette;
