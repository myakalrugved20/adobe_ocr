"""
Translation service.
Translates text strings using Google Translate via deep-translator.
"""

import os
import re
import json
import time
import copy
from concurrent.futures import ThreadPoolExecutor, as_completed
from deep_translator import GoogleTranslator


def _translate_one(text, src, dest, index):
    """Translate a single text string with retries. Returns (index, result)."""
    translator = GoogleTranslator(source=src, target=dest)
    for attempt in range(3):
        try:
            translated = translator.translate(text)
            return (index, translated if translated else text)
        except Exception as e:
            if attempt < 2:
                time.sleep(1 * (attempt + 1))
            else:
                print(f"    [!] Failed: '{text[:40]}': {e}")
                return (index, text)


def translate_texts(texts, src='auto', dest='hi', max_workers=10,
                    on_progress=None):
    """Translate a list of text strings using parallel workers.

    Args:
        texts: list of strings to translate
        src: source language code
        dest: target language code
        max_workers: number of parallel translation threads
        on_progress: optional callback(done, total) for progress updates

    Returns:
        list of translated strings (same length as input)
    """
    total = len(texts)
    results = [None] * total

    # Separate translatable vs skip items
    to_translate = []
    for i, text in enumerate(texts):
        if not text or not text.strip():
            results[i] = text
            continue
        if re.match(r'^[\d\s\W]+$', text) and not re.search(r'[a-zA-Z]', text):
            results[i] = text
            continue
        to_translate.append((i, text))

    print(f"    Skipped {total - len(to_translate)}, translating {len(to_translate)} items with {max_workers} workers...")

    done_count = 0
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(_translate_one, text, src, dest, idx): idx
            for idx, text in to_translate
        }
        for future in as_completed(futures):
            idx, translated = future.result()
            results[idx] = translated
            done_count += 1
            if on_progress and done_count % 50 == 0:
                on_progress(done_count, len(to_translate))

    if on_progress:
        on_progress(len(to_translate), len(to_translate))

    return results


# ── ADOBE PARAGRAPH GROUPING ─────────────────────────────────────────────

# Adobe element types that carry translatable paragraph-level text
_PARA_TYPES = re.compile(
    r'/(P|H[1-6]|LBody|Title|Lbl)(\[\d+\])?$'
)


def _load_adobe_paragraphs(project_dir, page_heights):
    """Load structuredData.json and extract paragraph-level text elements.

    Returns a dict:  page_index -> list of {text, bbox_tl, path}
    where bbox_tl is [x0, y0, x1, y1] in top-left origin.
    """
    sd_path = os.path.join(project_dir, "structuredData.json")
    if not os.path.exists(sd_path):
        return None

    with open(sd_path, 'r', encoding='utf-8') as f:
        sd = json.load(f)

    paragraphs_by_page = {}
    for el in sd.get('elements', []):
        path = el.get('Path', '')
        text = el.get('Text', '')
        if not text or not text.strip():
            continue
        if not _PARA_TYPES.search(path):
            continue

        page = el.get('Page', 0)
        page_h = page_heights.get(page, 841.92)

        # Adobe Bounds: [x0_bl, y0_bl, x1_bl, y1_bl] in bottom-left origin
        bounds = el.get('Bounds') or el.get('attributes', {}).get('BBox', [])
        if not bounds or len(bounds) < 4:
            continue

        # Convert to top-left origin: y_tl = page_height - y_bl
        bbox_tl = [
            bounds[0],               # x0
            page_h - bounds[3],      # y0 (top)
            bounds[2],               # x1
            page_h - bounds[1],      # y1 (bottom)
        ]

        if page not in paragraphs_by_page:
            paragraphs_by_page[page] = []
        paragraphs_by_page[page].append({
            'text': text.strip(),
            'bbox': bbox_tl,
            'path': path,
        })

    return paragraphs_by_page


def _overlap_area(bb, pb, margin=2):
    """Compute overlap area between a block bbox and a paragraph bbox."""
    x_overlap = max(0, min(bb[2], pb[2] + margin) - max(bb[0], pb[0] - margin))
    y_overlap = max(0, min(bb[3], pb[3] + margin) - max(bb[1], pb[1] - margin))
    return x_overlap * y_overlap


