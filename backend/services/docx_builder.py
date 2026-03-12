"""
Generic Word document builder.
Takes structured page/block/image data and produces a .docx file.
"""

import os
import re
from lxml import etree
from docx import Document
from docx.shared import Pt
from docx.oxml.ns import qn
from backend.config import PT_TO_EMU
from backend.services.pdf_extractor import _is_inside_table

NSMAP = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'v': 'urn:schemas-microsoft-com:vml',
    'w10': 'urn:schemas-microsoft-com:office:word',
}


def _vqn(tag):
    """Resolve namespace-prefixed tag using our NSMAP (supports v: and w10: that python-docx qn() doesn't)."""
    prefix, local = tag.split(':')
    return f'{{{NSMAP[prefix]}}}{local}'

# Regex to strip characters invalid in XML 1.0
_INVALID_XML_RE = re.compile(
    r'[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD\U00010000-\U0010FFFF]'
)


def _safe(text):
    """Ensure text is a string with only XML-valid characters."""
    if not isinstance(text, str):
        text = str(text) if text is not None else ''
    return _INVALID_XML_RE.sub('', text)


def pt_emu(pt):
    return int(pt * PT_TO_EMU)


def set_section(section, width_pt, height_pt, left=28, right=28, top=20, bottom=14):
    section.page_width = pt_emu(width_pt)
    section.page_height = pt_emu(height_pt)
    section.left_margin = pt_emu(left)
    section.right_margin = pt_emu(right)
    section.top_margin = pt_emu(top)
    section.bottom_margin = pt_emu(bottom)
    section.header_distance = 0
    section.footer_distance = 0


def add_floating_image(paragraph, image_path, left_emu, top_emu, width_emu, height_emu,
                       behind=True):
    """Add a floating image anchored at absolute position."""
    run = paragraph.add_run()
    run.add_picture(image_path, width=width_emu, height=height_emu)

    drawing = run._element.findall(qn('w:drawing'))[0]
    inline = drawing.find(qn('wp:inline'))
    graphic = inline.find(qn('a:graphic'))
    extent = inline.find(qn('wp:extent'))
    docPr = inline.find(qn('wp:docPr'))
    cx, cy = extent.get('cx'), extent.get('cy')

    z_index = '0' if behind else '251660288'
    anchor = etree.SubElement(drawing, qn('wp:anchor'), {
        'distT': '0', 'distB': '0', 'distL': '0', 'distR': '0',
        'simplePos': '0', 'relativeHeight': z_index,
        'behindDoc': '1' if behind else '0',
        'locked': '0', 'layoutInCell': '1', 'allowOverlap': '1',
    })
    etree.SubElement(anchor, qn('wp:simplePos'), {'x': '0', 'y': '0'})
    posH = etree.SubElement(anchor, qn('wp:positionH'), {'relativeFrom': 'page'})
    etree.SubElement(posH, qn('wp:posOffset')).text = str(left_emu)
    posV = etree.SubElement(anchor, qn('wp:positionV'), {'relativeFrom': 'page'})
    etree.SubElement(posV, qn('wp:posOffset')).text = str(top_emu)
    etree.SubElement(anchor, qn('wp:extent'), {'cx': cx, 'cy': cy})
    etree.SubElement(anchor, qn('wp:effectExtent'), {'l': '0', 't': '0', 'r': '0', 'b': '0'})
    etree.SubElement(anchor, qn('wp:wrapNone'))
    anchor.append(docPr)
    etree.SubElement(anchor, qn('wp:cNvGraphicFramePr'))
    anchor.append(graphic)
    drawing.remove(inline)


def _build_run_element(span, parent):
    """Build a <w:r> element for a single span, appended to parent."""
    r_el = etree.SubElement(parent, qn('w:r'))
    rPr = etree.SubElement(r_el, qn('w:rPr'))

    font = _safe(span.get('font', 'Arial'))
    r_fonts = etree.SubElement(rPr, qn('w:rFonts'))
    r_fonts.set(qn('w:ascii'), font)
    r_fonts.set(qn('w:hAnsi'), font)
    r_fonts.set(qn('w:cs'), font)

    sz_val = str(int(span['size'] * 2))
    etree.SubElement(rPr, qn('w:sz')).set(qn('w:val'), sz_val)
    etree.SubElement(rPr, qn('w:szCs')).set(qn('w:val'), sz_val)

    if span.get('bold'):
        etree.SubElement(rPr, qn('w:b'))
    if span.get('italic'):
        etree.SubElement(rPr, qn('w:i'))

    color_el = etree.SubElement(rPr, qn('w:color'))
    color_el.set(qn('w:val'), _safe(span.get('color', '000000')))

    t_el = etree.SubElement(r_el, qn('w:t'))
    t_el.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    t_el.text = _safe(span.get('text', ''))
    return r_el


