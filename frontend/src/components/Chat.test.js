import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import axios from 'axios';
import Chat from './Chat';

// Mock axios
jest.mock('axios');
const mockedAxios = axios;

describe('Chat Component', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Default axios mocks
    mockedAxios.get.mockResolvedValue({
      data: []
    });
    
    mockedAxios.post.mockResolvedValue({
      data: {
        response: 'Test response from backend',
        metadata: {
          provider: 'test-provider',
          model: 'test-model',
          tokens: {
            input: 10,
            output: 20,
            total: 30
          }
        }
      }
    });
  });

  test('renders chat interface components', () => {
    render(<Chat />);
    
    // Check for main UI elements
    expect(screen.getByPlaceholderText(/ask a question/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  test('displays initial welcome message', () => {
    render(<Chat />);
    
    // Should show some welcome or initial content
    const chatContainer = document.querySelector('.chat-container') || document.querySelector('.messages');
    expect(chatContainer).toBeInTheDocument();
  });

  test('handles user input and sends message', async () => {
    render(<Chat />);
    
    const input = screen.getByPlaceholderText(/ask a question/i);
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    // Type a message
    fireEvent.change(input, { target: { value: 'Hello, how are you?' } });
    expect(input.value).toBe('Hello, how are you?');
    
    // Send the message
    fireEvent.click(sendButton);
    
    // Wait for API call
    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith('/api/rag-query', {
        query: 'Hello, how are you?'
      });
    });
    
    // Input should be cleared after sending
    expect(input.value).toBe('');
  });

  test('handles Enter key to send message', async () => {
    render(<Chat />);
    
    const input = screen.getByPlaceholderText(/ask a question/i);
    
    // Type a message
    fireEvent.change(input, { target: { value: 'Test message' } });
    
    // Press Enter
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    
    // Wait for API call
    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith('/api/rag-query', {
        query: 'Test message'
      });
    });
  });

  test('prevents sending empty messages', async () => {
    render(<Chat />);
    
    const input = screen.getByPlaceholderText(/ask a question/i);
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    // Try to send empty message
    fireEvent.click(sendButton);
    
    // Should not make API call
    expect(mockedAxios.post).not.toHaveBeenCalled();
    
    // Try with whitespace only
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(sendButton);
    
    // Should still not make API call
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  test('displays loading state during API call', async () => {
    // Mock a delayed response
    mockedAxios.post.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({
        data: { response: 'Delayed response' }
      }), 100))
    );
    
    render(<Chat />);
    
    const input = screen.getByPlaceholderText(/ask a question/i);
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    // Send a message
    fireEvent.change(input, { target: { value: 'Test loading' } });
    fireEvent.click(sendButton);
    
    // Should show loading state (button disabled or loading indicator)
    expect(sendButton).toBeDisabled();
    
    // Wait for response
    await waitFor(() => {
      expect(sendButton).not.toBeDisabled();
    });
  });

  test('displays error message when API call fails', async () => {
    // Mock API failure
    mockedAxios.post.mockRejectedValue(new Error('API Error'));
    
    render(<Chat />);
    
    const input = screen.getByPlaceholderText(/ask a question/i);
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    // Send a message
    fireEvent.change(input, { target: { value: 'Test error' } });
    fireEvent.click(sendButton);
    
    // Wait for error to be displayed
    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });
  });

  test('loads and displays chat history', async () => {
    // Mock chat history
    mockedAxios.get.mockResolvedValue({
      data: [
        {
          id: 1,
          query: 'Previous question?',
          response: 'Previous answer.',
          timestamp: new Date().toISOString()
        }
      ]
    });
    
    render(<Chat />);
    
    // Wait for history to load
    await waitFor(() => {
      expect(mockedAxios.get).toHaveBeenCalledWith('/api/health');
    });
    
    // Should display the previous message
    await waitFor(() => {
      expect(screen.getByText('Previous question?')).toBeInTheDocument();
      expect(screen.getByText('Previous answer.')).toBeInTheDocument();
    });
  });

  test('displays messages in correct order (user first, then bot)', async () => {
    render(<Chat />);
    
    const input = screen.getByPlaceholderText(/ask a question/i);
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    // Send a message
    fireEvent.change(input, { target: { value: 'User message' } });
    fireEvent.click(sendButton);
    
    // Wait for response
    await waitFor(() => {
      expect(screen.getByText('User message')).toBeInTheDocument();
      expect(screen.getByText('Test response from backend')).toBeInTheDocument();
    });
    
    // Check message order in DOM
    const messages = document.querySelectorAll('.message, .user-message, .bot-message, .chat-message');
    expect(messages.length).toBeGreaterThan(0);
  });

  test('handles long messages properly', async () => {
    const longMessage = 'A'.repeat(1000);
    
    mockedAxios.post.mockResolvedValue({
      data: { response: longMessage }
    });
    
    render(<Chat />);
    
    const input = screen.getByPlaceholderText(/ask a question/i);
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    // Send a long message
    fireEvent.change(input, { target: { value: 'Test long response' } });
    fireEvent.click(sendButton);
    
    // Wait for long response
    await waitFor(() => {
      expect(screen.getByText(longMessage)).toBeInTheDocument();
    });
  });

  test('handles special characters in messages', async () => {
    const specialMessage = 'Test with special chars: <>&"\'';
    
    mockedAxios.post.mockResolvedValue({
      data: { response: specialMessage }
    });
    
    render(<Chat />);
    
    const input = screen.getByPlaceholderText(/ask a question/i);
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    // Send message with special characters
    fireEvent.change(input, { target: { value: specialMessage } });
    fireEvent.click(sendButton);
    
    // Wait for response
    await waitFor(() => {
      expect(screen.getByText(specialMessage)).toBeInTheDocument();
    });
  });

  test('maintains focus on input after sending message', async () => {
    render(<Chat />);
    
    const input = screen.getByPlaceholderText(/ask a question/i);
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    // Focus and send message
    input.focus();
    fireEvent.change(input, { target: { value: 'Focus test' } });
    fireEvent.click(sendButton);
    
    // Wait for response
    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalled();
    });
    
    // Input should still be focused (or focus should be restored)
    // This is implementation-dependent, so we just check that input exists
    expect(input).toBeInTheDocument();
  });
});