def _match_blocks_to_paragraphs(blocks, adobe_paras, margin=2):
    """Match PyMuPDF blocks to Adobe paragraphs by best spatial overlap.

    For each block, find the Adobe paragraph whose bbox has the largest
    overlap area with the block. This avoids mis-assignment when paragraphs
    are stacked tightly and margins cause ambiguity.

    Returns a dict: adobe_para_index -> list of block indices.
    Blocks that don't match any paragraph get their own singleton group.
    """
    para_groups = {}   # para_idx -> [block_idx, ...]
    matched_blocks = set()

    for bi, block in enumerate(blocks):
        bb = block['bbox']  # [x0, y0, x1, y1] top-left origin

        best_pi = -1
        best_overlap = 0

        for pi, para in enumerate(adobe_paras):
            pb = para['bbox']
            overlap = _overlap_area(bb, pb, margin)
            if overlap > best_overlap:
                best_overlap = overlap
                best_pi = pi

        if best_pi >= 0 and best_overlap > 0:
            if best_pi not in para_groups:
                para_groups[best_pi] = []
            para_groups[best_pi].append(bi)
            matched_blocks.add(bi)

    # Unmatched blocks become their own groups
    ungrouped = []
    for bi in range(len(blocks)):
        if bi not in matched_blocks:
            ungrouped.append((-bi - 1, [bi]))

    return para_groups, ungrouped


def _block_format_key(block):
    """Return a hashable key representing a block's dominant formatting.

    Uses the first span's visual properties (color, bold, font, size).
    Blocks with the same key are visually identical and safe to merge.
    """
    for line in block.get('lines', []):
        for span in line.get('spans', []):
            if span.get('text', '').strip():
                return (
                    span.get('color', '000000'),
                    span.get('bold', False),
                    span.get('font', 'Arial'),
                    round(span.get('size', 11)),
                )
    return ('000000', False, 'Arial', 11)


def _split_by_formatting(blocks, block_indices):
    """Split block indices into sub-groups of consecutive same-formatting blocks.

    Returns list of lists of block indices. Each sub-group shares the same
    visual formatting and can be safely merged for translation.
    """
    if not block_indices:
        return []

    sub_groups = []
    current_group = [block_indices[0]]
    current_key = _block_format_key(blocks[block_indices[0]])

    for bi in block_indices[1:]:
        key = _block_format_key(blocks[bi])
        if key == current_key:
            current_group.append(bi)
        else:
            sub_groups.append(current_group)
            current_group = [bi]
            current_key = key

    sub_groups.append(current_group)
    return sub_groups


def _redistribute_text(translated_text, block_char_counts):
    """Split translated text across blocks proportionally by original char counts.

    Splits at word boundaries so no word is broken mid-block.
    Each block gets a portion proportional to its original character count.

    Args:
        translated_text: the full translated string for the paragraph group
        block_char_counts: list of int, original character count per block

    Returns:
        list of strings, one per block
    """
    n = len(block_char_counts)
    if n <= 1:
        return [translated_text]

    total_orig = sum(block_char_counts)
    if total_orig == 0:
        total_orig = n
        block_char_counts = [1] * n

    words = translated_text.split()
    if not words:
        return [''] * n

    # Fewer words than blocks: one word per block from the start
    if len(words) <= n:
        result = [''] * n
        for i, w in enumerate(words):
            result[i] = w
        return result

    # Compute cumulative character thresholds
    cum_targets = []
    running = 0
    for count in block_char_counts:
        running += count
        cum_targets.append(running / total_orig)

    # Distribute words into blocks proportionally
    result_parts = [[] for _ in range(n)]
    total_chars = sum(len(w) for w in words)
    char_acc = 0
    block_idx = 0

    for word in words:
        result_parts[block_idx].append(word)
        char_acc += len(word)
        # Move to next block when we pass the threshold (never past last block)
        if block_idx < n - 1 and char_acc / total_chars >= cum_targets[block_idx]:
            block_idx += 1

    return [' '.join(parts) for parts in result_parts]


