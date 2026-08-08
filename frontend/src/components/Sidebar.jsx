import React, { useState, useRef } from 'react';
import { useGithubSync } from '../hooks/useGithubSync.js';
import { useRagDocuments } from '../hooks/useRagDocuments.js';
import './Sidebar.css';

function Sidebar({ sessionSummary, isOpen, setIsOpen, onOpenAdmin }) {
  const { isSyncing, syncStatus, syncMessage, handleGithubSync } = useGithubSync();
  const { documents, isLoading, isUploading, uploadStatus, uploadPdfFile, fetchDocuments } = useRagDocuments();
  const [isRagSectionOpen, setIsRagSectionOpen] = useState(true);
  const fileInputRef = useRef(null);

  const handleSidebarFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadPdfFile(file);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  const startNewChat = () => {
    console.log('Starting new chat...');
    window.location.reload();
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className="sidebar-overlay" onClick={toggleSidebar} />
      )}
      
      <aside className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <button className="sidebar-toggle" onClick={toggleSidebar}>
            <span className="hamburger-icon">☰</span>
          </button>
          
          <button className="new-chat-btn" onClick={startNewChat}>
            <span className="plus-icon">+</span>
            <span className="new-chat-text">New chat</span>
          </button>
        </div>

        {syncMessage && (
          <div className="sync-toast">{syncMessage}</div>
        )}

        <div className="chat-history">
          {/* Collapsible RAG Uploaded PDF Files Section */}
          <div className="history-header rag-history-header" onClick={() => setIsRagSectionOpen(!isRagSectionOpen)}>
            <div className="rag-header-title">
              <span className="collapse-arrow">{isRagSectionOpen ? '▼' : '►'}</span>
              <h3>PDF Docs (RAG)</h3>
            </div>
            <button
              className="sidebar-upload-btn"
              onClick={(e) => { e.stopPropagation(); triggerFileSelect(); }}
              title="Upload new PDF document"
              disabled={isUploading}
            >
              {isUploading ? '⏳' : '+ PDF'}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleSidebarFileUpload}
              accept="application/pdf"
              style={{ display: 'none' }}
            />
          </div>

          {uploadStatus && (
            <div className="sync-toast rag-upload-toast">{uploadStatus}</div>
          )}

          {isRagSectionOpen && (
            <div className="rag-doc-list">
              {isLoading ? (
                <div className="rag-doc-empty">Loading documents...</div>
              ) : documents.length === 0 ? (
                <div className="rag-doc-empty">
                  <span>No PDFs uploaded yet.</span>
                  <button className="upload-inline-link" onClick={triggerFileSelect}>
                    Upload a PDF
                  </button>
                </div>
              ) : (
                documents.map((doc, idx) => (
                  <div key={doc.id || idx} className="rag-doc-item" title={doc.filename}>
                    <span className="rag-doc-icon">📄</span>
                    <div className="rag-doc-info">
                      <span className="rag-doc-name">{doc.filename}</span>
                      <span className="rag-doc-meta">
                        {doc.chunkCount || 1} chunk(s)
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          <div className="history-header" style={{ marginTop: '16px' }}>
            <h3>Session</h3>
          </div>

          <div className="session-card">
            <div className="session-row">
              <span className="session-label">Status</span>
              <span className="session-value">
                {sessionSummary?.created ? 'New session' : 'Active session'}
              </span>
            </div>
            <div className="session-row">
              <span className="session-label">Session ID</span>
              <span className="session-value session-mono">
                {sessionSummary?.sessionId || 'Loading...'}
              </span>
            </div>
            <div className="session-row">
              <span className="session-label">Thread ID</span>
              <span className="session-value session-mono">
                {sessionSummary?.threadId || 'Pending'}
              </span>
            </div>
          </div>

          {/* GitHub Cache Info Card */}
          <div className="history-header" style={{ marginTop: '16px' }}>
            <h3>GitHub DB Cache</h3>
          </div>
          <div className="session-card github-cache-card">
            <div className="session-row">
              <span className="session-label">PostgreSQL</span>
              <span className="session-value">
                {syncStatus?.postgresql?.count ?? 0} issues
              </span>
            </div>
            {syncStatus?.postgresql?.lastSyncedAt && (
              <div className="session-row">
                <span className="session-label">Last Synced</span>
                <span className="session-value session-mono" style={{ fontSize: '11px' }}>
                  {new Date(syncStatus.postgresql.lastSyncedAt).toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">👤</div>
            <div className="user-details">
              <div className="user-name">EM TaskFlow User</div>
              <div className="user-status">Free Plan</div>
            </div>
          </div>
          <a
            href="/admin"
            target="_blank"
            rel="noopener noreferrer"
            className="admin-portal-link-btn"
            style={{
              marginTop: '10px',
              width: '100%',
              padding: '8px 12px',
              backgroundColor: '#1e293b',
              color: '#38bdf8',
              border: '1px solid #334155',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justify: 'center',
              gap: '6px',
              textDecoration: 'none',
              boxSizing: 'border-box',
            }}
          >
            <span>⚙️</span> Admin Portal ↗
          </a>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
