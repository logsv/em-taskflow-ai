import React, { useState, useRef } from 'react';
import './PDFUpload.css';

function PDFUpload() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setStatus('');
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === 'application/pdf') {
      setFile(droppedFile);
      setStatus('');
    } else {
      setStatus('Please drop a PDF file.');
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    
    setStatus('Uploading...');
    setUploadProgress(0);
    
    const formData = new FormData();
    formData.append('pdf', file);

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      const res = await fetch('/api/upload-pdf', {
        method: 'POST',
        body: formData,
      });
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      const data = await res.json();
      if (data.status === 'success') {
        setStatus(`✅ Upload successful! Processed ${data.chunks} chunks from "${file.name}"`);
        setTimeout(() => {
          setFile(null);
          setStatus('');
          setUploadProgress(0);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }, 3000);
      } else {
        setStatus('❌ Upload failed. Please try again.');
        setUploadProgress(0);
      }
    } catch (err) {
      setStatus('❌ Error uploading PDF. Please check your connection and try again.');
      setUploadProgress(0);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const removeFile = () => {
    setFile(null);
    setStatus('');
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="pdf-upload-container">
      <div className="upload-header">
        <h2>📄 Upload PDF Document</h2>
        <p>Upload your PDF files to analyze and chat about their content</p>
      </div>

      <div 
        className={`upload-zone ${isDragOver ? 'drag-over' : ''} ${file ? 'has-file' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={!file ? triggerFileSelect : undefined}
      >
        {!file ? (
          <div className="upload-prompt">
            <div className="upload-icon">📁</div>
            <h3>Drop your PDF here</h3>
            <p>or <span className="upload-link">click to browse</span></p>
            <div className="upload-info">
              <small>Supports PDF files up to 10MB</small>
            </div>
          </div>
        ) : (
          <div className="file-preview">
            <div className="file-icon">📄</div>
            <div className="file-details">
              <div className="file-name">{file.name}</div>
              <div className="file-size">{formatFileSize(file.size)}</div>
              {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
              )}
            </div>
            <button 
              className="remove-file-btn"
              onClick={(e) => {
                e.stopPropagation();
                removeFile();
              }}
              title="Remove file"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {file && (
        <div className="upload-actions">
          <button 
            className="upload-btn"
            onClick={handleUpload}
            disabled={!file || status === 'Uploading...'}
          >
            {status === 'Uploading...' ? (
              <>
                <span className="spinner"></span>
                Uploading...
              </>
            ) : (
              <>
                <span>📤</span>
                Upload & Process
              </>
            )}
          </button>
        </div>
      )}

      {status && (
        <div className={`status-message ${status.includes('✅') ? 'success' : status.includes('❌') ? 'error' : 'info'}`}>
          {status}
        </div>
      )}

      <div className="upload-tips">
        <h4>💡 Tips for better results:</h4>
        <ul>
          <li>Upload clear, text-based PDFs for best analysis</li>
          <li>Scanned documents work but may have reduced accuracy</li>
          <li>After upload, you can ask questions about the document content</li>
          <li>Multiple files can be uploaded and will be searchable together</li>
        </ul>
      </div>
    </div>
  );
}

export default PDFUpload;