def translate_project_data(project_data, src_lang='auto', dest_lang='hi',
                           paragraph_mode=False, project_dir=None,
                           on_progress=None):
    """Translate all text in a project data structure.

    Automatically uses Adobe's structuredData.json (when available) to group
    multi-line text blocks into full paragraphs before translation. This
    preserves sentence meaning across line breaks.

    Falls back to per-span translation if structuredData.json is not found.

    Returns a deep copy with translated text (positions unchanged).
    """
    translated_data = copy.deepcopy(project_data)

    # Always try to load Adobe paragraph groupings when project_dir is available
    adobe_paras_by_page = None
    if project_dir:
        page_heights = {
            p['page']: p['height']
            for p in translated_data['pages']
        }
        adobe_paras_by_page = _load_adobe_paragraphs(project_dir, page_heights)
        if adobe_paras_by_page:
            print("  [*] Using Adobe paragraph grouping for translation")
        else:
            print("  [!] structuredData.json not found, falling back to per-span translation")

    # Collect all text strings with references back to their spans
    all_texts = []
    span_refs = []  # (type, ref_data)

    for pi, page in enumerate(translated_data['pages']):
        blocks = page['blocks']

        if adobe_paras_by_page is not None:
            # ── Adobe-guided paragraph grouping ──
            adobe_paras = adobe_paras_by_page.get(pi, [])

            if adobe_paras:
                para_groups, ungrouped = _match_blocks_to_paragraphs(
                    blocks, adobe_paras
                )

                # Grouped blocks: sub-group by formatting, then translate
                # each formatting run together. This preserves per-block
                # formatting (color, bold, font) while still merging
                # same-formatted consecutive lines for better translation.
                for para_idx, block_indices in para_groups.items():
                    sub_groups = _split_by_formatting(blocks, block_indices)

                    for sg_indices in sub_groups:
                        sg_text = ' '.join(
                            span['text']
                            for bi in sg_indices
                            for line in blocks[bi]['lines']
                            for span in line['spans']
                            if span['text'].strip()
                        )
                        all_texts.append(sg_text)

                        block_ref_groups = []
                        block_char_counts = []
                        for bi in sg_indices:
                            block_refs = []
                            block_chars = 0
                            for li, line in enumerate(blocks[bi]['lines']):
                                for si, span in enumerate(line['spans']):
                                    block_refs.append((pi, bi, li, si))
                                    block_chars += len(span['text'])
                            block_ref_groups.append(block_refs)
                            block_char_counts.append(block_chars)
                        span_refs.append(('paragraph', block_ref_groups, block_char_counts))

                # Ungrouped blocks: translate per-block
                for _, block_indices in ungrouped:
                    for bi in block_indices:
                        para_text = ' '.join(
                            span['text']
                            for line in blocks[bi]['lines']
                            for span in line['spans']
                        )
                        all_texts.append(para_text)
                        block_refs = []
                        block_chars = 0
                        for li, line in enumerate(blocks[bi]['lines']):
                            for si, span in enumerate(line['spans']):
                                block_refs.append((pi, bi, li, si))
                                block_chars += len(span['text'])
                        span_refs.append(('paragraph', [block_refs], [block_chars]))
            else:
                # No Adobe paragraphs for this page, fall back to per-span
                for bi, block in enumerate(blocks):
                    for li, line in enumerate(block['lines']):
                        for si, span in enumerate(line['spans']):
                            all_texts.append(span['text'])
                            span_refs.append(('run', (pi, bi, li, si)))

        else:
            # ── Per-span mode (no Adobe data available) ──
            for bi, block in enumerate(blocks):
                for li, line in enumerate(block['lines']):
                    for si, span in enumerate(line['spans']):
                        all_texts.append(span['text'])
                        span_refs.append(('run', (pi, bi, li, si)))

        # Collect table cell text (always per-cell)
        for ti, table in enumerate(page.get('tables', [])):
            for ri, row in enumerate(table.get('rows', [])):
                for ci, cell in enumerate(row.get('cells', [])):
                    all_texts.append(cell.get('text', ''))
                    span_refs.append(('table_cell', (pi, ti, ri, ci)))

    print(f"  [+] Translating {len(all_texts)} text items...")
    translated_texts = translate_texts(
        all_texts, src=src_lang, dest=dest_lang, on_progress=on_progress
    )

    # Write translations back
    for idx, entry in enumerate(span_refs):
        mode = entry[0]
        if mode == 'run':
            _, ref = entry
            pi, bi, li, si = ref
            translated_data['pages'][pi]['blocks'][bi]['lines'][li]['spans'][si]['text'] = translated_texts[idx]
        elif mode == 'paragraph':
            _, block_ref_groups, block_char_counts = entry
            # Redistribute translated text proportionally across blocks
            redistributed = _redistribute_text(translated_texts[idx], block_char_counts)
            for group_idx, block_refs in enumerate(block_ref_groups):
                block_text = redistributed[group_idx] if group_idx < len(redistributed) else ''
                if block_refs:
                    # Put this block's portion in its first span
                    pi, bi, li, si = block_refs[0]
                    translated_data['pages'][pi]['blocks'][bi]['lines'][li]['spans'][si]['text'] = block_text
                    # Clear remaining spans in this block
                    for pi2, bi2, li2, si2 in block_refs[1:]:
                        translated_data['pages'][pi2]['blocks'][bi2]['lines'][li2]['spans'][si2]['text'] = ''
        elif mode == 'table_cell':
            _, ref = entry
            pi, ti, ri, ci = ref
            translated_data['pages'][pi]['tables'][ti]['rows'][ri]['cells'][ci]['text'] = translated_texts[idx]

    return translated_data


