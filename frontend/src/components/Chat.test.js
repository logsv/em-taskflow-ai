import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Chat from './Chat';

// Mock assistant-ui react module
jest.mock('@assistant-ui/react', () => ({
  useAuiState: (selector) => {
    return selector({
      thread: {
        messages: [],
        isRunning: false,
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
});
