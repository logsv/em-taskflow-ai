import React, { useState, useEffect, useCallback } from 'react';
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react';
import Chat from './components/Chat';
import Sidebar from './components/Sidebar';
import AdminPage from './components/AdminPage';
import ActionHubPage from './components/ActionHubPage';
import DevSettingsModal from './components/DevSettingsModal';
import { apiUrl } from './services/apiClient';
import logger from './utils/logger';
import './App.css';

function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    sessionId: params.get('session') || params.get('sessionId') || null,
    threadId: params.get('thread') || params.get('threadId') || null,
  };
}

function syncUrl(sessionId, threadId) {
  if (window.location.pathname === '/admin' || window.location.pathname === '/actions') return;
  const currentParams = new URLSearchParams(window.location.search);
  const currentSession = currentParams.get('session') || currentParams.get('sessionId');
  const currentThread = currentParams.get('thread') || currentParams.get('threadId');

  if (currentSession !== sessionId || currentThread !== threadId) {
    const params = new URLSearchParams();
    if (sessionId) params.set('session', sessionId);
    if (threadId) params.set('thread', threadId);
    const queryString = params.toString();
    const newUrl = queryString ? `/?${queryString}` : '/';
    window.history.pushState({ sessionId, threadId }, '', newUrl);
  }
}

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessionSummary, setSessionSummary] = useState(null);
  const [useAdvancedMode, setUseAdvancedMode] = useState(false);
  const [sourcesMap, setSourcesMap] = useState({});
  const [traceMap, setTraceMap] = useState({});
  const [isDevSettingsOpen, setIsDevSettingsOpen] = useState(false);
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  const [currentView, setCurrentView] = useState(
    window.location.pathname === '/admin'
      ? 'admin'
      : window.location.pathname === '/actions'
      ? 'actions'
      : 'chat'
  );

  // Paginated session history state
  const [sessionsList, setSessionsList] = useState([]);
  const [sessionsPagination, setSessionsPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  });
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);

  // Global keyboard shortcuts (Cmd+K / Ctrl+K) for Quick Actions
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsQuickActionsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const fetchSessions = useCallback(async (page = 1) => {
    try {
      setIsSessionsLoading(true);
      const res = await fetch(apiUrl(`/sessions?page=${page}&limit=10`));
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.sessions)) {
          setSessionsList(data.sessions);
        }
        if (data?.pagination) {
          setSessionsPagination(data.pagination);
        }
      }
    } catch (err) {
      logger.error('Failed to fetch sessions', { error: err.message });
    } finally {
      setIsSessionsLoading(false);
    }
  }, []);

  const navigateToAdmin = () => {
    window.history.pushState({}, '', '/admin');
    setCurrentView('admin');
  };

  const navigateToActionHub = () => {
    window.history.pushState({}, '', '/actions');
    setCurrentView('actions');
  };

  const navigateToChat = () => {
    const params = new URLSearchParams();
    if (sessionSummary?.sessionId) params.set('session', sessionSummary.sessionId);
    if (sessionSummary?.threadId) params.set('thread', sessionSummary.threadId);
    const queryString = params.toString();
    const targetUrl = queryString ? `/?${queryString}` : '/';
    window.history.pushState({}, '', targetUrl);
    setCurrentView('chat');
  };

  // Local runtime adapter definition with stable reference
  const adapter = useMemo(() => ({
    async *run({ messages, abortSignal }) {
      const userMsg = messages[messages.length - 1];
      const textContent = Array.isArray(userMsg.content)
        ? userMsg.content.find(c => c.type === 'text')?.text || userMsg.content[0]?.text || ''
        : typeof userMsg.content === 'string' ? userMsg.content : '';
      
      const payload = {
        message: textContent,
        mode: useAdvancedMode ? 'advanced' : 'baseline',
      };
      if (sessionSummary?.threadId) {
        payload.threadId = sessionSummary.threadId;
      }
      
      const headers = { 'Content-Type': 'application/json' };
      if (sessionSummary?.sessionId) {
        headers['x-session-id'] = sessionSummary.sessionId;
      }

      const res = await fetch(apiUrl('/chat'), {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: abortSignal,
      });
      const data = await res.json();
      
      if (data?.threadId && data.threadId !== sessionSummary?.threadId) {
        setSessionSummary(prev => ({
          ...prev,
          threadId: data.threadId,
        }));
        if (sessionSummary?.sessionId) {
          syncUrl(sessionSummary.sessionId, data.threadId);
        }
      }

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to get response');
      }

      // Map sources & telemetry trace to assistant message index
      const assistantMessageIndex = messages.length;
      if (data?.sources) {
        setSourcesMap(prev => ({
          ...prev,
          [assistantMessageIndex]: data.sources,
        }));
      }
      if (data?.traceId || data?.messageId) {
        setTraceMap(prev => ({
          ...prev,
          [assistantMessageIndex]: {
            traceId: data.traceId || null,
            messageId: data.messageId || null,
          },
        }));
      }

      // Refresh sessions to update latest message snippets and timestamps
      fetchSessions(sessionsPagination.page || 1);

      yield {
        content: [{ type: 'text', text: data.answer || 'No response generated.' }]
      };
    }
  }), [useAdvancedMode, sessionSummary?.sessionId, sessionSummary?.threadId, fetchSessions, sessionsPagination.page]);

  const runtime = useLocalRuntime(adapter);

  // Load session from API and hydrate into assistant-ui runtime
  const loadSession = useCallback(async (targetSessionId = null, targetThreadId = null, updateHistory = true) => {
    try {
      const params = new URLSearchParams();
      if (targetSessionId) params.set('sessionId', targetSessionId);
      if (targetThreadId) params.set('threadId', targetThreadId);

      const url = params.toString() ? apiUrl(`/session?${params.toString()}`) : apiUrl('/session');
      const headers = {};
      if (targetSessionId) headers['x-session-id'] = targetSessionId;
      const response = await fetch(url, { headers });
      const data = await response.json();

      const resolvedSessionId = data?.sessionId || null;
      const resolvedThreadId = data?.threadId || null;

      setSessionSummary({
        sessionId: resolvedSessionId,
        threadId: resolvedThreadId,
        created: !!data?.created,
      });

      if (updateHistory && resolvedSessionId && resolvedThreadId) {
        syncUrl(resolvedSessionId, resolvedThreadId);
      }

      // Hydrate past messages into assistant-ui runtime thread
      const threadMessages = [];
      const newSourcesMap = {};
      const newTraceMap = {};

      if (Array.isArray(data?.messages) && data.messages.length > 0) {
        data.messages.forEach((msg, index) => {
          const role = msg.role === 'user' ? 'user' : msg.role === 'assistant' ? 'assistant' : 'system';
          threadMessages.push({
            id: msg.id || `msg_${index}`,
            role,
            content: [{ type: 'text', text: msg.content || '' }],
          });

          if (msg.citations && Array.isArray(msg.citations) && msg.citations.length > 0) {
            newSourcesMap[index] = msg.citations;
          }
          if (msg.trace_id || msg.traceId || msg.id) {
            newTraceMap[index] = {
              traceId: msg.trace_id || msg.traceId || null,
              messageId: msg.id || null,
            };
          }
        });
      }

      if (typeof runtime?.thread?.reset === 'function') {
        runtime.thread.reset(threadMessages);
      }
      setSourcesMap(newSourcesMap);
      setTraceMap(newTraceMap);
    } catch (error) {
      logger.error('Failed to fetch session', { error: error.message });
    }
  }, [runtime]);

  const handleNewChat = async () => {
    try {
      const res = await fetch(apiUrl('/sessions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Chat' }),
      });
      const data = await res.json();
      const newSessionId = data?.sessionId || null;
      const newThreadId = data?.threadId || null;

      if (newSessionId && newThreadId) {
        setSessionSummary({
          sessionId: newSessionId,
          threadId: newThreadId,
          created: true,
        });
        syncUrl(newSessionId, newThreadId);
      }
      setSourcesMap({});
      setTraceMap({});
      if (typeof runtime?.thread?.reset === 'function') {
        runtime.thread.reset([]);
      }
      fetchSessions(1);
    } catch (err) {
      logger.error('Failed to start new chat session', { error: err.message });
      window.location.reload();
    }
  };

  const handleSwitchSession = async (sessionId, threadId = null) => {
    await loadSession(sessionId, threadId, true);
    fetchSessions(sessionsPagination.page || 1);
  };

  const handlePageChange = (newPage) => {
    fetchSessions(newPage);
  };

  const handleDeleteSession = useCallback(async (sessionId) => {
    try {
      await fetch(apiUrl(`/sessions/${sessionId}`), { method: 'DELETE' });
      // If deleting the active session, start a fresh one
      if (sessionId === sessionSummary?.sessionId) {
        await handleNewChat();
      }
      fetchSessions(sessionsPagination.page || 1);
    } catch (err) {
      logger.error('Failed to delete session', { error: err.message });
    }
  }, [sessionSummary?.sessionId, sessionsPagination.page, fetchSessions]);

  const handleArchiveSession = useCallback(async (sessionId) => {
    try {
      await fetch(apiUrl(`/sessions/${sessionId}/archive`), { method: 'PATCH' });
      fetchSessions(sessionsPagination.page || 1);
    } catch (err) {
      logger.error('Failed to archive session', { error: err.message });
    }
  }, [sessionsPagination.page, fetchSessions]);

  // Initial mount: load URL params, hydrate session, and fetch sessions list
  useEffect(() => {
    const { sessionId, threadId } = getUrlParams();
    loadSession(sessionId, threadId, false);
    fetchSessions(1);
  }, []);

  // Popstate listener for browser Back / Forward buttons
  useEffect(() => {
    const handlePopState = () => {
      if (window.location.pathname === '/admin') {
        setCurrentView('admin');
      } else if (window.location.pathname === '/actions') {
        setCurrentView('actions');
      } else {
        setCurrentView('chat');
        const { sessionId, threadId } = getUrlParams();
        loadSession(sessionId, threadId, false);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [loadSession]);

  if (currentView === 'admin') {
    return <AdminPage onBackToChat={navigateToChat} />;
  }

  if (currentView === 'actions') {
    return <ActionHubPage onBackToChat={navigateToChat} onOpenAdmin={navigateToAdmin} />;
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="app">
        <Sidebar 
          sessionSummary={sessionSummary}
          sessionsList={sessionsList}
          sessionsPagination={sessionsPagination}
          isSessionsLoading={isSessionsLoading}
          onPageChange={handlePageChange}
          onSwitchSession={handleSwitchSession}
          onDeleteSession={handleDeleteSession}
          onArchiveSession={handleArchiveSession}
          isOpen={sidebarOpen} 
          setIsOpen={setSidebarOpen} 
          onOpenAdmin={navigateToAdmin}
          onOpenActionHub={navigateToActionHub}
          onOpenSettings={() => setIsDevSettingsOpen(true)}
          onOpenQuickActions={() => setIsQuickActionsOpen(true)}
          onNewChat={handleNewChat}
        />
        <main className={`main-content ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
          <div className="content-wrapper">
            <Chat 
              sessionSummary={sessionSummary}
              setSessionSummary={setSessionSummary}
              useAdvancedMode={useAdvancedMode}
              setUseAdvancedMode={setUseAdvancedMode}
              sourcesMap={sourcesMap}
              setSourcesMap={setSourcesMap}
              traceMap={traceMap}
              runtime={runtime}
              sessionsList={sessionsList}
              onSwitchSession={handleSwitchSession}
              onOpenActionHub={navigateToActionHub}
              onOpenDevSettings={() => setIsDevSettingsOpen(true)}
              isPaletteOpen={isQuickActionsOpen}
              setIsPaletteOpen={setIsQuickActionsOpen}
            />
          </div>
        </main>

        {/* Developer Diagnostics & Settings Modal */}
        <DevSettingsModal 
          isOpen={isDevSettingsOpen}
          onClose={() => setIsDevSettingsOpen(false)}
          useAdvancedMode={useAdvancedMode}
          setUseAdvancedMode={setUseAdvancedMode}
          sessionSummary={sessionSummary}
          onOpenAdmin={navigateToAdmin}
        />
      </div>
    </AssistantRuntimeProvider>
  );
}

export default App;