def translate_block_group(project_data, page_idx, block_ids, src_lang='auto',
                          dest_lang='hi'):
    """Translate a group of blocks as one unit, merging them into a single block.

    Concatenates all text from selected blocks, translates as one string,
    and replaces the selected blocks with a single merged block whose bbox
    covers the union of all selected blocks. Uses the first block's formatting.

    Returns updated project_data (mutated copy).
    """
    result = copy.deepcopy(project_data)
    page = result['pages'][page_idx]
    blocks = page['blocks']

    # Find target blocks by ID, preserving order
    target_blocks = []
    block_id_set = set(block_ids)
    for block in blocks:
        if block['id'] in block_id_set:
            target_blocks.append(block)

    if not target_blocks:
        return result

    # Concatenate all text
    full_text = ' '.join(
        span['text']
        for block in target_blocks
        for line in block['lines']
        for span in line['spans']
        if span.get('text', '').strip()
    )

    # Compute union bbox
    min_x = min(b['bbox'][0] for b in target_blocks)
    min_y = min(b['bbox'][1] for b in target_blocks)
    max_x = max(b['bbox'][2] for b in target_blocks)
    max_y = max(b['bbox'][3] for b in target_blocks)

    # Get formatting from first non-empty span
    fmt = {
        'font': 'Arial', 'size': 11, 'color': '000000',
        'bold': False, 'italic': False,
    }
    for block in target_blocks:
        for line in block['lines']:
            for span in line['spans']:
                if span.get('text', '').strip():
                    fmt = {
                        'font': span.get('font', 'Arial'),
                        'size': span.get('size', 11),
                        'color': span.get('color', '000000'),
                        'bold': span.get('bold', False),
                        'italic': span.get('italic', False),
                    }
                    break
            else:
                continue
            break
        else:
            continue
        break

    print(f"  [+] Group translate: merging {len(target_blocks)} blocks into 1")
    translated_texts = translate_texts([full_text], src=src_lang, dest=dest_lang)
    translated = translated_texts[0] if translated_texts[0] else full_text

    # Build merged block
    merged_block = {
        'id': f"grp_{target_blocks[0]['id']}",
        'bbox': [round(min_x, 2), round(min_y, 2), round(max_x, 2), round(max_y, 2)],
        'lines': [{
            'spans': [{
                'text': translated,
                'bbox': [round(min_x, 2), round(min_y, 2), round(max_x, 2), round(max_y, 2)],
                **fmt,
            }],
            'bbox': [round(min_x, 2), round(min_y, 2), round(max_x, 2), round(max_y, 2)],
        }],
    }

    # Replace selected blocks with merged block:
    # Remove all selected blocks, insert merged block at first selected's position
    new_blocks = []
    inserted = False
    for block in blocks:
        if block['id'] in block_id_set:
            if not inserted:
                new_blocks.append(merged_block)
                inserted = True
            # Skip original block
        else:
            new_blocks.append(block)

    page['blocks'] = new_blocks
    return result
