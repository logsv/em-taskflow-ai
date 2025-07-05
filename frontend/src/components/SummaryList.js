import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './Summary.css';

function SummaryList() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSummary();
    // eslint-disable-next-line
  }, []);

  const fetchSummary = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get('/api/summary');
      setSummary(res.data);
    } catch (err) {
      setError('Failed to fetch summary.');
    }
    setLoading(false);
  };

  return (
    <div className="summary-list-container">
      <h2>AI-Powered TaskFlow Summary</h2>
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {summary && (
        <div>
          <h3>Jira Tasks</h3>
          <ol>
            {summary.jira.map(task => (
              <li key={task.key}>
                <span>{task.status === 'Done' ? '✅' : '📝'} </span>
                <a href={task.url} target="_blank" rel="noopener noreferrer">[{task.key}] {task.summary}</a> ({task.status})
              </li>
            ))}
          </ol>

          <h3>Notion Projects (AI Summaries)</h3>
          <ol>
            {summary.notion.map(page => (
              <li key={page.id}>
                <span>📄 </span>
                <a href={page.url} target="_blank" rel="noopener noreferrer">{page.title}</a>
                <div style={{ fontStyle: 'italic', color: '#444', marginTop: 4 }}>
                  {summary.notionSummaries[page.id]}
                </div>
              </li>
            ))}
          </ol>

          <h3>Today's Meetings</h3>
          <ol>
            {summary.calendar.map(event => (
              <li key={event.id}>
                <span>{summary.calendarConflicts.some(conflict => 
                  conflict.events?.some(e => e.id === event.id)) ? '⚠️' : '📅'} </span>
                {event.summary} ({event.start} - {event.end})
                {event.hangoutLink && (
                  <div><a href={event.hangoutLink} target="_blank" rel="noopener noreferrer">Meeting Link</a></div>
                )}
              </li>
            ))}
          </ol>

          {summary.calendarConflicts.length > 0 && (
            <div className="conflicts-section">
              <h4>🚨 Scheduling Conflicts Detected</h4>
              {summary.calendarConflicts.map((conflict, i) => (
                <div key={i} className={`conflict-card conflict-${conflict.severity}`}>
                  <div className="conflict-header">
                    <span className="conflict-type">{conflict.type.replace('_', ' ').toUpperCase()}</span>
                    <span className="conflict-severity">{conflict.severity.toUpperCase()}</span>
                  </div>
                  <div className="conflict-events">
                    <strong>"{conflict.events[0].summary}"</strong> overlaps with <strong>"{conflict.events[1].summary}"</strong>
                  </div>
                  {conflict.suggestions && conflict.suggestions.length > 0 && (
                    <div className="ai-suggestions">
                      <div className="suggestions-header">🤖 AI Suggestions:</div>
                      <ul>
                        {conflict.suggestions.map((suggestion, j) => (
                          <li key={j}>{suggestion}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SummaryList;