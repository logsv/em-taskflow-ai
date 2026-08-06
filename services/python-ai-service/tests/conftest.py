"""
Pytest Fixtures for Python AI Microservice Tests
"""

import pytest
import fitz
import sys
import os

# Add service root directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


@pytest.fixture
def sample_pdf_bytes():
    """Generate in-memory sample PDF bytes using PyMuPDF for test assertions."""
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 50), "Hello TaskFlow AI - Section 1 Document Text")
    page2 = doc.new_page()
    page2.insert_text((50, 50), "Evaluation Rubrics and Verification Requirements - Section 2")
    pdf_bytes = doc.write()
    doc.close()
    return pdf_bytes


@pytest.fixture
def sample_text_content():
    """Sample document text for chunking and reranking tests."""
    return (
        "Engineering Management TaskFlow AI provides high-performance local RAG retrieval. "
        "The system uses 512-token chunks with 64-token overlap for optimal vector indexing. "
        "PostgreSQL hybrid search combines vector similarity with tsvector full-text search. "
        "FlashRank Cross-Encoder reranking filters candidate chunks to eliminate hallucinations. "
        "Fast-path classification executes direct LLM queries in less than 300 milliseconds."
    )
