"""
PDF extraction service using Adobe PDF Extract API + PyMuPDF.

Adobe Extract API → structuredData.json (element positions) + figure PNGs
PyMuPDF          → text-stripped page renders (backgrounds) + per-span text formatting
"""

import os
import io
import json
import zipfile
import fitz  # PyMuPDF

from adobe.pdfservices.operation.auth.service_principal_credentials import ServicePrincipalCredentials
from adobe.pdfservices.operation.pdf_services import PDFServices
from adobe.pdfservices.operation.pdfjobs.jobs.extract_pdf_job import ExtractPDFJob
from adobe.pdfservices.operation.pdfjobs.params.extract_pdf.extract_pdf_params import ExtractPDFParams
from adobe.pdfservices.operation.pdfjobs.params.extract_pdf.extract_element_type import ExtractElementType
from adobe.pdfservices.operation.pdfjobs.params.extract_pdf.extract_renditions_element_type import ExtractRenditionsElementType
from adobe.pdfservices.operation.io.stream_asset import StreamAsset
from adobe.pdfservices.operation.pdfjobs.result.extract_pdf_result import ExtractPDFResult

from backend.config import RENDER_ZOOM, BASE_DIR


# ── ADOBE API ─────────────────────────────────────────────────────────────

def _load_credentials():
    creds_path = os.path.join(BASE_DIR, "pdfservices-api-credentials.json")
    with open(creds_path) as f:
        creds = json.load(f)
    return ServicePrincipalCredentials(
        client_id=creds["client_credentials"]["client_id"],
        client_secret=creds["client_credentials"]["client_secret"],
    )


def _run_adobe_extract(pdf_path, project_dir):
    """Call Adobe PDF Extract API → returns structuredData dict and saves figures."""
    credentials = _load_credentials()
    pdf_services = PDFServices(credentials=credentials)

    with open(pdf_path, "rb") as f:
        input_asset = pdf_services.upload(
            input_stream=f, mime_type="application/pdf"
        )

    params = ExtractPDFParams(
        elements_to_extract=[ExtractElementType.TEXT, ExtractElementType.TABLES],
        elements_to_extract_renditions=[
            ExtractRenditionsElementType.FIGURES,
            ExtractRenditionsElementType.TABLES,
        ],
    )

    job = ExtractPDFJob(input_asset=input_asset, extract_pdf_params=params)
    location = pdf_services.submit(job)
    response = pdf_services.get_job_result(location, ExtractPDFResult)
    result_asset: StreamAsset = pdf_services.get_content(response.get_result().get_resource())

    # Unzip the result
    figures_dir = os.path.join(project_dir, "figures")
    tables_dir = os.path.join(project_dir, "tables")
    os.makedirs(figures_dir, exist_ok=True)
    os.makedirs(tables_dir, exist_ok=True)

    zip_bytes = result_asset.get_input_stream()
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        for name in zf.namelist():
            if name == "structuredData.json":
                with zf.open(name) as jf:
                    structured_data = json.load(jf)
            elif name.startswith("figures/"):
                fname = os.path.basename(name)
                if fname:
                    dest = os.path.join(figures_dir, fname)
                    with zf.open(name) as src, open(dest, "wb") as dst:
                        dst.write(src.read())
            elif name.startswith("tables/"):
                fname = os.path.basename(name)
                if fname:
                    dest = os.path.join(tables_dir, fname)
                    with zf.open(name) as src, open(dest, "wb") as dst:
                        dst.write(src.read())

    # Save structured data for reference
    with open(os.path.join(project_dir, "structuredData.json"), "w") as f:
        json.dump(structured_data, f, indent=2)

    print(f"  [+] Adobe Extract: {len(structured_data.get('elements', []))} elements")
    return structured_data


# ── PYMUPDF HELPERS ───────────────────────────────────────────────────────

def map_font(font_name):
    fn = font_name.lower()
    if 'editor' in fn:
        return 'Arial Black'
    if 'graphikcompact' in fn or 'narrow' in fn or 'condensed' in fn:
        return 'Arial Narrow'
    if 'times' in fn:
        return 'Times New Roman'
    if 'courier' in fn or 'mono' in fn:
        return 'Courier New'
    return 'Arial'


def color_hex(color_int):
    return f'{color_int:06X}'


