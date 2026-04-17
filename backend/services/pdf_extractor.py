"""
PDF extraction service using Adobe PDF Extract API + PyMuPDF.

Adobe Extract API → structuredData.json (element positions) + figure PNGs
PyMuPDF          → text-stripped page renders (backgrounds) + per-span text formatting
"""

import os
import io
import json
import zipfile
import unicodedata
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
    client_id = os.environ.get("ADOBE_CLIENT_ID")
    client_secret = os.environ.get("ADOBE_CLIENT_SECRET")
    if client_id and client_secret:
        return ServicePrincipalCredentials(
            client_id=client_id,
            client_secret=client_secret,
        )
    # Fallback to JSON file for local development
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
    # Modern sans-serifs map to Calibri (≈7% narrower than Arial, closer metrics
    # to the originals; ships with Word/Office on every platform).
    sans_keys = ('anek', 'inter', 'sourcesans', 'source sans', 'opensans',
                 'open sans', 'lato', 'roboto', 'nunito', 'graphik')
    if any(k in fn for k in sans_keys):
        return 'Calibri'
    return 'Calibri'


# Width of common fallback fonts at the same point size, relative to Helvetica.
# Used to convert Helvetica-measured widths into per-fallback width estimates.
_FONT_METRIC_RATIO = {
    'Arial':            1.00,
    'Arial Black':      1.15,
    'Arial Narrow':     0.83,
    'Calibri':          0.93,
    'Times New Roman':  0.93,
    'Courier New':      1.00,
}

# Cached PyMuPDF Base14 fonts for measurement (always available, no install).
_HELV_FONTS = {}


def _helv(bold=False, italic=False):
    key = (bool(bold), bool(italic))
    if key not in _HELV_FONTS:
        name = {(False, False): 'helv', (True, False): 'hebo',
                (False, True): 'heit', (True, True): 'hebi'}[key]
        _HELV_FONTS[key] = fitz.Font(name)
    return _HELV_FONTS[key]


def _measure_text_width(text, font_name, size, bold=False, italic=False):
    """Rendered width in points for text at size pt in the chosen fallback font."""
    if not text:
        return 0.0
    base_w = _helv(bold, italic).text_length(text, fontsize=size)
    return base_w * _FONT_METRIC_RATIO.get(font_name, 1.0)


# Known PUA-to-Unicode mappings for symbols in PDFs with custom/embedded fonts.
# Extend this dict as new misencoded characters are discovered.
_PUA_FIXUP = {
    '\uF020': ' ',
    '\uF025': '%',
    '\uF02C': ',',
    '\uF02D': '-',
    '\uF02E': '.',
    '\uF02F': '/',
    '\uF030': '0', '\uF031': '1', '\uF032': '2', '\uF033': '3', '\uF034': '4',
    '\uF035': '5', '\uF036': '6', '\uF037': '7', '\uF038': '8', '\uF039': '9',
    '\uF0A8': '₹',
    '\uF0B9': '₹',
    '\uF0B7': '•',
    '\uF0B0': '°',
    '\uF06C': '●',
    '\uF0D8': '▲',
    '\uF0E8': '►',
}


_RUPEE_FONT_FIXUP = {
    '`': '₹',   # Backtick glyph in RupeeForadian/Rupee fonts is the ₹ symbol
    '~': '₹',
}


def _normalize_text(text, font_name=''):
    """Fix PUA codepoints from embedded fonts and normalize Unicode."""
    if not text:
        return text
    fn = font_name.lower()
    # Fonts like "RupeeForadian" or "Rupee" use ASCII glyphs for ₹
    use_rupee = 'rupee' in fn
    result = []
    for ch in text:
        if use_rupee:
            ch = _RUPEE_FONT_FIXUP.get(ch, ch)
        result.append(_PUA_FIXUP.get(ch, ch))
    return unicodedata.normalize('NFC', ''.join(result))


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


def _dominant_font_size(spans):
    """Return the most common font size across spans (by total text length)."""
    size_len = {}
    for s in spans:
        size_len[s['size']] = size_len.get(s['size'], 0) + len(s['text'])
    return max(size_len, key=size_len.get) if size_len else 0


