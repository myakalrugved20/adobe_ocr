# PDF to Word Translator — Full-Stack Application

## Overview
A web-based PDF-to-Word converter with a dual-pane editor and Google Translate integration. Upload a PDF, view it side-by-side with an editable Word representation, drag/edit text blocks, translate, and download the final .docx.

## Tech Stack
- **Backend**: FastAPI, Adobe PDF Extract API (OCR + figure extraction), PyMuPDF (page rendering), python-docx + lxml (Word assembly), Google Cloud Translation API v3 (GCP)
- **Frontend**: React + TypeScript + Vite, react-pdf (PDF.js), react-draggable

## Extraction Pipeline
1. **Adobe PDF Extract API** → structuredData.json with element positions + extracted figure PNGs (logos, icons, QR codes, photos, risk-o-meters)
2. **PyMuPDF** → text-stripped page renders (backgrounds) + per-span text formatting (font, size, color, bold/italic)
3. **Smart paragraph grouping** → consecutive lines with same font size and normal line spacing are merged into paragraph blocks; short labels/headings stay as individual line blocks
4. **Compose** → text-stripped background + Adobe figures at exact positions + text as VML textboxes

## Translation
- **Google Cloud Translation API v3** via service account credentials (`project-e3488f99-*.json`)
- Batch translation (up to 512 texts per API call) with retry logic
- 110+ languages supported (Indian, European, East Asian, Southeast Asian, Middle Eastern, African)
- Script-aware width estimation for .docx output (Latin vs Devanagari/CJK character widths)
- Paragraph blocks flow as single `<w:p>` in VML textboxes for natural word wrapping

## Coordinate System
- Adobe uses bottom-left origin: convert with `y_tl = page_height - y_bl`
- Adobe `BBox` attribute (in `attributes`) is more accurate than `Bounds`
- PyMuPDF uses top-left origin (matches Word)
- All coordinates in PDF points; converted to EMU for .docx (1 pt = 12,700 EMU)

## Project Structure
```
backend/
  main.py                    # FastAPI app entry point
  config.py                  # Settings (paths, zoom levels)
  routers/                   # upload, project, translate, download
  services/
    pdf_extractor.py         # Adobe Extract API + PyMuPDF extraction
    docx_builder.py          # Structured data → .docx assembly
    translator.py            # Google Translate integration
    project_manager.py       # Project dir/state management
  models/schemas.py          # Pydantic models

frontend/src/
  App.tsx                    # Main two-pane layout
  api/client.ts              # REST API client
  hooks/useProject.ts        # Project state management
  components/                # Toolbar, PdfViewer, DocEditor, TextBlock, PageNavigator

pdfservices-api-credentials.json  # Adobe API credentials
projects/                    # Runtime: per-upload project directories
```

## Running
```bash
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
cd frontend && npm run dev
```
Open http://localhost:5173

## Dependencies
Backend: `fastapi uvicorn[standard] python-multipart pdfservices-sdk PyMuPDF Pillow python-docx lxml google-cloud-translate`
Frontend: `react react-pdf react-draggable axios typescript vite`