def _render_pages(pdf_path, assets_dir):
    """Render text-stripped page backgrounds with PyMuPDF."""
    doc = fitz.open(pdf_path)
    page_info = []

    for pg_num in range(len(doc)):
        page = doc[pg_num]

        # Render text-stripped version (clean background for .docx)
        doc_copy = fitz.open(pdf_path)
        page_copy = doc_copy[pg_num]
        text_dict = page_copy.get_text('dict')
        for block in text_dict['blocks']:
            if block['type'] == 0:
                for line in block['lines']:
                    for span in line['spans']:
                        page_copy.add_redact_annot(
                            fitz.Rect(span['bbox']), fill=False
                        )
        page_copy.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)
        pix = page_copy.get_pixmap(
            matrix=fitz.Matrix(RENDER_ZOOM, RENDER_ZOOM), alpha=False
        )
        bg_path = os.path.join(assets_dir, f"page_{pg_num}_bg.png")
        pix.save(bg_path)
        doc_copy.close()

        page_info.append({
            'page': pg_num,
            'width': round(page.rect.width, 2),
            'height': round(page.rect.height, 2),
            'bg_path': f"assets/page_{pg_num}_bg.png",
        })

    doc.close()
    return page_info


def _extract_text_formatting(pdf_path):
    """Extract text per-line — each PDF line becomes its own movable block.

    Keeps inline spans together (e.g. "...offers **Expertise and Flexibility** -...")
    while still giving per-line control (each risk-o-meter label is a separate line).
    """
    doc = fitz.open(pdf_path)
    pages_text = []

    for pg_num in range(len(doc)):
        page = doc[pg_num]
        text_dict = page.get_text('dict')
        blocks = []

        for block in text_dict['blocks']:
            if block['type'] != 0:
                continue
            for line in block['lines']:
                spans = []
                for span in line['spans']:
                    if not span['text'].strip():
                        continue
                    flags = span['flags']
                    fn = span['font'].lower()
                    is_bold = (
                        bool(flags & (1 << 4))
                        or 'bold' in fn
                        or 'semibold' in fn
                        or 'medium' in fn
                    )
                    is_italic = bool(flags & (1 << 1))
                    spans.append({
                        'text': span['text'],
                        'font': map_font(span['font']),
                        'size': round(span['size'], 2),
                        'color': color_hex(span['color']),
                        'bold': is_bold,
                        'italic': is_italic,
                        'bbox': [round(v, 2) for v in span['bbox']],
                    })
                if spans:
                    # Each line becomes its own block (one line, multiple spans)
                    blocks.append({
                        'bbox': [round(v, 2) for v in line['bbox']],
                        'lines': [{
                            'spans': spans,
                            'bbox': [round(v, 2) for v in line['bbox']],
                        }],
                    })

        pages_text.append(blocks)

    doc.close()
    return pages_text


# ── TABLE PARSING ────────────────────────────────────────────────────────

def _parse_adobe_tables(adobe_data, page_heights):
    """Parse Adobe structured data to extract table structures.

    Returns dict: page_index -> list of table dicts, each with:
      - bbox: [left, top, right, bottom] in top-left origin
      - rows: list of row dicts, each with cells containing text and bbox
    """
    import re
    elements = adobe_data.get('elements', [])

    # Find top-level table elements
    top_tables = []
    for el in elements:
        path = el.get('Path', '')
        if re.match(r'^//Document(/Aside)?/Table(\[\d+\])?$', path):
            top_tables.append(el)

    if not top_tables:
        return {}

    tables_by_page = {}

    for table_el in top_tables:
        table_path = table_el['Path']
        page = table_el.get('Page', 0)
        page_h = page_heights.get(page, 841.92)
        attrs = table_el.get('attributes', {})
        num_rows = attrs.get('NumRow', 0)
        num_cols = attrs.get('NumCol', 0)

        # Table bbox (convert from bottom-left to top-left)
        bbox_bl = attrs.get('BBox', table_el.get('Bounds', []))
        if not bbox_bl or len(bbox_bl) < 4:
            continue
        table_bbox = [
            round(bbox_bl[0], 2),
            round(page_h - bbox_bl[3], 2),
            round(bbox_bl[2], 2),
            round(page_h - bbox_bl[1], 2),
        ]

        # Collect cell elements belonging to this table
        child_prefix = table_path + '/'
        child_elements = [
            e for e in elements
            if e.get('Path', '').startswith(child_prefix)
        ]

        # Parse rows and cells from the element paths
        # Paths look like: .../TR[n]/TD[m]/P or .../TR[n]/TH[m]/P
        rows_dict = {}  # row_idx -> {col_idx -> cell_data}

        for el in child_elements:
            path = el.get('Path', '')
            rel_path = path[len(table_path):]

            # Extract row index from TR or TR[n]
            tr_match = re.match(r'/TR(?:\[(\d+)\])?/', rel_path)
            if not tr_match:
                continue
            row_idx = int(tr_match.group(1)) if tr_match.group(1) else 1

            # Extract col index from TD/TH or TD[n]/TH[n]
            cell_match = re.search(r'/T[DH](?:\[(\d+)\])?', rel_path)
            if not cell_match:
                continue
            col_idx = int(cell_match.group(1)) if cell_match.group(1) else 1

            # Is this a text element (P, P/Sub, etc.)?
            text = el.get('Text', '').strip()
            if not text:
                # Cell container (TD/TH) has bbox but no text
                cell_bbox_bl = el.get('attributes', {}).get('BBox', [])
                if cell_bbox_bl and len(cell_bbox_bl) >= 4:
                    if row_idx not in rows_dict:
                        rows_dict[row_idx] = {}
                    if col_idx not in rows_dict[row_idx]:
                        rows_dict[row_idx][col_idx] = {
                            'text': '',
                            'bbox': [
                                round(cell_bbox_bl[0], 2),
                                round(page_h - cell_bbox_bl[3], 2),
                                round(cell_bbox_bl[2], 2),
                                round(page_h - cell_bbox_bl[1], 2),
                            ],
                            'is_header': '/TH' in rel_path,
                        }
                continue

            if row_idx not in rows_dict:
                rows_dict[row_idx] = {}
            if col_idx not in rows_dict[row_idx]:
                rows_dict[row_idx][col_idx] = {
                    'text': '',
                    'bbox': [0, 0, 0, 0],
                    'is_header': '/TH' in rel_path,
                }

            cell = rows_dict[row_idx][col_idx]
            # Append text (multiple P elements in same cell)
            if cell['text']:
                cell['text'] += ' ' + text
            else:
                cell['text'] = text

        # Build ordered rows
        rows = []
        for ri in sorted(rows_dict.keys()):
            cells = []
            for ci in sorted(rows_dict[ri].keys()):
                cells.append(rows_dict[ri][ci])
            rows.append({'cells': cells})

        table_data = {
            'bbox': table_bbox,
            'rows': rows,
            'num_rows': num_rows,
            'num_cols': num_cols,
        }

        if page not in tables_by_page:
            tables_by_page[page] = []
        tables_by_page[page].append(table_data)

    return tables_by_page


