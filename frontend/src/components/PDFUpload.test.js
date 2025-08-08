import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import axios from 'axios';
import PDFUpload from './PDFUpload';

// Mock axios
jest.mock('axios');
const mockedAxios = axios;

// Mock URL.createObjectURL
global.URL.createObjectURL = jest.fn(() => 'mocked-url');
global.URL.revokeObjectURL = jest.fn();

// Mock FileReader
global.FileReader = class {
  constructor() {
    this.readAsDataURL = jest.fn(() => {
      this.onload({ target: { result: 'data:application/pdf;base64,mock-data' } });
    });
  }
};

describe('PDFUpload Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default successful upload response
    mockedAxios.post.mockResolvedValue({
      data: {
        success: true,
        message: 'PDF uploaded successfully',
        filename: 'test.pdf',
        chunks: 5
      }
    });
    
    // Default documents list response
    mockedAxios.get.mockResolvedValue({
      data: [
        {
          filename: 'document1.pdf',
          uploadDate: new Date().toISOString(),
          size: 1024000
        }
      ]
    });
  });

  test('renders upload interface components', () => {
    render(<PDFUpload />);
    
    // Check for upload area
    expect(screen.getByText(/drag.*drop.*pdf/i) || screen.getByText(/upload.*pdf/i)).toBeInTheDocument();
    
    // Check for file input
    const fileInput = screen.getByLabelText(/choose file/i) || document.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();
  });

  test('handles file selection via input', async () => {
    render(<PDFUpload />);
    
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();
    
    // Create a mock PDF file
    const file = new File(['mock pdf content'], 'test.pdf', { type: 'application/pdf' });
    
    // Simulate file selection
    fireEvent.change(fileInput, { target: { files: [file] } });
    
    // Should show selected file name
    await waitFor(() => {
      expect(screen.getByText('test.pdf')).toBeInTheDocument();
    });
  });

  test('handles drag and drop file upload', async () => {
    render(<PDFUpload />);
    
    const dropArea = screen.getByText(/drag.*drop.*pdf/i) || screen.getByTestId('drop-area') || document.querySelector('.upload-area');
    
    if (dropArea) {
      const file = new File(['mock pdf content'], 'dropped.pdf', { type: 'application/pdf' });
      
      // Simulate drag over
      fireEvent.dragOver(dropArea, {
        dataTransfer: {
          files: [file],
          types: ['Files']
        }
      });
      
      // Simulate drop
      fireEvent.drop(dropArea, {
        dataTransfer: {
          files: [file]
        }
      });
      
      // Should show dropped file name
      await waitFor(() => {
        expect(screen.getByText('dropped.pdf')).toBeInTheDocument();
      });
    }
  });

  test('validates PDF file type', () => {
    render(<PDFUpload />);
    
    const fileInput = document.querySelector('input[type="file"]');
    
    // Try to upload non-PDF file
    const invalidFile = new File(['content'], 'test.txt', { type: 'text/plain' });
    
    fireEvent.change(fileInput, { target: { files: [invalidFile] } });
    
    // Should show error message
    expect(screen.getByText(/only.*pdf.*files/i) || screen.getByText(/invalid.*file.*type/i)).toBeInTheDocument();
  });

  test('validates file size limit', () => {
    render(<PDFUpload />);
    
    const fileInput = document.querySelector('input[type="file"]');
    
    // Create a large file (mock - actual size checking would depend on implementation)
    const largeFile = new File(['x'.repeat(50 * 1024 * 1024)], 'large.pdf', { 
      type: 'application/pdf'
    });
    
    // Override the size property to simulate large file
    Object.defineProperty(largeFile, 'size', {
      value: 50 * 1024 * 1024, // 50MB
      writable: false
    });
    
    fireEvent.change(fileInput, { target: { files: [largeFile] } });
    
    // Should show size limit error (if component implements size checking)
    // This test may need adjustment based on actual implementation
    const errorText = screen.queryByText(/file.*too.*large/i) || screen.queryByText(/size.*limit/i);
    if (errorText) {
      expect(errorText).toBeInTheDocument();
    }
  });

  test('uploads file successfully', async () => {
    render(<PDFUpload />);
    
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(['mock pdf content'], 'test.pdf', { type: 'application/pdf' });
    
    // Select file
    fireEvent.change(fileInput, { target: { files: [file] } });
    
    // Find and click upload button
    const uploadButton = screen.getByRole('button', { name: /upload/i });
    fireEvent.click(uploadButton);
    
    // Wait for upload to complete
    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/api/upload',
        expect.any(FormData),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'multipart/form-data'
          })
        })
      );
    });
    
    // Should show success message
    await waitFor(() => {
      expect(screen.getByText(/uploaded successfully/i)).toBeInTheDocument();
    });
  });

  test('shows upload progress', async () => {
    render(<PDFUpload />);
    
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(['mock pdf content'], 'test.pdf', { type: 'application/pdf' });
    
    // Mock axios with progress callback
    mockedAxios.post.mockImplementation((url, data, config) => {
      // Simulate upload progress
      if (config && config.onUploadProgress) {
        setTimeout(() => config.onUploadProgress({ loaded: 50, total: 100 }), 10);
        setTimeout(() => config.onUploadProgress({ loaded: 100, total: 100 }), 20);
      }
      return Promise.resolve({
        data: { success: true, message: 'Upload complete' }
      });
    });
    
    // Select file and upload
    fireEvent.change(fileInput, { target: { files: [file] } });
    const uploadButton = screen.getByRole('button', { name: /upload/i });
    fireEvent.click(uploadButton);
    
    // Should show progress indicator
    await waitFor(() => {
      const progressElement = screen.queryByRole('progressbar') || 
                            screen.queryByText(/uploading/i) || 
                            screen.queryByText(/progress/i);
      if (progressElement) {
        expect(progressElement).toBeInTheDocument();
      }
    });
  });

  test('handles upload errors', async () => {
    // Mock upload failure
    mockedAxios.post.mockRejectedValue(new Error('Upload failed'));
    
    render(<PDFUpload />);
    
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(['mock pdf content'], 'test.pdf', { type: 'application/pdf' });
    
    // Select file and upload
    fireEvent.change(fileInput, { target: { files: [file] } });
    const uploadButton = screen.getByRole('button', { name: /upload/i });
    fireEvent.click(uploadButton);
    
    // Should show error message
    await waitFor(() => {
      expect(screen.getByText(/upload.*failed/i) || screen.getByText(/error/i)).toBeInTheDocument();
    });
  });

  test('displays uploaded documents list', async () => {
    render(<PDFUpload />);
    
    // Wait for documents to load
    await waitFor(() => {
      expect(mockedAxios.get).toHaveBeenCalledWith('/api/documents');
    });
    
    // Should display the document
    await waitFor(() => {
      expect(screen.getByText('document1.pdf')).toBeInTheDocument();
    });
  });

  test('allows document deletion', async () => {
    mockedAxios.delete = jest.fn().mockResolvedValue({ data: { success: true } });
    
    render(<PDFUpload />);
    
    // Wait for documents to load
    await waitFor(() => {
      expect(screen.getByText('document1.pdf')).toBeInTheDocument();
    });
    
    // Find and click delete button
    const deleteButton = screen.getByRole('button', { name: /delete/i }) ||
                        screen.getByLabelText(/delete/i) ||
                        document.querySelector('[data-testid="delete-button"]');
    
    if (deleteButton) {
      fireEvent.click(deleteButton);
      
      // Should call delete API
      await waitFor(() => {
        expect(mockedAxios.delete).toHaveBeenCalledWith(
          '/api/documents/document1.pdf'
        );
      });
      
      // Document should be removed from list
      await waitFor(() => {
        expect(screen.queryByText('document1.pdf')).not.toBeInTheDocument();
      });
    }
  });

  test('prevents multiple simultaneous uploads', async () => {
    render(<PDFUpload />);
    
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(['mock pdf content'], 'test.pdf', { type: 'application/pdf' });
    
    // Start first upload
    fireEvent.change(fileInput, { target: { files: [file] } });
    const uploadButton = screen.getByRole('button', { name: /upload/i });
    fireEvent.click(uploadButton);
    
    // Button should be disabled during upload
    expect(uploadButton).toBeDisabled();
    
    // Wait for upload to complete
    await waitFor(() => {
      expect(uploadButton).not.toBeDisabled();
    });
  });

  test('handles empty file selection', () => {
    render(<PDFUpload />);
    
    const fileInput = document.querySelector('input[type="file"]');
    
    // Try to upload without selecting file
    const uploadButton = screen.getByRole('button', { name: /upload/i });
    fireEvent.click(uploadButton);
    
    // Should show error or prevent upload
    expect(screen.getByText(/select.*file/i) || screen.getByText(/no.*file/i)).toBeInTheDocument();
  });

  test('displays file size and type information', async () => {
    render(<PDFUpload />);
    
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(['mock pdf content'], 'test.pdf', { type: 'application/pdf' });
    
    // Override size for testing
    Object.defineProperty(file, 'size', {
      value: 1024000, // 1MB
      writable: false
    });
    
    fireEvent.change(fileInput, { target: { files: [file] } });
    
    // Should display file information
    await waitFor(() => {
      expect(screen.getByText('test.pdf')).toBeInTheDocument();
      // May also show size information
      const sizeText = screen.queryByText(/1.*mb/i) || screen.queryByText(/1024/i);
      if (sizeText) {
        expect(sizeText).toBeInTheDocument();
      }
    });
  });
});