"""
Word Document Translator
========================
Translates a Word document (.docx) using Google Translate while preserving
all formatting, layout, images, VML textboxes, and styles.

Usage:
    python translate_word.py input.docx -t hi           # Translate to Hindi
    python translate_word.py input.docx -t mr -o out.docx  # Translate to Marathi
    python translate_word.py input.docx -t hi --paragraph  # Paragraph-level (better quality)
"""

import argparse
import sys
import time
import copy
import re
from lxml import etree
from docx import Document
from docx.oxml.ns import qn

try:
    from deep_translator import GoogleTranslator
except ImportError:
    print("ERROR: deep-translator is required. Install with:")
    print("  pip install deep-translator")
    sys.exit(1)


# ── TRANSLATION ENGINE ────────────────────────────────────────────────────

def translate_texts(texts, src='auto', dest='hi', batch_size=25):
    """Translate a list of texts via Google Translate, with batching and retries."""
    translator = GoogleTranslator(source=src, target=dest)
    results = []
    total = len(texts)

    for i in range(0, total, batch_size):
        batch = texts[i:i + batch_size]
        print(f"  Translating batch {i // batch_size + 1}"
              f"/{(total + batch_size - 1) // batch_size}"
              f" ({len(batch)} items)...")

        for text in batch:
            if not text or not text.strip():
                results.append(text)
                continue
            # Skip if text is only numbers, punctuation, or whitespace
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
                        print(f"    [!] Failed: '{text[:40]}...' -> {e}")
                        results.append(text)

            time.sleep(0.05)  # light rate-limit

    return results


# ── COLLECT TEXT ELEMENTS ─────────────────────────────────────────────────

def collect_wt_elements(body):
    """Find all <w:t> elements in the document body (includes VML textboxes)."""
    return list(body.iter(qn('w:t')))


def get_paragraph_groups(body):
    """Group <w:t> elements by their parent <w:p> for paragraph-level translation.

    Returns list of (paragraph_text, [(w:t element, original_text), ...]).
    """
    ns = qn('w:t')
    ns_p = qn('w:p')

    groups = []
    for p_elem in body.iter(ns_p):
        t_elems = list(p_elem.iter(ns))
        if not t_elems:
            continue
        pairs = [(t, t.text) for t in t_elems if t.text]
        if pairs:
            full_text = ' '.join(t.text for t, _ in pairs)
            groups.append((full_text, pairs))
    return groups


# ── TRANSLATION STRATEGIES ────────────────────────────────────────────────

def translate_per_run(body, src, dest):
    """Translate each <w:t> element individually. Preserves layout perfectly."""
    t_elements = collect_wt_elements(body)
    texts = [t.text for t in t_elements if t.text]
    print(f"  [+] Found {len(texts)} text runs to translate")

    if not texts:
        print("  [!] No text found in document")
        return

    translated = translate_texts(texts, src, dest)

    idx = 0
    for t in t_elements:
        if t.text:
            t.text = translated[idx]
            # Ensure xml:space="preserve" so whitespace isn't collapsed
            t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
            idx += 1


def translate_per_paragraph(body, src, dest):
    """Translate at paragraph level for better quality, then redistribute.

    If a paragraph has one run, it's straightforward.
    If multiple runs, translate the joined text, then assign the full
    translation to the first run and clear the rest.
    """
    groups = get_paragraph_groups(body)
    para_texts = [full for full, _ in groups]
    print(f"  [+] Found {len(para_texts)} paragraphs to translate")

    if not para_texts:
        print("  [!] No text found in document")
        return

    translated = translate_texts(para_texts, src, dest)

    for (_, pairs), trans_text in zip(groups, translated):
        if len(pairs) == 1:
            t_elem, _ = pairs[0]
            t_elem.text = trans_text
            t_elem.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
        else:
            # Put full translation in first run, empty the rest
            for i, (t_elem, _) in enumerate(pairs):
                if i == 0:
                    t_elem.text = trans_text
                    t_elem.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
                else:
                    t_elem.text = ''


# ── MAIN ──────────────────────────────────────────────────────────────────

def translate_document(input_path, output_path, src_lang='auto', dest_lang='hi',
                       paragraph_mode=False):
    """Translate all text in a Word document while preserving layout."""
    print(f"  [*] Loading: {input_path}")
    doc = Document(input_path)
    body = doc.element.body

    if paragraph_mode:
        print("  [*] Mode: paragraph-level (better quality, may shift multi-run formatting)")
        translate_per_paragraph(body, src_lang, dest_lang)
    else:
        print("  [*] Mode: per-run (preserves formatting exactly)")
        translate_per_run(body, src_lang, dest_lang)

    doc.save(output_path)
    print(f"\n  [OK] Saved: {output_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Translate a Word document using Google Translate"
    )
    parser.add_argument("input", help="Input .docx file path")
    parser.add_argument("-o", "--output",
                        help="Output .docx file (default: <input>_translated_<lang>.docx)")
    parser.add_argument("-s", "--source", default="auto",
                        help="Source language code (default: auto-detect)")
    parser.add_argument("-t", "--target", default="hi",
                        help="Target language code (default: hi for Hindi)")
    parser.add_argument("--paragraph", action="store_true",
                        help="Translate at paragraph level (better quality, "
                             "may merge multi-run formatting)")

    args = parser.parse_args()

    if not args.input.endswith('.docx'):
        print("ERROR: Input must be a .docx file")
        sys.exit(1)

    output = args.output or args.input.replace(
        '.docx', f'_translated_{args.target}.docx'
    )

    print("=" * 60)
    print("Word Document Translator")
    print("=" * 60)
    print(f"  Source: {args.source}")
    print(f"  Target: {args.target}")
    print()

    translate_document(args.input, output, args.source, args.target, args.paragraph)
    print("\nDone!")
