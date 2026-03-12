# Changelog

All notable changes to the PDF to Word Translator project.

---

## 2026-03-11

### Fix: Windows asyncio ConnectionResetError
**File:** `backend/main.py`
**Reason:** After every upload request, the server logged `ConnectionResetError: [WinError 10054] An existing connection was forcibly closed by the remote host`. This is a Windows-specific issue with Python's `ProactorEventLoop` where the client disconnects before the server finishes closing the socket.
**What was done:** Attempted to switch from `ProactorEventLoop` to `WindowsSelectorEventLoopPolicy` by adding `asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())` in `main.py`.
**Outcome:** Reverted — the policy change didn't take effect because uvicorn creates its own event loop before importing the FastAPI app. The error is cosmetic and doesn't affect functionality.

---

### Fix: Upload blocking the async event loop
**Files:** `backend/routers/upload.py`, `frontend/src/api/client.ts`
**Reason:** The `/api/upload` endpoint called `pdf_extractor.extract_project()` directly, which is a long-running synchronous function (Adobe API call + PyMuPDF rendering). This blocked the FastAPI async event loop for the entire duration, causing the HTTP connection to time out and reset. The frontend showed "upload failed" even though the extraction was still running.
**What was done:**
- **upload.py**: Wrapped the `extract_project()` call in `asyncio.get_event_loop().run_in_executor(None, ...)` so it runs in a background thread pool without blocking the event loop. The async handler now `await`s the result.
- **client.ts**: Added `timeout: 300000` (5 minutes) to the axios instance so the frontend doesn't abort the request before the Adobe API finishes processing.
**Outcome:** Uploads now complete successfully without connection resets or frontend timeouts.

---

### Feature: Table extraction from Adobe PDF Extract API
**File:** `backend/services/pdf_extractor.py`
**Reason:** The Adobe PDF Extract API was configured to request table extraction (`ExtractElementType.TABLES` and `ExtractRenditionsElementType.TABLES`), and Adobe returned rich table data in `structuredData.json` (226 table elements for the test PDF with 3 tables on page 4). However, the code completely ignored this data:
1. Table files (xlsx, png renditions) in the Adobe zip were not saved — only `figures/` files were extracted
2. Table elements in `structuredData.json` were never parsed
3. All table cell text was treated as individual text blocks by PyMuPDF, losing table structure entirely

**What was done:**
- **Save table files**: Extended `_run_adobe_extract()` to create a `tables/` directory and save table rendition files (xlsx, png) from the Adobe zip alongside figures.
- **New `_parse_adobe_tables()` function**: Parses Adobe structured data to build table structures. Walks all elements with `Table` in their Path, extracts row/column/cell hierarchy from TR/TH/TD paths, collects cell text from P elements, and reads cell bounding boxes from TH/TD attributes. Converts all coordinates from Adobe's bottom-left origin to top-left origin (`y_tl = page_height - y_bl`).
- **New `_is_inside_table()` helper**: Takes a text block's bbox and a list of table bboxes, returns True if the block's center point falls within any table region (with a small margin). Used to identify which PyMuPDF text blocks are table cells.
- **`extract_project()` updated**: Calls `_parse_adobe_tables()` after Adobe extraction, adds `tables` list to each page's data. All text blocks are kept in `blocks` (needed for the frontend editor which has no table UI) — the table-vs-text filtering happens later in the DOCX builder.
**Outcome:** Page data now contains structured table information (rows, cells, text, bboxes, header flags) alongside the existing text blocks.

---

### Feature: Native Word table reconstruction in DOCX
**File:** `backend/services/docx_builder.py`
**Reason:** Previously, all text (including table cells) was rendered as individual VML textboxes in the DOCX. This completely lost table structure — cell values became scattered floating text boxes with no rows, columns, borders, or alignment. Tables looked broken in the downloaded Word file.
**What was done:**
- **New `add_positioned_table()` function**: Builds a native Word table element (`<w:tbl>`) directly in XML and inserts it after the anchor paragraph using `addnext()`. Key details:
  - Uses `tblpPr` (table positioning properties) with `vertAnchor="page"` and `horzAnchor="page"` plus `tblpX`/`tblpY` in twips to position the table at the exact PDF coordinates
  - Sets `tblLayout type="fixed"` for predictable column widths
  - Adds thin grey borders (`sz=4`, color `#999999`) on all sides and between cells
  - Computes cell widths from Adobe bounding boxes when available, falls back to even distribution
  - Header cells get light grey shading (`#E8E8E8`) and bold text
  - Cell text is 6pt Arial with tight margins (20 twips)
