import { useState, useEffect, useCallback } from 'react';

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
      const res = await fetch('/api/rag/documents');
      if (res.ok) {
        const data = await res.json();
        setDocuments(Array.isArray(data.documents) ? data.documents : []);
      } else {
        console.warn('Failed to fetch RAG documents list');
      }
    } catch (err) {
      console.warn('Error fetching RAG documents:', err);
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
      const res = await fetch('/api/rag/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (res.ok && (data.status === 'success' || data.chunks > 0)) {
        setUploadStatus(`Uploaded! Ingested ${data.chunks || 1} chunks.`);
        await fetchDocuments();
      } else {
        setUploadStatus(`Upload failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
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
