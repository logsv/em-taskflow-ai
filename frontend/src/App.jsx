import React, { useState, useEffect, useMemo } from 'react';
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react';
import Chat from './components/Chat';
import Sidebar from './components/Sidebar';
import AdminPage from './components/AdminPage';
import logger from './utils/logger';
import './App.css';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sessionSummary, setSessionSummary] = useState(null);
  const [useAdvancedMode, setUseAdvancedMode] = useState(false);
  const [sourcesMap, setSourcesMap] = useState({});
  const [traceMap, setTraceMap] = useState({});
  const [currentView, setCurrentView] = useState(
    window.location.pathname === '/admin' ? 'admin' : 'chat'
  );

  useEffect(() => {
    const handlePopState = () => {
      setCurrentView(window.location.pathname === '/admin' ? 'admin' : 'chat');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToAdmin = () => {
    window.history.pushState({}, '', '/admin');
    setCurrentView('admin');
  };

  const navigateToChat = () => {
    window.history.pushState({}, '', '/');
    setCurrentView('chat');
  };

  // Local runtime adapter definition with stable reference
  const adapter = useMemo(() => ({
    async *run({ messages, abortSignal }) {
      const userMsg = messages[messages.length - 1];
      const textContent = userMsg.content[0]?.text || '';
      
      const payload = {
        message: textContent,
        mode: useAdvancedMode ? 'advanced' : 'baseline',
      };
      if (sessionSummary?.threadId) {
        payload.threadId = sessionSummary.threadId;
      }
      
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortSignal,
      });
      const data = await res.json();
      
      if (data?.threadId && data.threadId !== sessionSummary?.threadId) {
        setSessionSummary(prev => ({
          ...prev,
          threadId: data.threadId,
        }));
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

      yield {
        content: [{ type: 'text', text: data.answer || 'No response generated.' }]
      };
    }
  }), [useAdvancedMode, sessionSummary?.threadId]);

  const runtime = useLocalRuntime(adapter);

  const handleNewChat = async () => {
    try {
      const res = await fetch('/api/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Chat' }),
      });
      const data = await res.json();
      if (data?.threadId) {
        setSessionSummary(prev => ({
          ...prev,
          threadId: data.threadId,
        }));
      }
      setSourcesMap({});
      setTraceMap({});
      if (typeof runtime?.thread?.reset === 'function') {
        runtime.thread.reset([]);
      }
    } catch (err) {
      window.location.reload();
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function loadSession() {
      try {
        const response = await fetch('/api/session');
        const data = await response.json();
        if (!isMounted) return;
        setSessionSummary({
          sessionId: data?.sessionId || null,
          threadId: data?.threadId || null,
          created: !!data?.created,
        });

        // Hydrate past messages into assistant-ui runtime thread on refresh
        if (Array.isArray(data?.messages) && data.messages.length > 0) {
          const newSourcesMap = {};
          const newTraceMap = {};
          const threadMessages = [];

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

          runtime.thread.reset(threadMessages);
          setSourcesMap(newSourcesMap);
          setTraceMap(newTraceMap);
        }
      } catch (error) {
        logger.error('Failed to fetch session', { error: error.message });
      }
    }
    loadSession();
    return () => {
      isMounted = false;
    };
  }, []);

  if (currentView === 'admin') {
    return <AdminPage onBackToChat={navigateToChat} />;
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="app">
        <Sidebar 
          sessionSummary={sessionSummary}
          isOpen={sidebarOpen} 
          setIsOpen={setSidebarOpen} 
          onOpenAdmin={navigateToAdmin}
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
            />
          </div>
        </main>
      </div>
    </AssistantRuntimeProvider>
  );
}

export default App;
