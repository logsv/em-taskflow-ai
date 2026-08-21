import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Chat from './Chat';

let mockMessagesStore = [];
let mockIsRunningStore = false;

// Mock assistant-ui react module
jest.mock('@assistant-ui/react', () => ({
  useAuiState: (selector) => {
    return selector({
      thread: {
        messages: mockMessagesStore,
        isRunning: mockIsRunningStore,
      }
    });
  },
  AssistantRuntimeProvider: ({ children }) => <div>{children}</div>,
}));

const mockRuntime = {
  thread: {
    append: jest.fn(),
    getState: () => ({ messages: [], isRunning: false }),
  }
};

const defaultProps = {
  sessionSummary: { sessionId: 'sess_123', threadId: 'th_123' },
  setSessionSummary: jest.fn(),
  useAdvancedMode: false,
  setUseAdvancedMode: jest.fn(),
  sourcesMap: {},
  setSourcesMap: jest.fn(),
  runtime: mockRuntime,
};

describe('Chat Component', () => {
  beforeEach(() => {
    mockMessagesStore = [];
    mockIsRunningStore = false;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        threadId: 'th_test',
        answer: 'Test response from backend',
        sources: [],
      }),
    });
    mockRuntime.thread.append.mockReset();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('renders chat interface components', () => {
    render(<Chat {...defaultProps} />);
    expect(screen.getByPlaceholderText(/message em taskflow ai/i)).toBeInTheDocument();
    const sendButton = document.querySelector('.send-btn');
    expect(sendButton).toBeInTheDocument();
  });

  test('displays initial welcome message', () => {
    render(<Chat {...defaultProps} />);
    const chatContainer = document.querySelector('.chat-container') || document.querySelector('.messages');
    expect(chatContainer).toBeInTheDocument();
  });

  test('handles user input and sends message', async () => {
    render(<Chat {...defaultProps} />);
    const input = screen.getByPlaceholderText(/message em taskflow ai/i);
    const sendButton = document.querySelector('.send-btn');
    fireEvent.change(input, { target: { value: 'Hello, how are you?' } });
    expect(input.value).toBe('Hello, how are you?');
    fireEvent.click(sendButton);
    expect(mockRuntime.thread.append).toHaveBeenCalledTimes(1);
    expect(mockRuntime.thread.append).toHaveBeenCalledWith({
      role: 'user',
      content: [{ type: 'text', text: 'Hello, how are you?' }]
    });
    expect(input.value).toBe('');
  });

  test('handles Enter key to send message', async () => {
    render(<Chat {...defaultProps} />);
    const input = screen.getByPlaceholderText(/message em taskflow ai/i);
    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.keyPress(input, { key: 'Enter', code: 'Enter', charCode: 13 });
    expect(mockRuntime.thread.append).toHaveBeenCalledTimes(1);
  });

  test('prevents sending empty messages', async () => {
    render(<Chat {...defaultProps} />);
    const input = screen.getByPlaceholderText(/message em taskflow ai/i);
    const sendButton = document.querySelector('.send-btn');
    fireEvent.click(sendButton);
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(sendButton);
    expect(mockRuntime.thread.append).not.toHaveBeenCalled();
  });

  test('maintains focus on input after sending message', async () => {
    render(<Chat {...defaultProps} />);
    
    const input = screen.getByPlaceholderText(/message em taskflow ai/i);
    const sendButton = document.querySelector('.send-btn');
    input.focus();
    fireEvent.change(input, { target: { value: 'Focus test' } });
    fireEvent.click(sendButton);
    expect(input).toBeInTheDocument();
  });

  test('renders 4 featured EM agent prompt cards on welcome screen and sends message on click', () => {
    render(<Chat {...defaultProps} />);
    const cards = document.querySelectorAll('.suggestion-card');
    expect(cards.length).toBe(4);

    fireEvent.click(cards[0]);
    expect(mockRuntime.thread.append).toHaveBeenCalledWith({
      role: 'user',
      content: [{ type: 'text', text: 'Analyze team DORA metrics for deployment frequency, lead time, and failure rate' }]
    });
  });

  test('filters welcome prompts by category pills', () => {
    render(<Chat {...defaultProps} />);
    const deliveryPill = screen.getByRole('button', { name: /Delivery & Metrics/i });
    fireEvent.click(deliveryPill);

    const cards = document.querySelectorAll('.suggestion-card');
    expect(cards.length).toBe(2); // DORA and Delivery
  });

  test('opens prompt palette with all 11 agents when clicking browse palette button', () => {
    render(<Chat {...defaultProps} />);
    const browseBtn = screen.getByText(/Browse All 11 Agents & Scenario Hints/i);
    fireEvent.click(browseBtn);

    expect(screen.getByText(/Fast Agent Prompts & Hints/i)).toBeInTheDocument();
  });

  test('opens prompt palette when clicking ⚡ trigger button in chat input', () => {
    render(<Chat {...defaultProps} />);
    const paletteBtn = screen.getByTitle(/Fast Agent Prompts & Scenario Hints/i);
    fireEvent.click(paletteBtn);

    expect(screen.getByText(/Fast Agent Prompts & Hints/i)).toBeInTheDocument();
  });

  test('renders markdown tables, status pills, and callout blockquotes properly in assistant messages', () => {
    const tableMarkdown = `> ✅ Notice: Fresh delivery telemetry retrieved via Live MCP integration.

| Metric | Current Value | Healthy Benchmark | Risk Level |
| :--- | :--- | :--- | :--- |
| Delivery Risk Index | HIGH | LOW | 🔴 High Risk |
| Active WIP Count | 7 items (Limit: 5) | $\\le 5$ items | 🔴 +2 Over Limit |
| PR Review Latency (Avg) | 17,617.9 hours (~734.1d) | $\\le 4.0$ hours | 🔴 Stalled |`;

    mockMessagesStore = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: [{ type: 'text', text: tableMarkdown }],
      },
    ];

    render(<Chat {...defaultProps} />);

    // Verify Blockquote Notice Callout
    const blockquote = document.querySelector('.md-blockquote.notice-callout');
    expect(blockquote).toBeInTheDocument();
    expect(blockquote.textContent).toContain('Notice: Fresh delivery telemetry retrieved');

    // Verify Table Elements
    const tableWrapper = document.querySelector('.md-table-wrapper');
    expect(tableWrapper).toBeInTheDocument();

    const table = document.querySelector('.md-table');
    expect(table).toBeInTheDocument();

    const headers = document.querySelectorAll('.md-table th');
    expect(headers.length).toBe(4);
    expect(headers[0].textContent).toBe('Metric');
    expect(headers[1].textContent).toBe('Current Value');
    expect(headers[2].textContent).toBe('Healthy Benchmark');
    expect(headers[3].textContent).toBe('Risk Level');

    const rows = document.querySelectorAll('.md-table tbody tr');
    expect(rows.length).toBe(3);

    // Verify Risk / Status Pills
    const dangerPills = document.querySelectorAll('.table-pill.pill-danger');
    expect(dangerPills.length).toBeGreaterThan(0);

    // Verify math rendering
    const mathSpan = document.querySelector('.md-math');
    expect(mathSpan).toBeInTheDocument();
    expect(mathSpan.textContent).toContain('≤ 5 items');
  });
});
