import React, { useEffect, useState } from 'react';
import { apiUrl } from '../../services/apiClient.js';

/** Render the brief's small markdown subset (### heading, **bold**, - bullets, > note) as React. */
export function BriefMarkdown({ markdown }) {
  const inline = (text, key) => text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong>
      : <React.Fragment key={`${key}-${i}`}>{part}</React.Fragment>);

  const blocks = [];
  let list = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={`ul-${blocks.length}`}>{list}</ul>);
    list = [];
  };
  (markdown || '').split('\n').forEach((line, i) => {
    if (line.startsWith('- ')) { list.push(<li key={i}>{inline(line.slice(2), i)}</li>); return; }
    flush();
    if (line.startsWith('### ')) blocks.push(<h3 key={i}>{line.slice(4)}</h3>);
    else if (line.startsWith('> ')) blocks.push(<p key={i} className="weekly-brief-note">{inline(line.slice(2), i)}</p>);
    else if (line.trim()) blocks.push(<p key={i}>{inline(line, i)}</p>);
  });
  flush();
  return <div className="weekly-brief-body">{blocks}</div>;
}

/** Weekly EM brief (GET /api/actions/weekly-brief): deterministic, from stored audits and items. */
export default function WeeklyBriefModal({ onClose }) {
  const [brief, setBrief] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl('/actions/weekly-brief?days=7'))
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) setBrief(body);
        else setError(body.error || `Could not build the brief (${res.status})`);
      })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(brief.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError(`Copy failed: ${err.message}`);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="resolution-modal weekly-brief-modal" role="dialog" aria-modal="true" aria-label="Weekly EM brief" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🗒 Weekly EM brief</h3>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        {error && <div className="modal-error" role="alert">{error}</div>}
        {!brief && !error && <p className="weekly-brief-note">Building the brief…</p>}
        {brief && <BriefMarkdown markdown={brief.markdown} />}
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
          <button type="button" className="btn-primary" onClick={copy} disabled={!brief}>
            {copied ? 'Copied' : 'Copy as Markdown'}
          </button>
        </div>
      </div>
    </div>
  );
}
