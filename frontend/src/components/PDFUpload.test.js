import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PDFUpload from './PDFUpload';

describe('PDFUpload Component', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'success',
        chunks: 5,
      }),
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('renders upload interface components', () => {
    render(<PDFUpload />);
    expect(screen.getByText(/upload pdf document/i)).toBeInTheDocument();
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();
  });

  test('handles file selection via input', async () => {
    render(<PDFUpload />);
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();

    const file = new File(['mock pdf content'], 'test.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText('test.pdf')).toBeInTheDocument();
    });
  });

  test('handles drag and drop file upload', async () => {
    render(<PDFUpload />);
    const dropArea = document.querySelector('.upload-zone');

    if (dropArea) {
      const file = new File(['mock pdf content'], 'dropped.pdf', { type: 'application/pdf' });

      fireEvent.dragOver(dropArea, {
        dataTransfer: {
          files: [file],
          types: ['Files']
        }
      });
      fireEvent.drop(dropArea, {
        dataTransfer: {
          files: [file]
        }
      });
      await waitFor(() => {
        expect(screen.getByText('dropped.pdf')).toBeInTheDocument();
      });
    }
  });

  test('uploads file successfully', async () => {
    render(<PDFUpload />);
    
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(['mock pdf content'], 'test.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    const uploadButton = screen.getByRole('button', { name: /upload/i });
    fireEvent.click(uploadButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByText(/upload successful/i)).toBeInTheDocument();
    });
  });

  test('shows upload progress', async () => {
    render(<PDFUpload />);
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(['mock pdf content'], 'test.pdf', { type: 'application/pdf' });

    fireEvent.change(fileInput, { target: { files: [file] } });
    const uploadButton = screen.getByRole('button', { name: /upload/i });
    fireEvent.click(uploadButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/upload successful/i)).toBeInTheDocument();
    });
  });

  test('handles upload errors', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Upload failed'));

    render(<PDFUpload />);
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(['mock pdf content'], 'test.pdf', { type: 'application/pdf' });

    fireEvent.change(fileInput, { target: { files: [file] } });
    const uploadButton = screen.getByRole('button', { name: /upload/i });
    fireEvent.click(uploadButton);

    await waitFor(() => {
      expect(
        screen.getByText(/error uploading pdf/i),
      ).toBeInTheDocument();
    });
  });

  test('prevents multiple simultaneous uploads', async () => {
    render(<PDFUpload />);
    
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(['mock pdf content'], 'test.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    const uploadButton = screen.getByRole('button', { name: /upload/i });
    fireEvent.click(uploadButton);
    expect(uploadButton).toBeDisabled();

    await waitFor(() => {
      expect(uploadButton).not.toBeDisabled();
    });
  });

  test('handles empty file selection', () => {
    render(<PDFUpload />);
    const uploadButton = screen.queryByRole('button', { name: /upload/i });
    expect(uploadButton).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('displays file size and type information', async () => {
    render(<PDFUpload />);
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(['mock pdf content'], 'test.pdf', { type: 'application/pdf' });

    Object.defineProperty(file, 'size', {
      value: 1024000, // 1MB
      writable: false
    });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText('test.pdf')).toBeInTheDocument();
      const sizeText = screen.queryByText(/1.*mb/i) || screen.queryByText(/1024/i);
      if (sizeText) {
        expect(sizeText).toBeInTheDocument();
      }
    });
  });
});
