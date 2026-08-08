import { useState, useEffect, useCallback } from 'react';
import logger from '../utils/logger.js';

/**
 * Custom Hook: useGithubSync
 * Encapsulates GitHub PostgreSQL sync state and action logic (SRP)
 */
export function useGithubSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncMessage, setSyncMessage] = useState('');

  const fetchSyncStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/github/sync-status');
      if (res.ok) {
        const data = await res.json();
        setSyncStatus(data);
      }
    } catch (err) {
      logger.warn('Failed to fetch GitHub sync status', { err: err.message });
    }
  }, []);

  useEffect(() => {
    fetchSyncStatus();
  }, [fetchSyncStatus]);

  const handleGithubSync = async (repo = 'logsv/em-taskflow-ai') => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncMessage('Syncing GitHub issues...');

    try {
      const res = await fetch('/api/github/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo }),
      });
      const data = await res.json();

      if (data.success) {
        setSyncMessage(`Synced ${data.count} issue(s)!`);
        await fetchSyncStatus();
      } else {
        setSyncMessage(`Sync failed: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error('Error syncing GitHub data', { error: error.message });
      setSyncMessage('Error syncing GitHub data');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncMessage(''), 4000);
    }
  };

  return {
    isSyncing,
    syncStatus,
    syncMessage,
    handleGithubSync,
    fetchSyncStatus,
  };
}