def make_vml_textbox_run(lines, left_pt, top_pt, width_pt, height_pt):
    """Build a VML textbox <w:r> element for a single text block."""
    W = NSMAP['w']
    V = NSMAP['v']
    W10 = NSMAP['w10']

    r_root = etree.Element(_vqn('w:r'), nsmap=NSMAP)
    pict = etree.SubElement(r_root, _vqn('w:pict'))

    style = (
        f'position:absolute;'
        f'left:{left_pt:.2f}pt;top:{top_pt:.2f}pt;'
        f'width:{width_pt:.2f}pt;height:{height_pt:.2f}pt;'
        f'z-index:251660288;'
        f'mso-position-horizontal-relative:page;'
        f'mso-position-vertical-relative:page'
    )
    shape = etree.SubElement(pict, _vqn('v:shape'), {
        'style': style, 'filled': 'f', 'stroked': 'f',
    })
    textbox = etree.SubElement(shape, _vqn('v:textbox'), {'inset': '0,0,0,0'})
    txbx = etree.SubElement(textbox, _vqn('w:txbxContent'))

    for line in lines:
        p_el = etree.SubElement(txbx, _vqn('w:p'))
        pPr = etree.SubElement(p_el, _vqn('w:pPr'))
        spacing = etree.SubElement(pPr, _vqn('w:spacing'))
        spacing.set(_vqn('w:after'), '0')
        spacing.set(_vqn('w:before'), '0')
        spacing.set(_vqn('w:line'), '240')
        spacing.set(_vqn('w:lineRule'), 'auto')
        for span in line.get('spans', []):
            _build_run_element(span, p_el)

    etree.SubElement(shape, _vqn('w10:wrap'), {'type': 'none'})
    return r_root


def add_positioned_table(anchor_p, table_data, page_height_pt):
    """Build a native Word table with absolute positioning, inserted after anchor_p.

    Uses tblpPr (table positioning properties) to place the table at the
    exact coordinates from the PDF. Inserts directly into the body XML
    after the anchor paragraph to keep it within the correct section.
    """
    bbox = table_data['bbox']
    rows = table_data['rows']
    if not rows:
        return

    left_pt = bbox[0]
    top_pt = bbox[1]
    table_width_pt = bbox[2] - bbox[0]

    max_cols = max(len(row['cells']) for row in rows)
    if max_cols == 0:
        return

    num_rows = len(rows)

    # Build table XML directly (avoid doc.add_table which appends to body end)
    tbl_el = etree.SubElement(anchor_p._element.getparent(), qn('w:tbl'))
    # Move it right after anchor_p
    anchor_p._element.addnext(tbl_el)

    # Table properties
    tbl_pr = etree.SubElement(tbl_el, qn('w:tblPr'))

    # Absolute positioning
    tblp_pr = etree.SubElement(tbl_pr, qn('w:tblpPr'))
    tblp_pr.set(qn('w:vertAnchor'), 'page')
    tblp_pr.set(qn('w:horzAnchor'), 'page')
    tblp_pr.set(qn('w:tblpX'), str(int(left_pt * 20)))
    tblp_pr.set(qn('w:tblpY'), str(int(top_pt * 20)))
    tblp_pr.set(qn('w:leftFromText'), '0')
    tblp_pr.set(qn('w:rightFromText'), '0')
    tblp_pr.set(qn('w:topFromText'), '0')
    tblp_pr.set(qn('w:bottomFromText'), '0')

    # Table width
    tbl_w = etree.SubElement(tbl_pr, qn('w:tblW'))
    tbl_w.set(qn('w:w'), str(int(table_width_pt * 20)))
    tbl_w.set(qn('w:type'), 'dxa')

    # Table layout fixed
    tbl_layout = etree.SubElement(tbl_pr, qn('w:tblLayout'))
    tbl_layout.set(qn('w:type'), 'fixed')

    # Borders
    tbl_borders = etree.SubElement(tbl_pr, qn('w:tblBorders'))
    for border_name in ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']:
        border_el = etree.SubElement(tbl_borders, qn(f'w:{border_name}'))
        border_el.set(qn('w:val'), 'single')
        border_el.set(qn('w:sz'), '4')
        border_el.set(qn('w:space'), '0')
        border_el.set(qn('w:color'), '999999')

    # Table grid (column definitions)
    tbl_grid = etree.SubElement(tbl_el, qn('w:tblGrid'))
    col_width_twips = int(table_width_pt * 20 / max_cols)
    for _ in range(max_cols):
        grid_col = etree.SubElement(tbl_grid, qn('w:gridCol'))
        grid_col.set(qn('w:w'), str(col_width_twips))

    # Build rows and cells
    for ri, row in enumerate(rows):
        tr_el = etree.SubElement(tbl_el, qn('w:tr'))
        for ci in range(max_cols):
            tc_el = etree.SubElement(tr_el, qn('w:tc'))

            # Cell properties
            tc_pr = etree.SubElement(tc_el, qn('w:tcPr'))

            # Cell width
            cell = row['cells'][ci] if ci < len(row['cells']) else {'text': '', 'bbox': [], 'is_header': False}
            cell_bbox = cell.get('bbox', [])
            if cell_bbox and len(cell_bbox) >= 4 and cell_bbox[2] > cell_bbox[0]:
                cw = int((cell_bbox[2] - cell_bbox[0]) * 20)
            else:
                cw = col_width_twips
            tc_w = etree.SubElement(tc_pr, qn('w:tcW'))
            tc_w.set(qn('w:w'), str(cw))
            tc_w.set(qn('w:type'), 'dxa')

            # Cell margins
            tc_mar = etree.SubElement(tc_pr, qn('w:tcMar'))
            for side in ['top', 'left', 'bottom', 'right']:
                mar = etree.SubElement(tc_mar, qn(f'w:{side}'))
                mar.set(qn('w:w'), '20')
                mar.set(qn('w:type'), 'dxa')

            # Header shading
            if cell.get('is_header'):
                shading = etree.SubElement(tc_pr, qn('w:shd'))
                shading.set(qn('w:val'), 'clear')
                shading.set(qn('w:color'), 'auto')
                shading.set(qn('w:fill'), 'E8E8E8')

            # Cell paragraph with text
            p_el = etree.SubElement(tc_el, qn('w:p'))
            p_pr = etree.SubElement(p_el, qn('w:pPr'))
            spacing = etree.SubElement(p_pr, qn('w:spacing'))
            spacing.set(qn('w:before'), '10')
            spacing.set(qn('w:after'), '10')
            spacing.set(qn('w:line'), '200')
            spacing.set(qn('w:lineRule'), 'atLeast')

            text = cell.get('text', '')
            if text:
                r_el = etree.SubElement(p_el, qn('w:r'))
                r_pr = etree.SubElement(r_el, qn('w:rPr'))
                sz = etree.SubElement(r_pr, qn('w:sz'))
                sz.set(qn('w:val'), '12')  # 6pt
                sz_cs = etree.SubElement(r_pr, qn('w:szCs'))
                sz_cs.set(qn('w:val'), '12')
                r_fonts = etree.SubElement(r_pr, qn('w:rFonts'))
                r_fonts.set(qn('w:ascii'), 'Arial')
                r_fonts.set(qn('w:hAnsi'), 'Arial')
                r_fonts.set(qn('w:cs'), 'Arial')
                if cell.get('is_header'):
                    etree.SubElement(r_pr, qn('w:b'))
                t_el = etree.SubElement(r_el, qn('w:t'))
                t_el.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
                t_el.text = text


