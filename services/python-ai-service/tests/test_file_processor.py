"""
Unit Tests for FileUploadProcessor (pdf_extractor.py)
"""

from app.services.file_processor.pdf_extractor import FileUploadProcessor


def test_extract_document_pdf(sample_pdf_bytes):
    processor = FileUploadProcessor()
    res = processor.extract_document(sample_pdf_bytes, "sample.pdf", "application/pdf")
    
    assert res["success"] is True
    assert res["filename"] == "sample.pdf"
    assert res["page_count"] == 2
    assert "TaskFlow AI" in res["extracted_text"]
    assert "Section 2" in res["extracted_text"]


def test_extract_document_plain_text():
    processor = FileUploadProcessor()
    text_bytes = b"Simple plain text file upload for chat attachment"
    res = processor.extract_document(text_bytes, "notes.txt", "text/plain")
    
    assert res["success"] is True
    assert res["extracted_text"] == "Simple plain text file upload for chat attachment"
    assert res["page_count"] == 1


def test_extract_document_empty():
    processor = FileUploadProcessor()
    res = processor.extract_document(b"", "empty.pdf", "application/pdf")
    
    assert res["success"] is False
    assert res["error_message"] == "Empty file payload"


def test_extract_document_csv():
    processor = FileUploadProcessor()
    csv_bytes = b"Name,Role,Status\nAlice,Manager,Active\nBob,Engineer,Active"
    res = processor.extract_document(csv_bytes, "users.csv", "text/csv")
    
    assert res["success"] is True
    assert res["extraction_method"] == "pandas_markdown_table"
    assert "Alice" in res["extracted_text"]
    assert "Manager" in res["extracted_text"]


def test_extract_document_image():
    processor = FileUploadProcessor()
    img_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
    res = processor.extract_document(img_bytes, "diagram.png", "image/png")
    
    assert res["success"] is True
    assert res["extraction_method"] == "image_attachment_context"
    assert "[Image Attachment: diagram.png" in res["extracted_text"]
