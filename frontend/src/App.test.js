import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from './App';

// Mock components to isolate App component testing
jest.mock('./components/Chat', () => {
  return function MockChat() {
    return <div data-testid="chat-component">Chat Component</div>;
  };
});

jest.mock('./components/PDFUpload', () => {
  return function MockPDFUpload() {
    return <div data-testid="pdf-upload-component">PDF Upload Component</div>;
  };
});

jest.mock('./components/Sidebar', () => {
  return function MockSidebar({ view, setView, isOpen, setIsOpen }) {
    return (
      <div data-testid="sidebar-component">
        <button onClick={() => setView('chat')} data-testid="chat-nav">
          Chat
        </button>
        <button onClick={() => setView('pdf')} data-testid="upload-nav">
          Upload
        </button>
        <button onClick={() => setIsOpen(!isOpen)} data-testid="toggle-sidebar">
          Toggle Sidebar
        </button>
      </div>
    );
  };
});

describe('App Component', () => {
  test('renders App component with sidebar and main content', () => {
    render(<App />);
    
    expect(screen.getByTestId('sidebar-component')).toBeInTheDocument();
    expect(screen.getByTestId('chat-component')).toBeInTheDocument();
  });

  test('starts with chat view by default', () => {
    render(<App />);
    
    expect(screen.getByTestId('chat-component')).toBeInTheDocument();
    expect(screen.queryByTestId('pdf-upload-component')).not.toBeInTheDocument();
  });

  test('switches to PDF upload view when upload button is clicked', () => {
    render(<App />);
    
    const uploadButton = screen.getByTestId('upload-nav');
    fireEvent.click(uploadButton);
    
    expect(screen.getByTestId('pdf-upload-component')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-component')).not.toBeInTheDocument();
  });

  test('switches back to chat view when chat button is clicked', () => {
    render(<App />);
    
    // Switch to upload view first
    const uploadButton = screen.getByTestId('upload-nav');
    fireEvent.click(uploadButton);
    
    // Then switch back to chat
    const chatButton = screen.getByTestId('chat-nav');
    fireEvent.click(chatButton);
    
    expect(screen.getByTestId('chat-component')).toBeInTheDocument();
    expect(screen.queryByTestId('pdf-upload-component')).not.toBeInTheDocument();
  });

  test('toggles sidebar state', () => {
    render(<App />);
    
    const toggleButton = screen.getByTestId('toggle-sidebar');
    const mainContent = document.querySelector('.main-content');
    
    // Should start with sidebar open
    expect(mainContent).toHaveClass('sidebar-open');
    
    // Toggle sidebar closed
    fireEvent.click(toggleButton);
    expect(mainContent).toHaveClass('sidebar-closed');
    
    // Toggle sidebar open again
    fireEvent.click(toggleButton);
    expect(mainContent).toHaveClass('sidebar-open');
  });

  test('applies correct CSS classes based on sidebar state', () => {
    render(<App />);
    
    const mainContent = document.querySelector('.main-content');
    expect(mainContent).toHaveClass('main-content');
    expect(mainContent).toHaveClass('sidebar-open');
  });
});
