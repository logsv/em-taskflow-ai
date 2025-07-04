import React, { useEffect, useState } from 'react';
import axios from 'axios';

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
                <span>{summary.calendarConflicts.flat().some(e => e.id === event.id) ? '⚠️' : '📅'} </span>
                {event.summary} ({event.start} - {event.end})
                {event.hangoutLink && (
                  <div><a href={event.hangoutLink} target="_blank" rel="noopener noreferrer">Meeting Link</a></div>
                )}
              </li>
            ))}
          </ol>

          {summary.calendarConflicts.length > 0 && (
            <div style={{ color: 'orange' }}>
              <h4>Scheduling Conflicts ⚠️</h4>
              <ul>
                {summary.calendarConflicts.map(([a, b], i) => (
                  <li key={i}>"{a.summary}" overlaps with "{b.summary}"</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SummaryList; 