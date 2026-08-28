import { useState, useEffect, useCallback } from 'react';
import { apiUrl } from '../services/apiClient.js';
import logger from '../utils/logger.js';

/**
 * Custom Hook: useRagDocuments
 * Manages fetching, listing, and uploading PDF documents for RAG in the frontend (SRP)
 */
export function useRagDocuments() {
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/rag/documents'));
      if (res.ok) {
        const data = await res.json();
        setDocuments(Array.isArray(data.documents) ? data.documents : []);
      } else {
        logger.warn('Failed to fetch RAG documents list');
      }
    } catch (err) {
      logger.warn('Error fetching RAG documents', { err: err.message });
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const uploadPdfFile = async (file) => {
    if (!file) return;
    setIsUploading(true);
    setUploadStatus('Ingesting PDF...');

    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const res = await fetch(apiUrl('/rag/upload'), {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (res.status === 202 && data.mode === 'temporal' && data.workflowId) {
        setUploadStatus('⏳ Temporal Workflow Running...');
        const workflowId = data.workflowId;
        let attempts = 0;
        const interval = setInterval(async () => {
          attempts += 1;
          try {
            const pollRes = await fetch(apiUrl(`/rag/workflows/${workflowId}`));
            if (pollRes.ok) {
              const pollData = await pollRes.json();
              if (pollData.status === 'COMPLETED') {
                clearInterval(interval);
                setUploadStatus('✅ Temporal Workflow Completed!');
                await fetchDocuments();
                setIsUploading(false);
                setTimeout(() => setUploadStatus(''), 4000);
              } else if (pollData.status === 'FAILED') {
                clearInterval(interval);
                setUploadStatus('❌ Temporal Workflow Failed');
                setIsUploading(false);
                setTimeout(() => setUploadStatus(''), 4000);
              }
            }
          } catch (e) {
            logger.warn('Workflow polling warning', { err: e.message });
          }
          if (attempts > 30) {
            clearInterval(interval);
            setUploadStatus('⚠️ Ingestion processing in background...');
            await fetchDocuments();
            setIsUploading(false);
            setTimeout(() => setUploadStatus(''), 4000);
          }
        }, 2000);
        return;
      }

      if (res.ok && (data.status === 'success' || data.chunks > 0)) {
        setUploadStatus(`Uploaded! Ingested ${data.chunks || 1} chunks.`);
        await fetchDocuments();
      } else {
        setUploadStatus(`Upload failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      logger.error('Upload error', { err: err.message });
      setUploadStatus('Upload error');
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadStatus(''), 4000);
    }
  };

  return {
    documents,
    isLoading,
    isUploading,
    uploadStatus,
    error,
    fetchDocuments,
    uploadPdfFile,
  };
}
