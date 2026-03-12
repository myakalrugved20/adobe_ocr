import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from backend.services import project_manager, docx_builder

router = APIRouter()


def _extract_text(project_data):
    """Extract all text from project data, page by page, preserving reading order."""
    lines = []
    for page in project_data.get('pages', []):
        page_num = page.get('page', 0)
        lines.append(f"--- Page {page_num + 1} ---")

        for block in page.get('blocks', []):
            block_texts = []
            for line in block.get('lines', []):
                span_texts = [s.get('text', '') for s in line.get('spans', [])]
                block_texts.append(''.join(span_texts))
            text = ' '.join(block_texts).strip()
            if text:
                lines.append(text)

        for table in page.get('tables', []):
            lines.append("[TABLE]")
            for row in table.get('rows', []):
                cells = [c.get('text', '') for c in row.get('cells', [])]
                lines.append(' | '.join(cells))
            lines.append("[/TABLE]")

        lines.append('')
    return '\n'.join(lines)


@router.get("/api/download/{project_id}")
async def download_docx(project_id: str):
    data = project_manager.load_project_data(project_id)
    if not data:
        raise HTTPException(404, "Project not found")

    project_dir = project_manager.get_project_dir(project_id)
    output_path = os.path.join(project_dir, "output.docx")

    try:
        docx_builder.build_docx(data, project_dir, output_path)
    except Exception as e:
        raise HTTPException(500, f"DOCX build failed: {str(e)}")

    # Write extracted OCR text to .txt alongside the .docx
    txt_path = os.path.join(project_dir, "extracted_text.txt")
    try:
        with open(txt_path, 'w', encoding='utf-8') as f:
            f.write(_extract_text(data))
        print(f"  [+] Wrote: {txt_path}")
    except Exception as e:
        print(f"  [!] Warning: could not write text file: {e}")

    filename = data.get('pdf_filename', 'output').replace('.pdf', '') + '_translated.docx'
    return FileResponse(
        output_path,
        media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filename=filename,
    )