def build_docx(project_data, project_dir, output_path):
    """Build a .docx from structured page/block/image data.

    Args:
        project_data: dict with 'pages' list (each has blocks, images, dimensions)
        project_dir: base directory for resolving asset paths
        output_path: where to save the .docx
    """
    doc = Document()
    pages = project_data['pages']

    for i, page in enumerate(pages):
        if i == 0:
            section = doc.sections[0]
        else:
            section = doc.add_section()

        set_section(section, page['width'], page['height'],
                    left=0, right=0, top=0, bottom=0)

        # Anchor paragraph for floating images
        anchor_p = doc.add_paragraph()
        anchor_p.paragraph_format.space_before = Pt(0)
        anchor_p.paragraph_format.space_after = Pt(0)

        # Place background image (text-stripped render)
        bg_path = os.path.join(project_dir, page['background_image'])
        if os.path.exists(bg_path):
            add_floating_image(
                anchor_p, bg_path,
                pt_emu(0), pt_emu(0),
                pt_emu(page['width']), pt_emu(page['height']),
                behind=True
            )

        # Place extracted images
        for img in page.get('images', []):
            img_path = os.path.join(project_dir, img['path'])
            if not os.path.exists(img_path):
                continue
            bbox = img['bbox']
            add_floating_image(
                anchor_p, img_path,
                pt_emu(bbox[0]), pt_emu(bbox[1]),
                pt_emu(bbox[2] - bbox[0]), pt_emu(bbox[3] - bbox[1]),
                behind=False
            )

        # Place tables as native Word tables with absolute positioning
        page_tables = page.get('tables', [])
        table_bboxes = [t['bbox'] for t in page_tables]
        for table in page_tables:
            add_positioned_table(anchor_p, table, page['height'])

        # Place text blocks as VML textboxes packed into the anchor paragraph
        # (packing into one paragraph prevents overflow onto extra pages)
        for block in page.get('blocks', []):
            bbox = block['bbox']
            if table_bboxes and _is_inside_table(bbox, table_bboxes):
                continue
            vml_run = make_vml_textbox_run(
                block['lines'],
                left_pt=bbox[0], top_pt=bbox[1],
                width_pt=(bbox[2] - bbox[0]) + 5,
                height_pt=(bbox[3] - bbox[1]) * 1.2
            )
            anchor_p._element.append(vml_run)

    doc.save(output_path)
    print(f"  [+] Built: {output_path}")
    return output_path
