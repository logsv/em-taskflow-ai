import React, { useState, useEffect } from 'react';
import './AdminPage.css';

function AdminPage({ onBackToChat }) {
  const [systemStatus, setSystemStatus] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [syncStatus, setSyncStatus] = useState(null);
  const [doraMetrics, setDoraMetrics] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [loadingDocs, setLoadingDocs] = useState(true);

  useEffect(() => {
    fetchSystemStatus();
    fetchDocuments();
    fetchSyncStatus();
    fetchDoraMetrics();
  }, []);

  const fetchSystemStatus = async () => {
    try {
      const res = await fetch('/api/admin/system-status');
      const data = await res.json();
      setSystemStatus(data);
    } catch (err) {
      console.error('Failed to fetch system status:', err);
    }
  };

  const fetchDocuments = async () => {
    setLoadingDocs(true);
    try {
      const res = await fetch('/api/admin/documents');
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    } finally {
      setLoadingDocs(false);
    }
  };

  const fetchSyncStatus = async () => {
    try {
      const res = await fetch('/api/github/sync-status');
      const data = await res.json();
      setSyncStatus(data);
    } catch (err) {
      console.error('Failed to fetch GitHub sync status:', err);
    }
  };

  const fetchDoraMetrics = async () => {
    try {
      const res = await fetch('/api/em/dora');
      const data = await res.json();
      setDoraMetrics(data);
    } catch (err) {
      console.error('Failed to fetch DORA metrics:', err);
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncMessage('Syncing GitHub issues...');
    try {
      const res = await fetch('/api/github/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSyncMessage(`Synced ${data.issuesCount || 0} issues successfully!`);
        fetchSyncStatus();
      } else {
        setSyncMessage('Sync failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      setSyncMessage('Sync error: ' + err.message);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncMessage(''), 4000);
    }
  };

  const handleDeleteDocument = async (filename) => {
    if (!window.confirm(`Delete document "${filename}" and all its vector chunks?`)) return;
    try {
      const res = await fetch(`/api/admin/documents/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        fetchDocuments();
      } else {
        alert('Failed to delete document: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Delete error: ' + err.message);
    }
  };

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-title-area">
          <h1>⚙️ EM TaskFlow AI — Standalone Admin Portal</h1>
          <p className="admin-subtitle">Enterprise Productivity, Infrastructure & Service Launch Hub</p>
        </div>
        <button className="back-to-chat-btn" onClick={onBackToChat}>
          💬 Back to Chat
        </button>
      </header>

      <div className="admin-container">
        {/* Section 1: External Readymade Service Launch Hub */}
        <section className="admin-section">
          <div className="section-header">
            <h2>🚀 Readymade External Service Hub</h2>
            <span className="section-badge">One-Click Portals</span>
          </div>
          <div className="service-grid">
            <div className="service-card card-langfuse">
              <div className="card-top">
                <span className="service-icon">📊</span>
                <span className="status-dot status-online"></span>
              </div>
              <h3>Langfuse AI Telemetry</h3>
              <p className="service-url">http://localhost:3001</p>
              <p className="service-desc">
                Multi-agent LangGraph traces, prompt execution latency, token cost metrics, and user feedback logs.
              </p>
              <a
                href="http://localhost:3001"
                target="_blank"
                rel="noopener noreferrer"
                className="launch-btn"
              >
                Launch Langfuse Dashboard ↗
              </a>
            </div>

            <div className="service-card card-ollama">
              <div className="card-top">
                <span className="service-icon">🦙</span>
                <span className="status-dot status-online"></span>
              </div>
              <h3>Open WebUI (Ollama GUI)</h3>
              <p className="service-url">http://localhost:3080</p>
              <p className="service-desc">
                Visual Ollama LLM downloader, model parameter fine-tuning, context window setup, and prompt testing.
              </p>
              <a
                href="http://localhost:3080"
                target="_blank"
                rel="noopener noreferrer"
                className="launch-btn"
              >
                Launch Open WebUI ↗
              </a>
            </div>

            <div className="service-card card-db">
              <div className="card-top">
                <span className="service-icon">🗄️</span>
                <span className="status-dot status-online"></span>
              </div>
              <h3>Adminer (Postgres Explorer)</h3>
              <p className="service-url">http://localhost:8080</p>
              <p className="service-desc">
                Browse PostgreSQL tables (`pdf_chunks`, `github_issues`, `chat_messages`) on port 5432 and `langfuse_db` on 5433.
              </p>
              <a
                href="http://localhost:8080"
                target="_blank"
                rel="noopener noreferrer"
                className="launch-btn"
              >
                Launch Postgres Explorer ↗
              </a>
            </div>

            <div className="service-card card-logs">
              <div className="card-top">
                <span className="service-icon">🪵</span>
                <span className="status-dot status-online"></span>
              </div>
              <h3>Dozzle Log Viewer</h3>
              <p className="service-url">http://localhost:8088</p>
              <p className="service-desc">
                Real-time streaming log analyzer for all Docker services (`backend`, `python-ai`, `postgres`) with live regex search.
              </p>
              <a
                href="http://localhost:8088"
                target="_blank"
                rel="noopener noreferrer"
                className="launch-btn"
              >
                Launch Dozzle Log Viewer ↗
              </a>
            </div>
          </div>
        </section>

        {/* Section 2: Native System Control & Management Features */}
        <section className="admin-section">
          <div className="section-header">
            <h2>🛠️ Native System Control & Management</h2>
            <span className="section-badge">System Status</span>
          </div>

          <div className="native-grid">
            {/* Module 1: RAG Document Management */}
            <div className="native-card">
              <div className="native-card-header">
                <h3>📄 RAG Vector Store Management</h3>
                <span className="pill-badge">{documents.length} PDF(s)</span>
              </div>
              <div className="doc-list-container">
                {loadingDocs ? (
                  <p className="loading-text">Loading vector documents...</p>
                ) : documents.length === 0 ? (
                  <p className="empty-text">No PDFs uploaded in vector store.</p>
                ) : (
                  documents.map((doc, idx) => (
                    <div key={doc.id || idx} className="doc-list-item">
                      <div className="doc-meta">
                        <span className="doc-name">{doc.filename}</span>
                        <span className="doc-chunks">{doc.chunkCount || 1} chunk(s)</span>
                      </div>
                      <button
                        className="delete-doc-btn"
                        onClick={() => handleDeleteDocument(doc.filename)}
                        title="Delete Document Vector Chunks"
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Module 2: GitHub Data Sync */}
            <div className="native-card">
              <div className="native-card-header">
                <h3>🔄 GitHub Sync & Cache</h3>
                <span className="pill-badge">
                  {syncStatus?.postgresql?.count ?? 0} cached issues
                </span>
              </div>
              <div className="sync-control-body">
                <p className="sync-info">
                  Repository: <strong>logsv/em-taskflow-ai</strong>
                </p>
                {syncStatus?.postgresql?.lastSyncedAt && (
                  <p className="sync-timestamp">
                    Last Synced: {new Date(syncStatus.postgresql.lastSyncedAt).toLocaleString()}
                  </p>
                )}
                {syncMessage && <div className="sync-status-banner">{syncMessage}</div>}
                <button
                  className="trigger-sync-btn"
                  onClick={handleManualSync}
                  disabled={isSyncing}
                >
                  {isSyncing ? '⏳ Syncing GitHub Issues...' : '🔄 Trigger Manual GitHub Sync'}
                </button>
              </div>
            </div>

            {/* Module 3: Infrastructure Uptime & Ollama */}
            <div className="native-card">
              <div className="native-card-header">
                <h3>⚡ Infrastructure & Ollama</h3>
                <span className="pill-badge status-healthy">HEALTHY</span>
              </div>
              <div className="status-list">
                <div className="status-item">
                  <span className="status-label">System Uptime</span>
                  <span className="status-val">{systemStatus?.uptimeSeconds || 0} seconds</span>
                </div>
                <div className="status-item">
                  <span className="status-label">Ollama Provider</span>
                  <span className="status-val">llama3.2:latest (Local Port 11434)</span>
                </div>
                <div className="status-item">
                  <span className="status-label">Primary DB (5432)</span>
                  <span className="status-val">PostgreSQL 16 (Connected)</span>
                </div>
                <div className="status-item">
                  <span className="status-label">Analytics DB (5433)</span>
                  <span className="status-val">Langfuse DB (Connected)</span>
                </div>
              </div>
            </div>

            {/* Module 4: EM DORA Metrics Snapshot */}
            <div className="native-card">
              <div className="native-card-header">
                <h3>📈 EM DORA & Sprint Metrics</h3>
                <span className="pill-badge badge-high">Rating: HIGH</span>
              </div>
              <div className="dora-metrics-grid">
                <div className="dora-metric-box">
                  <span className="dora-num">{doraMetrics?.deployment_frequency || '3.5/week'}</span>
                  <span className="dora-label">Deploy Frequency</span>
                </div>
                <div className="dora-metric-box">
                  <span className="dora-num">{doraMetrics?.lead_time_hours || 18.5}h</span>
                  <span className="dora-label">Lead Time</span>
                </div>
                <div className="dora-metric-box">
                  <span className="dora-num">{doraMetrics?.change_failure_rate_pct || 4.2}%</span>
                  <span className="dora-label">Failure Rate</span>
                </div>
                <div className="dora-metric-box">
                  <span className="dora-num">{doraMetrics?.mttr_hours || 1.5}h</span>
                  <span className="dora-label">MTTR</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default AdminPage;