def _should_merge_lines(prev_line, curr_line, prev_spans, curr_spans):
    """Decide if two consecutive lines within a PyMuPDF block should be merged
    into one paragraph block.

    Merge when:
      - Dominant font size matches (within 0.5pt tolerance)
      - Vertical gap between lines is ≤ 1.5× the font size (normal line spacing)
      - Both lines have reasonable width (not short labels)
    Keep separate for short isolated labels (riskometer text, headings, etc.).
    """
    prev_size = _dominant_font_size(prev_spans)
    curr_size = _dominant_font_size(curr_spans)

    # Font sizes must be close
    if abs(prev_size - curr_size) > 0.5:
        return False

    # Vertical gap: distance from bottom of previous line to top of current
    gap = curr_line['bbox'][1] - prev_line['bbox'][3]
    font_size = max(prev_size, curr_size, 1)

    # Normal line spacing is roughly 1.0-1.5× the font size
    # Allow up to 1.5× font size gap for paragraph continuations
    if gap > font_size * 1.5 or gap < -font_size * 0.5:
        return False

    # Both lines should have some minimum width to be considered paragraph text
    # Short labels (< 40pt wide) stay as individual blocks
    MIN_WIDTH = 40
    prev_width = prev_line['bbox'][2] - prev_line['bbox'][0]
    curr_width = curr_line['bbox'][2] - curr_line['bbox'][0]
    if prev_width < MIN_WIDTH and curr_width < MIN_WIDTH:
        return False

    return True


