"""
File Upload Processor Module (Modular Service 1)
Handles multi-format text extraction (PDF, CSV/Tabular, Word DOCX, Images, and Text/MD).
Normalizes all output into structured Markdown text.
"""

import io
import fitz  # PyMuPDF
from app.telemetry.tracer import trace_observation


class FileUploadProcessor:
    """Fast-path document and image extraction processor for multi-format files."""

    def extract_text(self, file_bytes: bytes, filename: str, mime_type: str = "") -> str:
        """Convenience method returning extracted text string directly for Temporal activities."""
        res = self.extract_document(file_bytes, filename, mime_type)
        return res.get("extracted_text", "")

    @trace_observation("extract_document")
    def extract_document(self, file_bytes: bytes, filename: str, mime_type: str = "") -> dict:
        """
        Extract text content from uploaded file bytes.
        Routes extraction based on file extension and MIME type.
        """
        if not file_bytes:
            return {
                "success": False,
                "filename": filename,
                "extracted_text": "",
                "page_count": 0,
                "extraction_method": "none",
                "error_message": "Empty file payload",
            }

        fname_lower = filename.lower()

        # PDF Files
        if fname_lower.endswith(".pdf") or "pdf" in mime_type.lower():
            return self._extract_pdf(file_bytes, filename)

        # CSV / TSV / Excel Tabular Data
        if fname_lower.endswith((".csv", ".tsv", ".xlsx", ".xls")) or any(k in mime_type.lower() for k in ["csv", "spreadsheet", "excel", "tab-separated"]):
            return self._extract_csv(file_bytes, filename)

        # Word Documents (.docx, .doc)
        if fname_lower.endswith((".docx", ".doc")) or "wordprocessingml" in mime_type.lower() or "msword" in mime_type.lower():
            return self._extract_docx(file_bytes, filename)

        # Images (.png, .jpg, .jpeg, .webp, .bmp)
        if fname_lower.endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp")) or "image/" in mime_type.lower():
            return self._extract_image(file_bytes, filename, mime_type)

        # Plain Text / Markdown / JSON / Log fallback
        return self._extract_text_fallback(file_bytes, filename)

    def _extract_pdf(self, file_bytes: bytes, filename: str) -> dict:
        """Extract pages and tables from PDF bytes using PyMuPDF (fitz)."""
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            page_count = len(doc)
            extracted_pages = []

            for page_num in range(page_count):
                page = doc[page_num]
                text = page.get_text("text").strip()
                if text:
                    header = f"--- Page {page_num + 1} ---"
                    extracted_pages.append(f"{header}\n{text}")

            full_text = "\n\n".join(extracted_pages).strip()

            if not full_text:
                return {
                    "success": False,
                    "filename": filename,
                    "extracted_text": "",
                    "page_count": page_count,
                    "extraction_method": "pymupdf_empty",
                    "error_message": "No text content found in PDF",
                }

            return {
                "success": True,
                "filename": filename,
                "extracted_text": full_text,
                "page_count": page_count,
                "extraction_method": "pymupdf_fitz",
                "error_message": "",
            }
        except Exception as e:
            return {
                "success": False,
                "filename": filename,
                "extracted_text": "",
                "page_count": 0,
                "extraction_method": "pymupdf_error",
                "error_message": f"PDF parsing error: {str(e)}",
            }

    def _extract_csv(self, file_bytes: bytes, filename: str) -> dict:
        """Extract CSV/Excel data into clean LLM-friendly Markdown tables using pandas."""
        try:
            import pandas as pd
            fname_lower = filename.lower()
            if fname_lower.endswith((".xlsx", ".xls")):
                df = pd.read_excel(io.BytesIO(file_bytes))
            else:
                sep = "\t" if fname_lower.endswith(".tsv") else ","
                df = pd.read_csv(io.BytesIO(file_bytes), sep=sep, encoding="utf-8", on_bad_lines="skip")
            
            # Format as Markdown table
            md_table = df.to_markdown(index=False)
            header = f"# Tabular Data: {filename} ({len(df)} rows, {len(df.columns)} columns)\n"
            full_text = f"{header}\n{md_table}"

            return {
                "success": True,
                "filename": filename,
                "extracted_text": full_text,
                "page_count": 1,
                "extraction_method": "pandas_markdown_table",
                "error_message": "",
            }
        except Exception as e:
            # Fallback to plain text string decoding
            return self._extract_text_fallback(file_bytes, filename)

    def _extract_docx(self, file_bytes: bytes, filename: str) -> dict:
        """Extract Word document (.docx) paragraphs and tables into Markdown text."""
        try:
            import docx

            doc = docx.Document(io.BytesIO(file_bytes))
            parts = []

            for para in doc.paragraphs:
                p_text = para.text.strip()
                if p_text:
                    if para.style.name.startswith("Heading"):
                        level = para.style.name.replace("Heading", "").strip()
                        hashes = "#" * (int(level) if level.isdigit() else 2)
                        parts.append(f"{hashes} {p_text}")
                    else:
                        parts.append(p_text)

            # Process tables in docx
            for table in doc.tables:
                rows_data = []
                for row in table.rows:
                    rows_data.append([cell.text.strip() for cell in row.cells])
                if rows_data:
                    import pandas as pd
                    df = pd.DataFrame(rows_data[1:], columns=rows_data[0] if len(rows_data) > 1 else None)
                    parts.append(df.to_markdown(index=False))

            full_text = "\n\n".join(parts).strip()
            return {
                "success": True,
                "filename": filename,
                "extracted_text": full_text,
                "page_count": 1,
                "extraction_method": "python_docx",
                "error_message": "",
            }
        except Exception as e:
            return {
                "success": False,
                "filename": filename,
                "extracted_text": "",
                "page_count": 0,
                "extraction_method": "docx_error",
                "error_message": f"DOCX parsing error: {str(e)}",
            }

    def _extract_image(self, file_bytes: bytes, filename: str, mime_type: str) -> dict:
        """Process image file attachment metadata for vision LLM prompt context."""
        mtype = mime_type or "image"
        return {
            "success": True,
            "filename": filename,
            "extracted_text": f"[Image Attachment: {filename} ({len(file_bytes)} bytes, MIME: {mtype})]",
            "page_count": 1,
            "extraction_method": "image_attachment_context",
            "error_message": "",
        }

    def _extract_text_fallback(self, file_bytes: bytes, filename: str) -> dict:
        """Fallback plain text UTF-8 / latin-1 decoder."""
        try:
            text = file_bytes.decode("utf-8", errors="replace").strip()
            return {
                "success": True,
                "filename": filename,
                "extracted_text": text,
                "page_count": 1,
                "extraction_method": "utf8_text",
                "error_message": "",
            }
        except Exception as e:
            return {
                "success": False,
                "filename": filename,
                "extracted_text": "",
                "page_count": 0,
                "extraction_method": "failed",
                "error_message": str(e),
            }

