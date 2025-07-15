import React, { useState } from 'react';

function PDFUpload() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) return;
    setStatus('Uploading...');
    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const res = await fetch('/api/upload-pdf', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.status === 'success') {
        setStatus(`Uploaded! Chunks: ${data.chunks}`);
      } else {
        setStatus('Upload failed.');
      }
    } catch (err) {
      setStatus('Error uploading PDF.');
    }
  };

  return (
    <div className="pdf-upload">
      <h2>Upload PDF</h2>
      <input type="file" accept="application/pdf" onChange={handleFileChange} />
      <button onClick={handleUpload} disabled={!file}>Upload</button>
      <div>{status}</div>
    </div>
  );
}

export default PDFUpload; 