def _extract_text_formatting(pdf_path):
    """Extract text with smart grouping — paragraphs stay together, labels stay separate.

    Lines within a PyMuPDF block that share font size and normal line spacing
    are merged into a single paragraph block. Short labels, headings, and
    lines with different formatting remain as individual blocks.
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

            # First pass: build processed lines with their spans
            processed_lines = []
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
                    is_superscript = bool(flags & (1 << 0))
                    spans.append({
                        'text': _normalize_text(span['text'], span['font']),
                        'font': map_font(span['font']),
                        'size': round(span['size'], 2),
                        'color': color_hex(span['color']),
                        'bold': is_bold,
                        'italic': is_italic,
                        'superscript': is_superscript,
                        'bbox': [round(v, 2) for v in span['bbox']],
                    })
                if spans:
                    processed_lines.append({
                        'spans': spans,
                        'raw_line': line,
                    })

            if not processed_lines:
                continue

            # Second pass: group consecutive lines into paragraph blocks
            groups = [[processed_lines[0]]]
            for i in range(1, len(processed_lines)):
                prev = groups[-1][-1]
                curr = processed_lines[i]
                if _should_merge_lines(prev['raw_line'], curr['raw_line'],
                                       prev['spans'], curr['spans']):
                    groups[-1].append(curr)
                else:
                    groups.append([curr])

            # Emit one block per group
            for group in groups:
                # Auto-shrink: if rendered width with the fallback font exceeds
                # the PDF-measured line bbox, scale down all spans uniformly.
                # Uniform across the block keeps multi-line headings consistent.
                worst_ratio = 1.0
                for pl in group:
                    line_bbox = pl['raw_line']['bbox']
                    line_w = line_bbox[2] - line_bbox[0]
                    if line_w <= 0:
                        continue
                    rendered = sum(
                        _measure_text_width(s['text'], s['font'], s['size'],
                                            s.get('bold'), s.get('italic'))
                        for s in pl['spans']
                    )
                    if rendered > line_w * 1.02:
                        worst_ratio = min(worst_ratio, line_w / rendered)
                if worst_ratio < 1.0:
                    scale = max(0.85, worst_ratio)
                    for pl in group:
                        for s in pl['spans']:
                            s['size'] = round(s['size'] * scale, 2)

                lines_out = []
                bbox_x0 = min(pl['raw_line']['bbox'][0] for pl in group)
                bbox_y0 = min(pl['raw_line']['bbox'][1] for pl in group)
                bbox_x1 = max(pl['raw_line']['bbox'][2] for pl in group)
                bbox_y1 = max(pl['raw_line']['bbox'][3] for pl in group)

                for pl in group:
                    lines_out.append({
                        'spans': pl['spans'],
                        'bbox': [round(v, 2) for v in pl['raw_line']['bbox']],
                    })

                blocks.append({
                    'bbox': [round(bbox_x0, 2), round(bbox_y0, 2),
                             round(bbox_x1, 2), round(bbox_y1, 2)],
                    'lines': lines_out,
                })

        pages_text.append(blocks)

    doc.close()
    return pages_text


# ── TABLE PARSING ────────────────────────────────────────────────────────

def _parse_adobe_tables(adobe_data, page_heights):
    """Parse Adobe structured data to extract table structures.

    Splits multi-page tables into per-page segments so each page gets only
    the rows that belong to it.

    Returns dict: page_index -> list of table dicts, each with:
      - bbox: [left, top, right, bottom] in top-left origin
      - rows: list of row dicts, each with cells containing text, bbox, and col_span
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
        base_page = table_el.get('Page', 0)
        attrs = table_el.get('attributes', {})
        num_cols = attrs.get('NumCol', 0)

        # Collect child elements belonging to this table
        child_prefix = table_path + '/'
        child_elements = [
            e for e in elements
            if e.get('Path', '').startswith(child_prefix)
        ]

        # Parse all cells, tracking which page each belongs to.
        # Key: (page, row_idx) -> {col_idx -> cell_data}
        page_rows_dict = {}

        # Key cells by their parent TD/TH path so siblings (P, Span children)
        # accumulate into the SAME cell, but distinct TD/TH siblings stay
        # separate even when they lack an explicit [N] index in the path.
        for el in child_elements:
            path = el.get('Path', '')
            rel_path = path[len(table_path):]
            el_page = el.get('Page', base_page)
            page_h = page_heights.get(el_page, 841.92)

            # Extract row index from TR or TR[n]
            tr_match = re.match(r'/TR(?:\[(\d+)\])?/', rel_path)
            if not tr_match:
                continue
            row_idx = int(tr_match.group(1)) if tr_match.group(1) else 1

            # Capture the parent TD/TH (this is the unique cell key).
            cell_match = re.match(
                r'/TR(?:\[\d+\])?/(T[DH](?:\[\d+\])?)', rel_path
            )
            if not cell_match:
                continue
            cell_tag = cell_match.group(1)  # e.g. 'TH', 'TD', 'TD[2]'
            is_header = cell_tag.startswith('TH')

            key = (el_page, row_idx)
            if key not in page_rows_dict:
                page_rows_dict[key] = {}
            if cell_tag not in page_rows_dict[key]:
                page_rows_dict[key][cell_tag] = {
                    'text': '',
                    'bbox': [0, 0, 0, 0],
                    'is_header': is_header,
                }
            cell = page_rows_dict[key][cell_tag]

            # If this element IS the TD/TH container, record its bbox.
            is_container = re.fullmatch(
                r'/TR(?:\[\d+\])?/T[DH](?:\[\d+\])?', rel_path
            ) is not None
            cell_bbox_bl = el.get('attributes', {}).get('BBox', [])
            if is_container and cell_bbox_bl and len(cell_bbox_bl) >= 4:
                cell['bbox'] = [
                    round(cell_bbox_bl[0], 2),
                    round(page_h - cell_bbox_bl[3], 2),
                    round(cell_bbox_bl[2], 2),
                    round(page_h - cell_bbox_bl[1], 2),
                ]

            text = _normalize_text(el.get('Text', '').strip())
            if text:
                if cell['text']:
                    cell['text'] += ' ' + text
                else:
                    cell['text'] = text

        # Group rows by page
        pages_in_table = sorted(set(pg for pg, _ in page_rows_dict.keys()))

        for pg in pages_in_table:
            page_h = page_heights.get(pg, 841.92)

            # Collect rows for this page
            rows_dict = {}
            for (p, ri), cols in page_rows_dict.items():
                if p == pg:
                    rows_dict[ri] = cols

            if not rows_dict:
                continue

            # Cluster column edges across every cell on this page
            raw_edges = []
            for cells_dict in rows_dict.values():
                for cell in cells_dict.values():
                    bbox = cell.get('bbox', [0, 0, 0, 0])
                    if bbox[2] > bbox[0]:
                        raw_edges.append(round(bbox[0], 1))
                        raw_edges.append(round(bbox[2], 1))
            raw_edges = sorted(set(raw_edges))

            EDGE_TOL = 3.0
            col_edges = []
            for e in raw_edges:
                if col_edges and abs(e - col_edges[-1]) < EDGE_TOL:
                    col_edges[-1] = (col_edges[-1] + e) / 2
                else:
                    col_edges.append(e)

            # Build rows: cells in left-to-right order by bbox x0, with col_span
            rows = []
            for ri in sorted(rows_dict.keys()):
                row_cells = sorted(
                    rows_dict[ri].values(),
                    key=lambda c: c.get('bbox', [0])[0],
                )
                cells = []
                for cell in row_cells:
                    cell = dict(cell)
                    bbox = cell.get('bbox', [0, 0, 0, 0])
                    if bbox[2] > bbox[0] and len(col_edges) > 1:
                        cell_left = round(bbox[0], 1)
                        cell_right = round(bbox[2], 1)
                        spans = 0
                        for j in range(len(col_edges) - 1):
                            mid = (col_edges[j] + col_edges[j + 1]) / 2
                            if cell_left - EDGE_TOL <= mid <= cell_right + EDGE_TOL:
                                spans += 1
                        cell['col_span'] = max(1, spans)
                    else:
                        cell['col_span'] = 1
                    cells.append(cell)
                rows.append({'cells': cells})

            max_col = max((len(r['cells']) for r in rows), default=num_cols)

            # Compute bbox from cells on this page only
            all_min_x = all_min_y = 99999
            all_max_x = all_max_y = 0
            for row in rows:
                for cell in row['cells']:
                    cb = cell.get('bbox', [0, 0, 0, 0])
                    if cb[2] > cb[0]:
                        all_min_x = min(all_min_x, cb[0])
                        all_min_y = min(all_min_y, cb[1])
                        all_max_x = max(all_max_x, cb[2])
                        all_max_y = max(all_max_y, cb[3])

            if all_max_x <= all_min_x:
                continue

            table_bbox = [
                round(all_min_x, 2), round(all_min_y, 2),
                round(all_max_x, 2), round(all_max_y, 2),
            ]

            table_data = {
                'bbox': table_bbox,
                'rows': rows,
                'num_rows': len(rows),
                'num_cols': max_col,
            }

            if pg not in tables_by_page:
                tables_by_page[pg] = []
            tables_by_page[pg].append(table_data)

    # Remove duplicate/overlapping tables on the same page.
    # When a multi-page table continuation overlaps with a standalone table,
    # keep the standalone (usually more accurate) and drop the overlap.
    for pg in list(tables_by_page.keys()):
        tables = tables_by_page[pg]
        if len(tables) <= 1:
            continue
        # Sort by area (smaller first) — standalone tables are usually smaller
        tables.sort(key=lambda t: (t['bbox'][2]-t['bbox'][0]) * (t['bbox'][3]-t['bbox'][1]))
        kept = []
        for t in tables:
            tb = t['bbox']
            # Check if this table's bbox is mostly covered by a kept table
            overlaps = False
            for k in kept:
                kb = k['bbox']
                # Check if t's center falls inside k
                tcx = (tb[0] + tb[2]) / 2
                tcy = (tb[1] + tb[3]) / 2
                if kb[0] - 5 <= tcx <= kb[2] + 5 and kb[1] - 5 <= tcy <= kb[3] + 5:
                    overlaps = True
                    break
                # Check if k's center falls inside t
                kcx = (kb[0] + kb[2]) / 2
                kcy = (kb[1] + kb[3]) / 2
                if tb[0] - 5 <= kcx <= tb[2] + 5 and tb[1] - 5 <= kcy <= tb[3] + 5:
                    overlaps = True
                    break
            if not overlaps:
                kept.append(t)
        tables_by_page[pg] = kept

    return tables_by_page


def _is_inside_table(block_bbox, table_bboxes, margin=2):
    """Check if a text block overlaps any table region.

    Returns True if the block's center falls inside a table OR if more than
    50% of the block's area overlaps with a table bbox. This catches blocks
    that span cell boundaries or sit near table edges.
    """
    bx0, by0, bx1, by1 = block_bbox
    cx = (bx0 + bx1) / 2
    cy = (by0 + by1) / 2
    block_area = max((bx1 - bx0) * (by1 - by0), 1)

    for tbbox in table_bboxes:
        tx0, ty0, tx1, ty1 = tbbox
        # Center-point check (original)
        if (tx0 - margin <= cx <= tx1 + margin and
                ty0 - margin <= cy <= ty1 + margin):
            return True
        # Overlap-area check: catch blocks near edges
        ox0 = max(bx0, tx0 - margin)
        oy0 = max(by0, ty0 - margin)
        ox1 = min(bx1, tx1 + margin)
        oy1 = min(by1, ty1 + margin)
        if ox1 > ox0 and oy1 > oy0:
            overlap = (ox1 - ox0) * (oy1 - oy0)
            if overlap / block_area > 0.5:
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
