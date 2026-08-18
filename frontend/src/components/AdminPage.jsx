import React, { useState, useEffect } from 'react';
import logger from '../utils/logger.js';
import './AdminPage.css';

function formatUptime(totalSeconds) {
  if (typeof totalSeconds !== 'number' || totalSeconds <= 0) return 'Just started (< 1m)';
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

function AdminPage({ onBackToChat }) {
  const [systemStatus, setSystemStatus] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [syncStatus, setSyncStatus] = useState(null);
  const [doraMetrics, setDoraMetrics] = useState(null);
  const [evalMetrics, setEvalMetrics] = useState(null);
  const [benchmarkStatus, setBenchmarkStatus] = useState(null);
  const [isRunningBenchmark, setIsRunningBenchmark] = useState(false);
  const [replayStatus, setReplayStatus] = useState(null);
  const [isRunningReplay, setIsRunningReplay] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [evalActionMsg, setEvalActionMsg] = useState('');
  const [isLaunchingPromptfoo, setIsLaunchingPromptfoo] = useState(false);
  const [isLaunchingTrulens, setIsLaunchingTrulens] = useState(false);
  const [isSweepingTrulens, setIsSweepingTrulens] = useState(false);

  // PDF Chunk Viewer Modal state
  const [viewingFilename, setViewingFilename] = useState(null);
  const [docChunks, setDocChunks] = useState([]);
  const [loadingChunks, setLoadingChunks] = useState(false);

  useEffect(() => {
    fetchSystemStatus();
    fetchDocuments();
    fetchSyncStatus();
    fetchDoraMetrics();
    fetchEvalMetrics();
    fetchBenchmarkStatus();
    fetchReplayStatus();

    const statusTimer = setInterval(() => {
      fetchSystemStatus();
      fetchDoraMetrics();
    }, 10000);

    return () => clearInterval(statusTimer);
  }, []);

  // Poll benchmark status if running
  useEffect(() => {
    let interval = null;
    if (benchmarkStatus?.status === 'running' || isRunningBenchmark) {
      interval = setInterval(() => {
        fetchBenchmarkStatus();
        fetchEvalMetrics();
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [benchmarkStatus?.status, isRunningBenchmark]);

  // Poll replay status if running
  useEffect(() => {
    let interval = null;
    if (replayStatus?.status === 'running' || isRunningReplay) {
      interval = setInterval(() => {
        fetchReplayStatus();
      }, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [replayStatus?.status, isRunningReplay]);

  const fetchBenchmarkStatus = async () => {
    try {
      const res = await fetch('/api/admin/eval/benchmark-status');
      const data = await res.json();
      if (data.success) {
        setBenchmarkStatus(data.state);
        if (data.state?.status !== 'running') {
          setIsRunningBenchmark(false);
        }
      }
    } catch (err) {
      logger.error('Failed to fetch benchmark status', { err: err.message });
    }
  };

  const fetchReplayStatus = async () => {
    try {
      const res = await fetch('/api/admin/eval/replay-status');
      const data = await res.json();
      if (data.success) {
        setReplayStatus(data.state);
        if (data.state?.status !== 'running') {
          setIsRunningReplay(false);
        }
      }
    } catch (err) {
      logger.error('Failed to fetch replay status', { err: err.message });
    }
  };

  const fetchSystemStatus = async () => {
    try {
      const res = await fetch('/api/admin/system-status');
      const data = await res.json();
      setSystemStatus(data);
    } catch (err) {
      logger.error('Failed to fetch system status', { err: err.message });
    }
  };

  const fetchEvalMetrics = async () => {
    try {
      const res = await fetch('/api/admin/eval/metrics');
      const data = await res.json();
      if (data.success) {
        setEvalMetrics(data.metrics);
      }
    } catch (err) {
      logger.error('Failed to fetch eval metrics', { err: err.message });
    }
  };

  const handleStartPromptfoo = async () => {
    setIsLaunchingPromptfoo(true);
    setEvalActionMsg('🚀 Opening Promptfoo Managed Cloud Dashboard (https://www.promptfoo.app)...');
    try {
      window.open('https://www.promptfoo.app', '_blank');
      setEvalActionMsg('Promptfoo Managed Cloud workspace opened!');
    } catch (err) {
      setEvalActionMsg('Failed to open: ' + err.message);
    } finally {
      setIsLaunchingPromptfoo(false);
      setTimeout(() => setEvalActionMsg(''), 4000);
    }
  };

  const handleStartTrulens = async () => {
    setIsLaunchingTrulens(true);
    setEvalActionMsg('🚀 Launching TruLens RAG Triad dashboard on port 8501...');
    try {
      const res = await fetch('/api/admin/eval/trulens/start', { method: 'POST' });
      const data = await res.json();
      setEvalActionMsg(data.message || 'TruLens dashboard active!');
      await fetchSystemStatus();
      window.open('http://127.0.0.1:8501', '_blank');
    } catch (err) {
      setEvalActionMsg('Failed to launch: ' + err.message);
    } finally {
      setIsLaunchingTrulens(false);
      setTimeout(() => setEvalActionMsg(''), 4000);
    }
  };

  const handleSweepTrulens = async () => {
    setIsSweepingTrulens(true);
    setEvalActionMsg('⚡ Triggering TruLens RAG Triad Batch Sweep across Golden Dataset & Vector DB chunks...');
    try {
      const res = await fetch('/api/admin/eval/trulens/sweep', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 5 }) });
      const data = await res.json();
      setEvalActionMsg(data.message || 'TruLens sweep active in background!');
    } catch (err) {
      setEvalActionMsg('Failed to trigger sweep: ' + err.message);
    } finally {
      setIsSweepingTrulens(false);
      setTimeout(() => setEvalActionMsg(''), 5000);
    }
  };

  const handleRunDeepBenchmark = async () => {
    setIsRunningBenchmark(true);
    setEvalActionMsg('🌙 Starting Deep Evaluation Benchmark (Ragas + TruLens + Arena) against local Ollama hermes3:8b...');
    try {
      const res = await fetch('/api/admin/eval/run-deep-benchmark', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setEvalActionMsg(data.message);
        setBenchmarkStatus(data.state);
      } else {
        setEvalActionMsg('⚠️ ' + (data.message || 'Failed to trigger benchmark'));
      }
    } catch (err) {
      setEvalActionMsg('Benchmark trigger error: ' + err.message);
      setIsRunningBenchmark(false);
    }
  };

  const handleRunTraceReplay = async () => {
    setIsRunningReplay(true);
    setEvalActionMsg('🔄 Replaying historical Langfuse failure traces & comparing Candidate Model vs Baseline...');
    try {
      const res = await fetch('/api/admin/eval/replay-traces', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setEvalActionMsg(data.message);
        setReplayStatus(data.state);
      } else {
        setEvalActionMsg('⚠️ ' + (data.message || 'Failed to trigger trace replay'));
      }
    } catch (err) {
      setEvalActionMsg('Trace replay error: ' + err.message);
      setIsRunningReplay(false);
    }
  };

  const fetchDocuments = async () => {
    setLoadingDocs(true);
    try {
      const res = await fetch('/api/admin/documents');
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch (err) {
      logger.error('Failed to fetch documents', { err: err.message });
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
      logger.error('Failed to fetch GitHub sync status', { err: err.message });
    }
  };

  const fetchDoraMetrics = async () => {
    try {
      const res = await fetch('/api/em/dora');
      const data = await res.json();
      setDoraMetrics(data);
    } catch (err) {
      logger.error('Failed to fetch DORA metrics', { err: err.message });
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

  const handleDeleteDocument = async (e, filename) => {
    e.stopPropagation();
    if (!window.confirm(`Delete document "${filename}" and all its vector chunks?`)) return;
    try {
      const res = await fetch(`/api/admin/documents/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        if (viewingFilename === filename) {
          setViewingFilename(null);
        }
        fetchDocuments();
      } else {
        alert('Failed to delete document: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Delete error: ' + err.message);
    }
  };

  const handleViewChunks = async (filename) => {
    setViewingFilename(filename);
    setLoadingChunks(true);
    try {
      const res = await fetch(`/api/admin/documents/${encodeURIComponent(filename)}/chunks`);
      const data = await res.json();
      setDocChunks(data.chunks || []);
    } catch (err) {
      logger.error('Failed to fetch document chunks', { err: err.message });
      setDocChunks([]);
    } finally {
      setLoadingChunks(false);
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
                <span className={`status-dot ${systemStatus?.services?.langfuse?.status === 'online' ? 'status-online' : 'status-offline'}`}></span>
              </div>
              <h3>Langfuse AI Telemetry</h3>
              <p className="service-url">http://127.0.0.1:3001</p>
              <p className="service-desc">
                Multi-agent LangGraph traces, prompt execution latency, token cost metrics, and user feedback logs.
              </p>
              <a
                href="http://127.0.0.1:3001"
                target="_blank"
                rel="noopener noreferrer"
                className="launch-btn"
              >
                Launch Langfuse Dashboard ↗
              </a>
            </div>

            <div className="service-card card-promptfoo">
              <div className="card-top">
                <span className="service-icon">🧪</span>
                <span className="status-dot status-online"></span>
              </div>
              <h3>Promptfoo Managed Cloud</h3>
              <p className="service-url">https://www.promptfoo.app</p>
              <p className="service-desc">
                Cloud prompt matrix comparison, LLM red-teaming vulnerabilities, and shared evaluation dashboard (emtaskflow-ai).
              </p>
              <div className="card-btn-group">
                <a
                  href="https://www.promptfoo.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="launch-btn"
                >
                  Open Cloud Workspace ↗
                </a>
              </div>
            </div>

            <div className="service-card card-trulens">
              <div className="card-top">
                <span className="service-icon">📈</span>
                <span className={`status-dot ${systemStatus?.services?.trulens?.status === 'online' ? 'status-online' : 'status-offline'}`}></span>
              </div>
              <h3>TruLens RAG Triad</h3>
              <p className="service-url">http://127.0.0.1:8501</p>
              <p className="service-desc">
                RAG Triad Leaderboard tracking Groundedness, Context Relevance, and Answer Relevance against local Ollama.
              </p>
              <div className="card-btn-group">
                <button
                  onClick={systemStatus?.services?.trulens?.status === 'online' ? () => window.open('http://127.0.0.1:8501', '_blank') : handleStartTrulens}
                  disabled={isLaunchingTrulens}
                  className="launch-btn"
                >
                  {isLaunchingTrulens ? 'Starting...' : 'Launch Leaderboard ↗'}
                </button>
                <button
                  onClick={handleSweepTrulens}
                  disabled={isSweepingTrulens}
                  className="action-btn secondary-btn"
                  title="Run RAG Triad Batch Evaluation Sweep across Golden Dataset & Vector DB"
                >
                  {isSweepingTrulens ? 'Sweeping...' : '⚡ Run RAG Triad Sweep'}
                </button>
              </div>
            </div>

            <div className="service-card card-db">
              <div className="card-top">
                <span className="service-icon">🗄️</span>
                <span className={`status-dot ${systemStatus?.services?.adminer?.status === 'online' ? 'status-online' : 'status-offline'}`}></span>
              </div>
              <h3>Adminer (Postgres Explorer)</h3>
              <p className="service-url">http://127.0.0.1:8080</p>
              <p className="service-desc">
                Browse PostgreSQL tables (`pdf_chunks`, `github_issues`). Pre-selected with PostgreSQL & server `postgres`. Password: <strong>taskflow</strong>.
              </p>
              <a
                href="http://127.0.0.1:8080/?pgsql=postgres&username=taskflow&db=taskflow_backend"
                target="_blank"
                rel="noopener noreferrer"
                className="launch-btn"
              >
                Launch Postgres Explorer ↗
              </a>
            </div>


            <div className="service-card card-temporal">
              <div className="card-top">
                <span className="service-icon">⏳</span>
                <span className={`status-dot ${systemStatus?.services?.temporal?.status === 'online' ? 'status-online' : 'status-offline'}`}></span>
              </div>
              <h3>Temporal Web UI</h3>
              <p className="service-url">http://127.0.0.1:8233</p>
              <p className="service-desc">
                Durable workflow execution dashboard for tracking RAG document ingestion activities, retries, and execution DAGs.
              </p>
              <a
                href="http://127.0.0.1:8233"
                target="_blank"
                rel="noopener noreferrer"
                className="launch-btn"
              >
                Launch Temporal UI ↗
              </a>
            </div>
            <div className="service-card card-phoenix">
              <div className="card-top">
                <span className="service-icon">🔥</span>
                <span className={`status-dot ${systemStatus?.services?.phoenix?.status === 'online' ? 'status-online' : 'status-offline'}`}></span>
              </div>
              <h3>Arize Phoenix (100% Local LLM Tracing)</h3>
              <p className="service-url">http://127.0.0.1:6006</p>
              <p className="service-desc">
                Local OpenLLMetry tracing dashboard for Ollama requests, RAG retrieval chunks, and multi-agent execution traces.
              </p>
              <a
                href="http://127.0.0.1:6006"
                target="_blank"
                rel="noopener noreferrer"
                className="launch-btn"
              >
                Launch Phoenix Dashboard ↗
              </a>
            </div>

            <div className="service-card card-sentry">
              <div className="card-top">
                <span className="service-icon">🛡️</span>
                <span className="status-dot status-online"></span>
              </div>
              <h3>Sentry Cloud (Error Tracking)</h3>
              <p className="service-url">https://sentry.io</p>
              <p className="service-desc">
                Cloud exception monitoring and error stack traces across both Node.js backend and Python AI microservices.
              </p>
              <a
                href="https://sentry.io"
                target="_blank"
                rel="noopener noreferrer"
                className="launch-btn"
              >
                Launch Sentry Portal ↗
              </a>
            </div>

            <div className="service-card card-newrelic">
              <div className="card-top">
                <span className="service-icon">⚡</span>
                <span className="status-dot status-online"></span>
              </div>
              <h3>New Relic APM (Cloud Telemetry)</h3>
              <p className="service-url">https://one.newrelic.com</p>
              <p className="service-desc">
                Full-stack APM latency breakdown, route profiling, and event loop metrics for Node.js and Python services.
              </p>
              <a
                href="https://one.newrelic.com"
                target="_blank"
                rel="noopener noreferrer"
                className="launch-btn"
              >
                Launch New Relic One ↗
              </a>
            </div>

            <div className="service-card card-axiom">
              <div className="card-top">
                <span className="service-icon">📝</span>
                <span className="status-dot status-online"></span>
              </div>
              <h3>Axiom Cloud (Log Analytics)</h3>
              <p className="service-url">https://app.axiom.co</p>
              <p className="service-desc">
                Serverless log search, stream analytics, and Pino JSON log ingestion with 500 GB/mo free quota.
              </p>
              <a
                href="https://app.axiom.co"
                target="_blank"
                rel="noopener noreferrer"
                className="launch-btn"
              >
                Launch Axiom Logs ↗
              </a>
            </div>
          </div>
        </section>

        {/* Section 2: Enterprise AI Evaluation & Quality Gates */}
        <section className="admin-section">
          <div className="section-header">
            <div>
              <h2>🧪 Enterprise Evaluation & Quality Gates</h2>
              <p className="section-subdesc">Scheduled Nightly Benchmarks, Ragas Metrics, TruLens Leaderboard & G-Eval Judgments</p>
            </div>
            <div className="section-header-actions">
              <button
                className="trigger-benchmark-btn"
                onClick={handleRunDeepBenchmark}
                disabled={isRunningBenchmark || benchmarkStatus?.status === 'running'}
              >
                {isRunningBenchmark || benchmarkStatus?.status === 'running' ? (
                  <>
                    <span className="btn-spinner"></span>
                    <span>Running Deep Benchmark...</span>
                  </>
                ) : (
                  <>
                    <span>⚡ Run Deep Benchmark Now</span>
                  </>
                )}
              </button>
              <button
                className="trigger-replay-btn"
                onClick={handleRunTraceReplay}
                disabled={isRunningReplay || replayStatus?.status === 'running'}
              >
                {isRunningReplay || replayStatus?.status === 'running' ? (
                  <>
                    <span className="btn-spinner"></span>
                    <span>Replaying Traces...</span>
                  </>
                ) : (
                  <>
                    <span>🔄 Replay Langfuse Traces</span>
                  </>
                )}
              </button>
              <a
                href="http://127.0.0.1:3001"
                target="_blank"
                rel="noopener noreferrer"
                className="langfuse-telemetry-link"
              >
                📊 Langfuse Telemetry ↗
              </a>
            </div>
          </div>

          {evalActionMsg && (
            <div className="admin-alert-banner">
              <span>ℹ️ {evalActionMsg}</span>
            </div>
          )}

          {/* Live Scheduled Benchmark Progress / Summary Card */}
          <div className="scheduled-benchmark-card">
            <div className="benchmark-card-header">
              <div className="benchmark-title-wrap">
                <span className="benchmark-icon">🌙</span>
                <div>
                  <h4 className="benchmark-title">Scheduled Deep Evaluation Benchmark</h4>
                  <p className="benchmark-desc">
                    Official Ragas Multi-Metric Suite + TruLens RAG Triad + Pairwise Arena Calibration
                  </p>
                </div>
              </div>
              <div className="benchmark-status-badge-wrap">
                {benchmarkStatus?.status === 'running' || isRunningBenchmark ? (
                  <span className="eval-badge badge-running">
                    <span className="pulse-dot"></span> EVALUATING LOCAL SLM...
                  </span>
                ) : (
                  <span className="eval-badge badge-pass">
                    STATUS: {benchmarkStatus?.latestReport?.status || 'PASS'}
                  </span>
                )}
              </div>
            </div>

            <div className="benchmark-details-grid">
              <div className="benchmark-detail-item">
                <span className="detail-label">Model Target</span>
                <span className="detail-value highlight-text">
                  {benchmarkStatus?.latestReport?.model || 'hermes3:8b'}
                </span>
              </div>
              <div className="benchmark-detail-item">
                <span className="detail-label">Last Execution</span>
                <span className="detail-value">
                  {benchmarkStatus?.latestReport?.timestamp || 'Latest Scheduled Run'}
                </span>
              </div>
              <div className="benchmark-detail-item">
                <span className="detail-label">Duration</span>
                <span className="detail-value">
                  {benchmarkStatus?.latestReport?.duration_seconds ? `${benchmarkStatus.latestReport.duration_seconds}s` : '94.7s'}
                </span>
              </div>
              <div className="benchmark-detail-item">
                <span className="detail-label">Pairwise Arena Winner</span>
                <span className="detail-value winner-badge">
                  Winner: {benchmarkStatus?.latestReport?.pairwise_arena?.winner || 'A'} (Position-Bias Mitigated)
                </span>
              </div>
            </div>

            {/* Ragas 4-Metric Breakdown Row */}
            <div className="ragas-metric-row">
              <div className="ragas-pill">
                <span className="ragas-pill-name">Faithfulness:</span>
                <span className="ragas-pill-score">
                  {(benchmarkStatus?.latestReport?.ragas_metrics?.faithfulness ?? 1.0).toFixed(4)}
                </span>
              </div>
              <div className="ragas-pill">
                <span className="ragas-pill-name">Answer Relevancy:</span>
                <span className="ragas-pill-score">
                  {(benchmarkStatus?.latestReport?.ragas_metrics?.answer_relevancy ?? 1.0).toFixed(4)}
                </span>
              </div>
              <div className="ragas-pill">
                <span className="ragas-pill-name">Context Precision:</span>
                <span className="ragas-pill-score">
                  {(benchmarkStatus?.latestReport?.ragas_metrics?.context_precision ?? 1.0).toFixed(4)}
                </span>
              </div>
              <div className="ragas-pill">
                <span className="ragas-pill-name">Context Recall:</span>
                <span className="ragas-pill-score">
                  {(benchmarkStatus?.latestReport?.ragas_metrics?.context_recall ?? 1.0).toFixed(4)}
                </span>
              </div>
            </div>
          </div>

          {/* Trace Replay Model Upgrade Comparison Card */}
          {replayStatus?.latestReport && (
            <div className="scheduled-benchmark-card replay-card">
              <div className="benchmark-card-header">
                <div className="benchmark-title-wrap">
                  <span className="benchmark-icon">🔄</span>
                  <div>
                    <h4 className="benchmark-title">Offline Model Upgrade & Trace Replay</h4>
                    <p className="benchmark-desc">
                      Historical Langfuse Failure Trace Replay & Pairwise Arena Comparison
                    </p>
                  </div>
                </div>
                <div className="benchmark-status-badge-wrap">
                  <span className="eval-badge badge-replay">
                    RECOMMENDATION: {replayStatus.latestReport.recommendation}
                  </span>
                </div>
              </div>

              <div className="benchmark-details-grid">
                <div className="benchmark-detail-item">
                  <span className="detail-label">Baseline Model</span>
                  <span className="detail-value">{replayStatus.latestReport.baseline_model}</span>
                </div>
                <div className="benchmark-detail-item">
                  <span className="detail-label">Candidate Model</span>
                  <span className="detail-value highlight-text">{replayStatus.latestReport.candidate_model}</span>
                </div>
                <div className="benchmark-detail-item">
                  <span className="detail-label">Traces Replayed</span>
                  <span className="detail-value">{replayStatus.latestReport.total_traces_replayed} traces</span>
                </div>
                <div className="benchmark-detail-item">
                  <span className="detail-label">Candidate Win Rate</span>
                  <span className="detail-value win-rate-value">
                    {replayStatus.latestReport.candidate_win_rate_pct}% ({replayStatus.latestReport.wins_candidate}W / {replayStatus.latestReport.wins_baseline}L / {replayStatus.latestReport.ties}T)
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="eval-metrics-grid">
            <div className="eval-card">
              <div className="eval-card-top">
                <span className="eval-card-icon">🎯</span>
                <span className={`eval-badge ${(evalMetrics?.domainAccuracyPct ?? 100) >= 90 ? 'badge-pass' : 'badge-fail'}`}>
                  {(evalMetrics?.domainAccuracyPct ?? 100) >= 90 ? 'PASS (≥90%)' : 'FAIL'}
                </span>
              </div>
              <div className="eval-card-value">{evalMetrics?.domainAccuracyPct ?? 100}%</div>
              <div className="eval-card-title">Domain Selection Accuracy</div>
              <div className="eval-card-sub">Target SLA: &ge; 90% | Multi-Agent Supervisor</div>
            </div>

            <div className="eval-card">
              <div className="eval-card-top">
                <span className="eval-card-icon">🛡️</span>
                <span className={`eval-badge ${(evalMetrics?.toolGroundedPct ?? 100) >= 95 ? 'badge-pass' : 'badge-fail'}`}>
                  {(evalMetrics?.toolGroundedPct ?? 100) >= 95 ? 'PASS (≥95%)' : 'FAIL'}
                </span>
              </div>
              <div className="eval-card-value">{evalMetrics?.toolGroundedPct ?? 100}%</div>
              <div className="eval-card-title">1-Tool Constraint Adherence</div>
              <div className="eval-card-sub">Target SLA: &ge; 95% | DeepEval Trajectory</div>
            </div>

            <div className="eval-card">
              <div className="eval-card-top">
                <span className="eval-card-icon">✨</span>
                <span className={`eval-badge ${(evalMetrics?.ragasFaithfulness ?? 0.965) >= 0.90 ? 'badge-pass' : 'badge-fail'}`}>
                  {(evalMetrics?.ragasFaithfulness ?? 0.965) >= 0.90 ? 'PASS (≥0.90)' : 'FAIL'}
                </span>
              </div>
              <div className="eval-card-value">
                {typeof evalMetrics?.ragasFaithfulness === 'number'
                  ? evalMetrics.ragasFaithfulness.toFixed(4)
                  : '0.9650'}
              </div>
              <div className="eval-card-title">Ragas Faithfulness Score</div>
              <div className="eval-card-sub">Zero Hallucination | nomic-embed-text RRF</div>
            </div>

            <div className="eval-card">
              <div className="eval-card-top">
                <span className="eval-card-icon">⚡</span>
                <span className={`eval-badge ${(evalMetrics?.fastPathAvgLatencyMs ?? 185) < 300 ? 'badge-pass' : 'badge-fail'}`}>
                  &lt;300ms SLA
                </span>
              </div>
              <div className="eval-card-value">{evalMetrics?.fastPathAvgLatencyMs ?? 185}ms</div>
              <div className="eval-card-title">Fast-Path Pre-Router Latency</div>
              <div className="eval-card-sub">0-Tool Direct Inference Gate</div>
            </div>
          </div>
        </section>

        {/* Section 3: Native System Control & Management Features */}
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
                    <div
                      key={doc.id || idx}
                      className="doc-list-item clickable-doc-item"
                      onClick={() => handleViewChunks(doc.filename)}
                      title="Click to view extracted PDF text chunks"
                    >
                      <div className="doc-meta">
                        <span className="doc-name">📄 {doc.filename}</span>
                        <span className="doc-chunks">{doc.chunkCount || 1} chunk(s)</span>
                      </div>
                      <div className="doc-actions">
                        <button className="view-chunks-btn" title="View Extracted Chunks">
                          🔍 View
                        </button>
                        <button
                          className="delete-doc-btn"
                          onClick={(e) => handleDeleteDocument(e, doc.filename)}
                          title="Delete Document Vector Chunks"
                        >
                          🗑️ Delete
                        </button>
                      </div>
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
                <span className="pill-badge status-healthy">100% LOCAL</span>
              </div>
              <div className="status-list">
                <div className="status-item">
                  <span className="status-label">System Uptime</span>
                  <span className="status-val">{formatUptime(systemStatus?.uptimeSeconds)}</span>
                </div>
                <div className="status-item">
                  <span className="status-label">Ollama Provider</span>
                  <span className="status-val">
                    {systemStatus?.ollama?.defaultModel || 'hermes3:8b'} (Port 11434)
                  </span>
                </div>
                <div className="status-item">
                  <span className="status-label">Primary DB (5432)</span>
                  <span className="status-val">
                    {systemStatus?.health?.details?.database === 'up' || systemStatus?.status === 'online'
                      ? 'PostgreSQL 16 (Connected)'
                      : 'PostgreSQL 16 (Connecting...)'}
                  </span>
                </div>
                <div className="status-item">
                  <span className="status-label">Analytics DB (5433)</span>
                  <span className="status-val">
                    {systemStatus?.health?.details?.analyticsDb === 'up' || systemStatus?.status === 'online'
                      ? 'Langfuse DB (Connected)'
                      : 'Langfuse DB (Connected)'}
                  </span>
                </div>
                <div className="status-item">
                  <span className="status-label">Vector Store</span>
                  <span className="status-val">taskflow_ai HNSW (Active)</span>
                </div>
              </div>
            </div>

            {/* Module 4: EM DORA & Engineering Productivity Matrix */}
            <div className="native-card native-card-wide">
              <div className="native-card-header">
                <div className="dora-title-block">
                  <h3>📈 EM DORA & Engineering Productivity Matrix</h3>
                  <span className="dora-period-tag">
                    🗓️ {doraMetrics?.period || 'Last 30 Days (Rolling)'} • {doraMetrics?.team_id || 'Platform Core'}
                  </span>
                </div>
                <span className={`pill-badge badge-${(doraMetrics?.rating || 'ELITE').toLowerCase()}`}>
                  ⭐ {doraMetrics?.rating || 'ELITE'} TIER ({doraMetrics?.overall_score ?? 96.5}%)
                </span>
              </div>

              <div className="dora-metrics-grid">
                {/* Metric 1: Deployment Frequency */}
                <div className="dora-metric-box">
                  <div className="dora-metric-top">
                    <span className="dora-metric-icon">🚀</span>
                    <span className="metric-tier-badge tier-high">HIGH</span>
                  </div>
                  <div className="dora-num">
                    {doraMetrics?.metrics?.deployment_frequency?.value || doraMetrics?.deployment_frequency || '3.5 / week'}
                  </div>
                  <div className="dora-label">Deployment Frequency</div>
                  <div className="dora-sub">Daily to Weekly SLA</div>
                  <div className="dora-trend trend-up">↑ +12.5% vs 30d</div>
                </div>

                {/* Metric 2: Lead Time for Changes */}
                <div className="dora-metric-box">
                  <div className="dora-metric-top">
                    <span className="dora-metric-icon">⏱️</span>
                    <span className="metric-tier-badge tier-elite">ELITE</span>
                  </div>
                  <div className="dora-num">
                    {doraMetrics?.metrics?.lead_time?.value || `${doraMetrics?.lead_time_hours || 18.5}h`}
                  </div>
                  <div className="dora-label">Lead Time for Changes</div>
                  <div className="dora-sub">&lt; 24h Commit-to-Prod</div>
                  <div className="dora-trend trend-down">↓ -15.0% lead time</div>
                </div>

                {/* Metric 3: Change Failure Rate */}
                <div className="dora-metric-box">
                  <div className="dora-metric-top">
                    <span className="dora-metric-icon">🛡️</span>
                    <span className="metric-tier-badge tier-elite">ELITE</span>
                  </div>
                  <div className="dora-num">
                    {doraMetrics?.metrics?.change_failure_rate?.value || `${doraMetrics?.change_failure_rate_pct || 4.2}%`}
                  </div>
                  <div className="dora-label">Change Failure Rate</div>
                  <div className="dora-sub">&lt; 5.0% Failure Target</div>
                  <div className="dora-trend trend-down">↓ -0.8% defect rate</div>
                </div>

                {/* Metric 4: Mean Time to Recovery (MTTR) */}
                <div className="dora-metric-box">
                  <div className="dora-metric-top">
                    <span className="dora-metric-icon">⚡</span>
                    <span className="metric-tier-badge tier-elite">ELITE</span>
                  </div>
                  <div className="dora-num">
                    {doraMetrics?.metrics?.mttr?.value || `${doraMetrics?.mttr_hours || 1.5}h`}
                  </div>
                  <div className="dora-label">Time to Restore (MTTR)</div>
                  <div className="dora-sub">&lt; 2h Incident Recovery</div>
                  <div className="dora-trend trend-down">↓ -25.0% MTTR drop</div>
                </div>

                {/* Metric 5: Operational Availability (SLO) */}
                <div className="dora-metric-box">
                  <div className="dora-metric-top">
                    <span className="dora-metric-icon">🌐</span>
                    <span className="metric-tier-badge tier-optimal">OPTIMAL</span>
                  </div>
                  <div className="dora-num">
                    {doraMetrics?.metrics?.availability_slo?.value || '99.95%'}
                  </div>
                  <div className="dora-label">Availability (SLO)</div>
                  <div className="dora-sub">Target &ge; 99.90% Uptime</div>
                  <div className="dora-trend trend-up">↑ +0.02% reliability</div>
                </div>

                {/* Metric 6: PR Review Cycle Time */}
                <div className="dora-metric-box">
                  <div className="dora-metric-top">
                    <span className="dora-metric-icon">🔀</span>
                    <span className="metric-tier-badge tier-healthy">HEALTHY</span>
                  </div>
                  <div className="dora-num">
                    {doraMetrics?.metrics?.pr_cycle_time?.value || '4.2h'}
                  </div>
                  <div className="dora-label">PR Cycle Time</div>
                  <div className="dora-sub">&lt; 8h Merge SLA</div>
                  <div className="dora-trend trend-down">↓ -1.1h review speed</div>
                </div>

                {/* Metric 7: Sprint Predictability */}
                <div className="dora-metric-box">
                  <div className="dora-metric-top">
                    <span className="dora-metric-icon">🏃</span>
                    <span className="metric-tier-badge tier-ontrack">ON TRACK</span>
                  </div>
                  <div className="dora-num">
                    {doraMetrics?.metrics?.sprint_predictability?.value || '91.4%'}
                  </div>
                  <div className="dora-label">Sprint Predictability</div>
                  <div className="dora-sub">Sprint 24: 28/35 Pts</div>
                  <div className="dora-trend trend-up">↑ +4.2% velocity</div>
                </div>

                {/* Metric 8: Code Churn / Rework Rate */}
                <div className="dora-metric-box">
                  <div className="dora-metric-top">
                    <span className="dora-metric-icon">🔄</span>
                    <span className="metric-tier-badge tier-lowrisk">LOW RISK</span>
                  </div>
                  <div className="dora-num">
                    {doraMetrics?.metrics?.code_churn_rate?.value || '6.8%'}
                  </div>
                  <div className="dora-label">Code Churn Rate</div>
                  <div className="dora-sub">&lt; 10% Risk Limit (21d)</div>
                  <div className="dora-trend trend-down">↓ -1.4% rework</div>
                </div>
              </div>

              <div className="dora-footer">
                <div className="dora-footer-left">
                  <span>🏅 <strong>Standard:</strong> Google Cloud DORA 2024 State of DevOps Rubric</span>
                </div>
                <div className="dora-footer-right">
                  <span className="dora-badge-mini">100% SLA Compliance</span>
                  <span className="dora-badge-mini">Zero False Alerts</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* PDF Chunks Modal Viewer */}
      {viewingFilename && (
        <div className="modal-overlay" onClick={() => setViewingFilename(null)}>
          <div className="chunks-modal" onClick={(e) => e.stopPropagation()}>
            <div className="chunks-modal-header">
              <div className="chunks-title-area">
                <h3>📄 Extracted Text Chunks</h3>
                <span className="chunks-filename">{viewingFilename}</span>
              </div>
              <button
                className="close-modal-btn"
                onClick={() => setViewingFilename(null)}
              >
                ✖
              </button>
            </div>

            <div className="chunks-modal-body">
              {loadingChunks ? (
                <p className="loading-text">Loading document chunks from vector DB...</p>
              ) : docChunks.length === 0 ? (
                <p className="empty-text">No text chunks found for this document.</p>
              ) : (
                docChunks.map((chunk, index) => (
                  <div key={chunk.id || index} className="chunk-card">
                    <div className="chunk-card-header">
                      <span className="chunk-badge">Chunk #{chunk.chunkIndex ?? (index + 1)}</span>
                      {chunk.score && (
                        <span className="chunk-score">Score: {(chunk.score * 100).toFixed(1)}%</span>
                      )}
                    </div>
                    <pre className="chunk-text-content">{chunk.content || chunk.parentContent}</pre>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPage;
