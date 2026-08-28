import React, { useState, useMemo, useEffect, useRef } from "react";
import { ALL_WORKFLOWS, WORKFLOW_CATEGORIES } from "../constants/agentPrompts.js";
import "./AgentPromptPalette.css";

function AgentPromptPalette({ isOpen, onClose, onSelectPrompt, onInsertPrompt, isRunning }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [expandedWorkflowId, setExpandedWorkflowId] = useState(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      setHighlightedIndex(0);
    } else {
      setSearchQuery("");
      setSelectedCategory("all");
      setExpandedWorkflowId(null);
      setHighlightedIndex(0);
    }
  }, [isOpen]);

  const filteredWorkflows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return ALL_WORKFLOWS.filter((wf) => {
      const matchesCategory = selectedCategory === "all" || wf.category === selectedCategory;
      if (!matchesCategory) return false;
      if (!query) return true;

      const inTitle = wf.title.toLowerCase().includes(query);
      const inDomain = (wf.domain || "").toLowerCase().includes(query);
      const inDesc = (wf.shortDescription || "").toLowerCase().includes(query);
      const inText = (wf.text || "").toLowerCase().includes(query);
      const inKeywords = wf.keywords?.some((k) => k.toLowerCase().includes(query));
      const inHints = wf.hints?.some((h) => h.toLowerCase().includes(query));

      return inTitle || inDomain || inDesc || inText || inKeywords || inHints;
    });
  }, [searchQuery, selectedCategory]);

  // Keyboard navigation within modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) => 
          prev < filteredWorkflows.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) => 
          prev > 0 ? prev - 1 : Math.max(0, filteredWorkflows.length - 1)
        );
      } else if (e.key === "Enter" && !e.shiftKey) {
        if (filteredWorkflows[highlightedIndex]) {
          e.preventDefault();
          onSelectPrompt(filteredWorkflows[highlightedIndex].text);
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, filteredWorkflows, highlightedIndex, onSelectPrompt]);

  if (!isOpen) return null;

  const handleRunWorkflow = (promptText) => {
    onSelectPrompt(promptText);
    onClose();
  };

  const handleEditWorkflow = (promptText) => {
    if (typeof onInsertPrompt === 'function') {
      onInsertPrompt(promptText);
    } else {
      onSelectPrompt(promptText);
    }
    onClose();
  };

  const toggleOptions = (e, wfId) => {
    e.stopPropagation();
    setExpandedWorkflowId((prev) => (prev === wfId ? null : wfId));
  };

  return (
    <div className="agent-palette-backdrop" onClick={onClose}>
      <div className="agent-palette-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="palette-header">
          <div className="palette-header-title">
            <span className="palette-header-icon">⚡</span>
            <div>
              <h3>Quick Actions</h3>
              <p>Launch engineering management workflows, audits, and coaching</p>
            </div>
          </div>
          <div className="palette-header-right">
            <span className="palette-esc-hint">Esc</span>
            <button className="palette-close-btn" onClick={onClose} title="Close (Esc)">
              ✕
            </button>
          </div>
        </div>

        {/* Search & Category Filter Bar */}
        <div className="palette-controls">
          <div className="palette-search-wrapper">
            <span className="search-icon">🔍</span>
            <input
              ref={searchInputRef}
              type="text"
              className="palette-search-input"
              placeholder="Search workflows, metrics, people, or actions..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setHighlightedIndex(0);
              }}
            />
            {searchQuery && (
              <button className="clear-search-btn" onClick={() => setSearchQuery("")}>
                ✕
              </button>
            )}
          </div>

          <div className="palette-category-pills">
            {WORKFLOW_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`category-pill ${selectedCategory === cat.id ? "active" : ""}`}
                onClick={() => {
                  setSelectedCategory(cat.id);
                  setHighlightedIndex(0);
                }}
              >
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Workflow Cards List */}
        <div className="palette-agent-list">
          {filteredWorkflows.length === 0 ? (
            <div className="palette-empty-state">
              <span>No workflows match "{searchQuery}"</span>
              <button
                type="button"
                className="reset-filter-btn"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("all");
                }}
              >
                Reset Filters
              </button>
            </div>
          ) : (
            filteredWorkflows.map((wf, idx) => {
              const isExpanded = expandedWorkflowId === wf.id;
              const isHighlighted = idx === highlightedIndex;

              return (
                <div 
                  key={wf.id} 
                  className={`palette-workflow-card ${isHighlighted ? "highlighted" : ""}`}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                >
                  <div className="workflow-card-main">
                    <div className="workflow-card-identity">
                      <span className="workflow-card-icon">{wf.icon}</span>
                      <div className="workflow-card-info">
                        <div className="workflow-title-row">
                          <span className="workflow-card-title">{wf.title}</span>
                          <span className="workflow-domain-badge">{wf.domain}</span>
                        </div>
                        <p className="workflow-card-desc">{wf.shortDescription}</p>
                      </div>
                    </div>

                    <div className="workflow-card-actions">
                      <button
                        type="button"
                        className="workflow-options-btn"
                        onClick={(e) => toggleOptions(e, wf.id)}
                        title="Scenario options & custom prompts"
                      >
                        {isExpanded ? "▾" : "⋯"}
                      </button>
                      <button
                        type="button"
                        className="workflow-run-btn"
                        onClick={() => handleRunWorkflow(wf.text)}
                        disabled={isRunning}
                        title="Run workflow analysis"
                      >
                        Run →
                      </button>
                    </div>
                  </div>

                  {/* Progressive Disclosure: Scenario Options */}
                  {isExpanded && wf.hints && (
                    <div className="workflow-scenarios-panel">
                      <div className="scenarios-panel-header">
                        <span>Targeted Scenarios & Prompts:</span>
                      </div>
                      <div className="scenarios-list">
                        {wf.hints.map((hint, hIdx) => (
                          <div key={hIdx} className="scenario-item">
                            <span className="scenario-bullet">💡</span>
                            <span className="scenario-text">{hint}</span>
                            <div className="scenario-actions">
                              <button
                                type="button"
                                className="scenario-edit-btn"
                                onClick={() => handleEditWorkflow(hint)}
                                title="Insert into message composer"
                              >
                                Edit ✏️
                              </button>
                              <button
                                type="button"
                                className="scenario-run-btn"
                                onClick={() => handleRunWorkflow(hint)}
                                disabled={isRunning}
                                title="Send immediately"
                              >
                                Run →
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
          <div className="palette-footer-shortcuts">
            <span><kbd>↑</kbd> <kbd>↓</kbd> to navigate</span>
            <span><kbd>↵</kbd> to run</span>
            <span><kbd>Esc</kbd> to close</span>
          </div>
          <span className="palette-count">{filteredWorkflows.length} Workflows</span>
        </div>
      </div>
    </div>
  );
}

export default AgentPromptPalette;

