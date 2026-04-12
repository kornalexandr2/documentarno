import logging
import os
import fitz  # PyMuPDF
import tempfile
import torch
from paddleocr import PPStructure
from markdownify import markdownify as md
from docx import Document as DocxDocument
from typing import Callable, Optional

logger = logging.getLogger(__name__)

# Initialize PaddleOCR globally
try:
    use_gpu = torch.cuda.is_available()
    ocr_engine = PPStructure(
        lang='en', 
        show_log=False,
        use_gpu=use_gpu,
        layout=True,
        table=True,
        recovery=True
    )
    logger.info(f"PaddleOCR engine initialized successfully (GPU: {use_gpu}).")
except Exception as e:
    logger.error(f"Failed to initialize PaddleOCR engine: {e}")
    ocr_engine = None

def process_pdf_to_markdown(file_path: str, progress_callback: Optional[Callable[[int, int], None]] = None) -> str:
    """
    Extracts text and tables from a PDF using PaddleOCR PPStructure.
    """
    if not ocr_engine:
        raise RuntimeError("OCR Engine is not initialized")

    doc = None
    try:
        doc = fitz.open(file_path)
        markdown_content = []
        temp_dir = tempfile.gettempdir()
        total_pages = len(doc)

        for page_num in range(total_pages):
            if progress_callback:
                progress_callback(page_num + 1, total_pages)
            
            logger.info(f"--- [OCR PROGRESS] Processing page {page_num + 1}/{total_pages} ---")
            page = doc.load_page(page_num)
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
            img_bytes = pix.tobytes("png")

            temp_img_path = os.path.join(temp_dir, f"doc_page_{page_num}_{os.getpid()}.png")
            with open(temp_img_path, "wb") as f:
                f.write(img_bytes)

            try:
                result = ocr_engine(temp_img_path)
                markdown_content.append(f"\n## Страница {page_num + 1}\n")

                for region in result:
                    region_type = region['type']
                    res = region['res']

                    if region_type == 'Table':
                        html_table = res.get('html', '')
                        if html_table:
                            md_table = md(html_table, strip=['html', 'body', 'head'])
                            markdown_content.append(md_table.strip())
                    elif region_type in ['Figure', 'Equation']:
                        markdown_content.append(f"\n*[Изображение/График]*\n")
                    else:
                        text_lines = [line['text'] for line in res]
                        text_block = " ".join(text_lines)
                        if region_type == 'Title':
                            markdown_content.append(f"\n### {text_block}\n")
                        else:
                            markdown_content.append(text_block)
            finally:
                if os.path.exists(temp_img_path):
                    os.remove(temp_img_path)

        return "\n".join(markdown_content)
    finally:
        if doc is not None:
            doc.close()

def process_docx_to_markdown(file_path: str) -> str:
    """
    Extracts text and simple tables from a DOCX file and converts it to Markdown.
    """
    try:
        logger.info(f"--- [DOCX PROGRESS] Extracting text from {os.path.basename(file_path)} ---")
        doc = DocxDocument(file_path)
        markdown_content = []
        
        for para in doc.paragraphs:
            if para.text.strip():
                if para.style.name.startswith('Heading 1'):
                    markdown_content.append(f"# {para.text}")
                elif para.style.name.startswith('Heading 2'):
                    markdown_content.append(f"## {para.text}")
                elif para.style.name.startswith('Heading 3'):
                    markdown_content.append(f"### {para.text}")
                else:
                    markdown_content.append(para.text)
        
        for table in doc.tables:
            markdown_content.append("\n")
            if len(table.rows) > 0:
                header_row = table.rows[0]
                cols_count = len(header_row.cells)
                for i, row in enumerate(table.rows):
                    cells = [cell.text.replace("\n", " ").strip() for cell in row.cells]
                    markdown_content.append("| " + " | ".join(cells) + " |")
                    if i == 0:
                        markdown_content.append("| " + " | ".join(["---"] * cols_count) + " |")
            markdown_content.append("\n")

        return "\n".join(markdown_content)
    except Exception as e:
        logger.error(f"Error processing DOCX: {e}")
        raise RuntimeError(f"Failed to process DOCX: {e}")