def _is_inside_table(block_bbox, table_bboxes, margin=2):
    """Check if a text block falls inside any table region."""
    bx0, by0, bx1, by1 = block_bbox
    cx = (bx0 + bx1) / 2
    cy = (by0 + by1) / 2
    for tbbox in table_bboxes:
        tx0, ty0, tx1, ty1 = tbbox
        if (tx0 - margin <= cx <= tx1 + margin and
                ty0 - margin <= cy <= ty1 + margin):
            return True
    return False


# ── MAIN EXTRACTION ───────────────────────────────────────────────────────

def extract_project(pdf_path, project_dir):
    """Extract everything from a PDF into a project directory.

    Uses Adobe PDF Extract API for figure extraction and element structure,
    and PyMuPDF for text-stripped backgrounds and per-span text formatting.

    Returns a list of page data dicts ready for JSON serialization.
    """
    assets_dir = os.path.join(project_dir, "assets")
    os.makedirs(assets_dir, exist_ok=True)

    # 1. Adobe Extract API → figures + element positions
    print("  [*] Calling Adobe PDF Extract API...")
    adobe_data = _run_adobe_extract(pdf_path, project_dir)

    # 2. PyMuPDF → text-stripped backgrounds + text formatting
    print("  [*] Rendering page backgrounds...")
    page_info = _render_pages(pdf_path, assets_dir)

    print("  [*] Extracting text formatting...")
    pages_text = _extract_text_formatting(pdf_path)

    # 3. Parse Adobe tables
    page_heights = {pi['page']: pi['height'] for pi in page_info}
    tables_by_page = _parse_adobe_tables(adobe_data, page_heights)

    # 4. Build final page data
    pages_data = []
    for pg_idx, pi in enumerate(page_info):
        page_tables = tables_by_page.get(pg_idx, [])

        # All text blocks from PyMuPDF (kept for editor display)
        blocks_data = []
        for bi, block in enumerate(pages_text[pg_idx]):
            blocks_data.append({
                'id': f"p{pg_idx}_b{bi}",
                'bbox': block['bbox'],
                'lines': block['lines'],
            })

        pages_data.append({
            'page': pg_idx,
            'width': pi['width'],
            'height': pi['height'],
            'background_image': pi['bg_path'],
            'blocks': blocks_data,
            'tables': page_tables,
            'images': [],
        })

    print(f"  [+] Extracted {len(pages_data)} pages")
    for p in pages_data:
        print(f"      Page {p['page']}: {len(p['blocks'])} text blocks, {len(p.get('tables', []))} tables, {len(p['images'])} figures")
    return pages_data
