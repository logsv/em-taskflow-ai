import React, { useState, useEffect } from 'react';
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react';
import Chat from './components/Chat';
import PDFUpload from './components/PDFUpload';
import Sidebar from './components/Sidebar';
import './App.css';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sessionSummary, setSessionSummary] = useState(null);
  const [useAdvancedMode, setUseAdvancedMode] = useState(false);
  const [sourcesMap, setSourcesMap] = useState({});

  // Local runtime adapter definition
  const adapter = {
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

      // Map sources to assistant message index (messages.length)
      const assistantMessageIndex = messages.length;
      if (data?.sources) {
        setSourcesMap(prev => ({
          ...prev,
          [assistantMessageIndex]: data.sources,
        }));
      }

      yield {
        content: [{ type: 'text', text: data.answer || 'No response generated.' }]
      };
    }
  };

  const runtime = useLocalRuntime(adapter);

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
      } catch (error) {
        console.error('Failed to fetch session:', error);
      }
    }
    loadSession();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className={`app ${drawerOpen ? 'drawer-open' : ''}`}>
        <Sidebar 
          sessionSummary={sessionSummary}
          isDrawerOpen={drawerOpen}
          setIsDrawerOpen={setDrawerOpen}
          isOpen={sidebarOpen} 
          setIsOpen={setSidebarOpen} 
        />
        <main className={`main-content ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
          <div className="content-wrapper">
            <Chat 
              sessionSummary={sessionSummary}
              setSessionSummary={setSessionSummary}
              isDrawerOpen={drawerOpen}
              setIsDrawerOpen={setDrawerOpen}
              useAdvancedMode={useAdvancedMode}
              setUseAdvancedMode={setUseAdvancedMode}
              sourcesMap={sourcesMap}
              setSourcesMap={setSourcesMap}
              runtime={runtime}
            />
          </div>
        </main>

        <div className={`pdf-drawer ${drawerOpen ? 'open' : ''}`}>
          <div className="pdf-drawer-header">
            <h3>📄 PDF Documents</h3>
            <button className="close-drawer-btn" onClick={() => setDrawerOpen(false)}>✕</button>
          </div>
          <div className="pdf-drawer-content">
            <PDFUpload runtime={runtime} />
          </div>
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
}

export default App;
