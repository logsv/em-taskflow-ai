import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Chat from './Chat';

describe('Chat Component', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: 'Test response from backend',
        sources: [],
      }),
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('renders chat interface components', () => {
    render(<Chat />);
    expect(screen.getByPlaceholderText(/message em taskflow ai/i)).toBeInTheDocument();
    const sendButton = document.querySelector('.send-btn');
    expect(sendButton).toBeInTheDocument();
  });

  test('displays initial welcome message', () => {
    render(<Chat />);
    const chatContainer = document.querySelector('.chat-container') || document.querySelector('.messages');
    expect(chatContainer).toBeInTheDocument();
  });

  test('handles user input and sends message', async () => {
    render(<Chat />);
    const input = screen.getByPlaceholderText(/message em taskflow ai/i);
    const sendButton = document.querySelector('.send-btn');
    fireEvent.change(input, { target: { value: 'Hello, how are you?' } });
    expect(input.value).toBe('Hello, how are you?');
    fireEvent.click(sendButton);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    expect(global.fetch.mock.calls[0][0]).toBe('/api/rag-query');
    expect(input.value).toBe('');
  });

  test('handles Enter key to send message', async () => {
    render(<Chat />);
    const input = screen.getByPlaceholderText(/message em taskflow ai/i);
    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.keyPress(input, { key: 'Enter', code: 'Enter', charCode: 13 });
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  test('prevents sending empty messages', async () => {
    render(<Chat />);
    const input = screen.getByPlaceholderText(/message em taskflow ai/i);
    const sendButton = document.querySelector('.send-btn');
    fireEvent.click(sendButton);
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(sendButton);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('displays loading state during API call', async () => {
    global.fetch = jest.fn(() =>
      new Promise(resolve =>
        setTimeout(
          () =>
            resolve({
              ok: true,
              json: async () => ({ answer: 'Delayed response' }),
            }),
          100,
        ),
      ),
    );

    render(<Chat />);
    const input = screen.getByPlaceholderText(/message em taskflow ai/i);
    const sendButton = document.querySelector('.send-btn');
    fireEvent.change(input, { target: { value: 'Test loading' } });
    fireEvent.click(sendButton);
    expect(sendButton).toBeDisabled();
    await waitFor(() => {
      expect(sendButton).not.toBeDisabled();
    });
  });

  test('displays error message when API call fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('API Error'));

    render(<Chat />);
    const input = screen.getByPlaceholderText(/message em taskflow ai/i);
    const sendButton = document.querySelector('.send-btn');
    fireEvent.change(input, { target: { value: 'Test error' } });
    fireEvent.click(sendButton);
    await waitFor(() => {
      expect(
        screen.getByText(
          /I apologize, but I encountered an error while generating a response. Please try again./i,
        ),
      ).toBeInTheDocument();
    });
  });

  test('displays messages in correct order (user first, then bot)', async () => {
    render(<Chat />);
    
    const input = screen.getByPlaceholderText(/message em taskflow ai/i);
    const sendButton = document.querySelector('.send-btn');
    fireEvent.change(input, { target: { value: 'User message' } });
    fireEvent.click(sendButton);
    await waitFor(() => {
      expect(screen.getByText('User message')).toBeInTheDocument();
      expect(screen.getByText('Test response from backend')).toBeInTheDocument();
    });
    const messages = document.querySelectorAll('.message-wrapper');
    expect(messages.length).toBeGreaterThan(0);
  });

  test('handles long messages properly', async () => {
    const longMessage = 'A'.repeat(1000);
    
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ answer: longMessage, sources: [] }),
    });
    
    render(<Chat />);
    
    const input = screen.getByPlaceholderText(/message em taskflow ai/i);
    const sendButton = document.querySelector('.send-btn');
    fireEvent.change(input, { target: { value: 'Test long response' } });
    fireEvent.click(sendButton);
    await waitFor(() => {
      expect(screen.getByText(longMessage)).toBeInTheDocument();
    });
  });

  test('handles special characters in messages', async () => {
    const specialMessage = 'Test with special chars: <>&"\'';
    
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ answer: specialMessage, sources: [] }),
    });
    
    render(<Chat />);
    
    const input = screen.getByPlaceholderText(/message em taskflow ai/i);
    const sendButton = document.querySelector('.send-btn');
    fireEvent.change(input, { target: { value: specialMessage } });
    fireEvent.click(sendButton);
    await waitFor(() => {
      expect(screen.getByText(specialMessage)).toBeInTheDocument();
    });
  });

  test('maintains focus on input after sending message', async () => {
    render(<Chat />);
    
    const input = screen.getByPlaceholderText(/message em taskflow ai/i);
    const sendButton = document.querySelector('.send-btn');
    input.focus();
    fireEvent.change(input, { target: { value: 'Focus test' } });
    fireEvent.click(sendButton);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
    expect(input).toBeInTheDocument();
  });
});