- **Why `addnext()` instead of `doc.add_table()`**: python-docx's `doc.add_table()` always appends the table to the END of the document body. In a multi-section (multi-page) document, this places the table in the wrong section, breaking page layout. By using `anchor_p._element.addnext(tbl_el)`, the table is inserted directly after the page's anchor paragraph, keeping it within the correct section.
- **Table-area text blocks skipped**: When building the DOCX, text blocks whose center falls inside a table region are skipped (using `_is_inside_table()`). They're replaced by the native Word table which has the same text from Adobe's structured data.
**Outcome:** Tables in the DOCX now render as proper Word tables at the correct page positions with rows, columns, borders, and formatted text.

---

### Fix: VML textbox paragraph overflow (9 pages → 5 pages)
**File:** `backend/services/docx_builder.py`
**Reason:** The test PDF has 5 pages. Pages 4 and 5 are text-heavy (120 and 150 text blocks respectively). The original `add_vml_textbox()` function called `doc.add_paragraph()` for every single text block. Even though VML shapes are absolutely positioned (floating), their host paragraphs still occupy space in the document flow. Each empty paragraph has a minimum line height, so 150 paragraphs added ~150 lines of vertical space to the page, causing content to overflow onto extra pages. The 5-page PDF produced a 9-page DOCX.
**What was done:**
- Renamed `add_vml_textbox()` → `make_vml_textbox_run()`: Instead of creating a new paragraph and appending the VML run to it, the function now just builds and returns the VML `<w:r>` XML element.
- In `build_docx()`: All VML runs for a page are appended to the **single anchor paragraph** that already exists (for the background image). This means each page has exactly 1 paragraph (plus any tables), regardless of how many text blocks it contains.
- The VML shapes remain absolutely positioned relative to the page, so visual output is identical — the only difference is they share a host paragraph.
**Outcome:** The DOCX is now exactly 5 pages, matching the input PDF. Page 4 has 1 paragraph + 3 tables (table text blocks filtered out). Page 5 has 1 paragraph with all 150 VML textboxes packed inside.

---

### Feature: Table text translation
**File:** `backend/services/translator.py`
**Reason:** The translation function only translated text from `blocks` (VML text blocks). The new table data in `page.tables` was not being translated, so downloaded DOCX files had English table content even when the rest was translated.
**What was done:**
- Extended the text collection loop in `translate_project_data()` to also iterate over `page.tables[].rows[].cells[]` and collect each cell's text.
- Each table cell is tracked with a `('table_cell', (page_idx, table_idx, row_idx, cell_idx))` reference.
- In the write-back loop, translated text is assigned to `translated_data['pages'][pi]['tables'][ti]['rows'][ri]['cells'][ci]['text']`.
- Table cell text goes through the same translation pipeline as regular text (batching, retry logic, number/punctuation skipping).
**Outcome:** Table content is now translated alongside all other text in the document.

---

### Summary of current architecture
```
PDF Upload
  → Adobe PDF Extract API (figures, tables, element positions)
  → PyMuPDF (text-stripped backgrounds, per-span text formatting)
  → Compose page data: background + text blocks + tables

Editor (frontend)
  → Displays all text blocks (including table-area text) as draggable TextBlock components
  → Background image with text overlays
  → Tables not yet rendered as tables in the editor (shown as individual text blocks)

Translation
  → Translates all text spans + table cell text via Google Translate

DOCX Download
  → Per page: background image (floating, behind)
            + native Word tables (absolutely positioned via tblpPr)
            + VML textboxes (non-table text, all packed into single anchor paragraph)
```
