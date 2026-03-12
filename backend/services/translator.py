"""
Translation service.
Translates text strings using Google Translate via deep-translator.
"""

import re
import time
import copy
from deep_translator import GoogleTranslator


def translate_texts(texts, src='auto', dest='hi', batch_size=25,
                    on_progress=None):
    """Translate a list of text strings.

    Args:
        texts: list of strings to translate
        src: source language code
        dest: target language code
        batch_size: number of texts per batch
        on_progress: optional callback(done, total) for progress updates

    Returns:
        list of translated strings (same length as input)
    """
    translator = GoogleTranslator(source=src, target=dest)
    results = []
    total = len(texts)

    for i in range(0, total, batch_size):
        batch = texts[i:i + batch_size]

        for text in batch:
            if not text or not text.strip():
                results.append(text)
                continue
            # Skip pure numbers/punctuation
            if re.match(r'^[\d\s\W]+$', text) and not re.search(r'[a-zA-Z]', text):
                results.append(text)
                continue

            for attempt in range(3):
                try:
                    translated = translator.translate(text)
                    results.append(translated if translated else text)
                    break
                except Exception as e:
                    if attempt < 2:
                        time.sleep(1 * (attempt + 1))
                    else:
                        print(f"    [!] Failed: '{text[:40]}': {e}")
                        results.append(text)

            time.sleep(0.05)

        if on_progress:
            on_progress(min(i + batch_size, total), total)

    return results


def translate_project_data(project_data, src_lang='auto', dest_lang='hi',
                           paragraph_mode=False, on_progress=None):
    """Translate all text in a project data structure.

    Returns a deep copy with translated text (positions unchanged).
    """
    translated_data = copy.deepcopy(project_data)

    # Collect all text strings with references back to their spans
    all_texts = []
    span_refs = []  # (type, ref_data)

    for pi, page in enumerate(translated_data['pages']):
        for bi, block in enumerate(page['blocks']):
            if paragraph_mode:
                # Collect full paragraph text
                para_text = ' '.join(
                    span['text']
                    for line in block['lines']
                    for span in line['spans']
                )
                all_texts.append(para_text)
                # Store refs to all spans in this block
                refs = []
                for li, line in enumerate(block['lines']):
                    for si, span in enumerate(line['spans']):
                        refs.append((pi, bi, li, si))
                span_refs.append(('paragraph', refs))
            else:
                for li, line in enumerate(block['lines']):
                    for si, span in enumerate(line['spans']):
                        all_texts.append(span['text'])
                        span_refs.append(('run', (pi, bi, li, si)))

        # Collect table cell text
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
    for idx, (mode, ref) in enumerate(span_refs):
        if mode == 'run':
            pi, bi, li, si = ref
            translated_data['pages'][pi]['blocks'][bi]['lines'][li]['spans'][si]['text'] = translated_texts[idx]
        elif mode == 'paragraph':
            # Put full translation in first span, clear rest
            refs = ref
            if refs:
                first = refs[0]
                pi, bi, li, si = first
                translated_data['pages'][pi]['blocks'][bi]['lines'][li]['spans'][si]['text'] = translated_texts[idx]
                for pi2, bi2, li2, si2 in refs[1:]:
                    translated_data['pages'][pi2]['blocks'][bi2]['lines'][li2]['spans'][si2]['text'] = ''
        elif mode == 'table_cell':
            pi, ti, ri, ci = ref
            translated_data['pages'][pi]['tables'][ti]['rows'][ri]['cells'][ci]['text'] = translated_texts[idx]

    return translated_data
