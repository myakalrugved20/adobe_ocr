# How the PDF to Word Translator Works

A simple explanation of what this project does, how it was built, and why each technology was chosen.

---

## What does this project do?

You upload a PDF file (like a brochure or financial document), and the app:
1. Shows you the PDF side-by-side with an editable version
2. Lets you translate all the text into another language (like Hindi)
3. Lets you drag, edit, and rearrange text
4. Downloads a Word (.docx) file that looks like the original PDF but with translated text

The goal is to preserve the exact visual layout — backgrounds, images, colors, fonts, tables — while swapping the language.

---

## How the project was built

### The problem to solve

Converting a PDF to an editable Word file while keeping the visual layout is surprisingly hard. PDFs are designed for viewing, not editing — text, images, shapes, and colors are all baked together. Most PDF-to-Word converters lose the layout, mess up fonts, or break tables. We needed something that:
1. Preserves the exact visual appearance (backgrounds, images, decorative elements)
2. Makes text editable and translatable
3. Handles complex layouts like financial tables, multi-column text, and overlapping elements
4. Outputs a proper Word file that looks right when opened in Microsoft Word

### Choosing the approach: "Background + Overlay"

The core idea is to separate the visual design from the text:
- Take a "screenshot" of each page with the text erased → this becomes the background image
- Extract all the text separately with its exact position and formatting
- In the Word file, place the background image first, then overlay the text on top at the exact same positions

This way, no matter how complex the PDF design is (gradients, watermarks, decorative shapes, photos), it's all captured in the background image. We only need to worry about placing text correctly.

### Choosing the backend: FastAPI (Python)

**Why Python?** All the best PDF processing libraries (PyMuPDF, python-docx, Adobe SDK) have Python support. Python also has excellent libraries for translation and file manipulation.

**Why FastAPI instead of Flask/Django?** FastAPI is modern, fast, and has built-in support for async operations — important because PDF processing can take 10-30 seconds and we don't want the server to freeze while waiting. It also auto-generates API documentation and handles file uploads cleanly.

### Choosing PDF extraction: Adobe PDF Extract API + PyMuPDF

This was the trickiest decision. No single tool does everything we need, so we use two:

**Adobe PDF Extract API** — a cloud service by Adobe (the company that invented PDF). We chose it because:
- It's the most accurate at detecting document structure — it knows where tables begin and end, which images are figures vs background decorations, and how text flows
- It extracts table data as proper rows and columns with cell-level detail (row 1 column 3 = "7.97%"), not just scattered text
- It saves extracted figures and table snapshots as separate files
- It handles complex PDFs that other tools struggle with (multi-column layouts, overlapping elements, scanned documents)
- The downside: it's a cloud API call, so it takes a few seconds and requires API credentials

**PyMuPDF (also called "fitz")** — an open-source Python library. We chose it because:
- It can render PDF pages as images at any resolution — we use it to create the text-stripped background
- It extracts per-character formatting that Adobe doesn't provide well — exact font name, font size in points, color as hex code, bold/italic flags, and bounding box for every text span
- It can "redact" (erase) text from a page while keeping everything else — this is how we create the clean background
- It's fast and runs locally (no network calls)
- The downside: it doesn't understand document structure (can't tell a table from regular text)

**Together:** Adobe gives us structure (tables, figures), PyMuPDF gives us formatting (fonts, colors) and clean backgrounds.

### Choosing Word file generation: python-docx + lxml

**Why python-docx?** It's the standard Python library for creating Word files. It handles the basics — sections, paragraphs, tables, images, fonts.

**Why lxml alongside it?** Word files (.docx) are actually ZIP files containing XML. For advanced features that python-docx doesn't support directly — like absolutely positioned text boxes (VML), floating images, and table positioning — we build the raw XML using lxml and inject it into the document. This gives us full control over the Word file's structure.

**Why not just export as PDF?** The whole point is to produce an editable Word file. Users need to be able to open it in Microsoft Word, make further edits, and share it as a .docx.

### Choosing translation: deep-translator (Google Translate)

**Why Google Translate?** It's free, supports 100+ languages, and is good enough for most use cases. The `deep-translator` library wraps it in a simple Python API with retry logic.

**Why not a paid API like DeepL?** Google Translate works well for the target use case (Indian financial documents → Hindi). The architecture is modular — the translator can be swapped for any service by changing one file.

### Choosing the frontend: React + TypeScript + Vite

**Why React?** The editor needs complex interactive behavior — draggable text blocks, inline editing, zoom/pan, two-panel layout. React's component model handles this well.

**Why TypeScript?** The data structures are complex (pages → blocks → lines → spans, each with bboxes and formatting). TypeScript catches mistakes at development time instead of at runtime.

**Why Vite?** It's the fastest development server for React. Hot module reload means changes appear instantly in the browser during development.

**Why react-pdf?** It uses Mozilla's PDF.js under the hood — the same engine that renders PDFs in Firefox. It's the most reliable way to display a PDF in a web browser.

**Why react-draggable?** Text blocks need to be repositionable. This library handles mouse/touch dragging with snapping, bounds checking, and performance optimization out of the box.

---

## Step-by-step: What happens when you upload a PDF

### Step 1: Breaking the PDF apart

When you upload a PDF, two things happen at the same time:

**Adobe PDF Extract API** reads the PDF and identifies:
- Where every piece of text is on each page
- Where images/figures are (logos, photos, QR codes, icons)
- Where tables are, including their rows, columns, and cell contents
- It also saves table snapshots as Excel and PNG files

**PyMuPDF** (a PDF reading library) does two things:
- Creates a "clean background" image of each page with all the text removed but all visuals kept (photos, shapes, colors, gradients). Think of it like erasing all the writing from a poster but keeping the artwork.
- Reads every piece of text with its exact formatting — font name, size, color, bold/italic, and position on the page

### Step 2: Putting it all together

The app combines everything into a structured package for each page:
- **Background image**: The text-stripped page render (all visuals, no text)
- **Text blocks**: Every line of text with its formatting and exact position
- **Tables**: Structured table data with rows, cells, and positions (from Adobe)

This package is saved as the "project" and sent to the frontend.

### Step 3: The editor

The frontend shows you two panels:
- **Left panel**: The original PDF for reference
- **Right panel**: The editable Word-like view

The editable view works by layering:
1. The clean background image fills the page (bottom layer)
2. Text blocks are placed on top at their exact positions (top layer)

You can:
- Click on any text block to edit it
- Drag text blocks to reposition them
- Delete text blocks
- Add new text blocks by clicking

### Step 4: Translation

When you click "Translate":
- Every piece of text (including table cell text) is sent to Google Translate
- Numbers and punctuation are skipped (they don't need translation)
- The translated text replaces the original in each text block and table cell
- Positions stay the same — only the words change

### Step 5: Downloading the Word file

When you click "Download", the app builds a Word (.docx) file:

1. **Each PDF page becomes a Word page** with the exact same dimensions
2. **The background image** is placed as a full-page picture behind everything
3. **Tables** are built as real Word tables positioned at the exact coordinates from the PDF, with proper rows, columns, borders, and formatted text
4. **All other text** is placed using floating text boxes (VML) at the exact positions from the PDF, with the correct font, size, color, and style

The result is a Word file that visually matches the original PDF but with editable, translated text.

---

## Technologies used

| Technology | What it does | Why it was chosen |
|---|---|---|
| **FastAPI** (Python) | Backend web server — handles uploads, translation, downloads | Modern, async-capable, doesn't freeze during long PDF processing |
| **Adobe PDF Extract API** | Cloud service — analyzes PDFs, extracts text positions, figures, table structures | Most accurate at detecting document structure (tables, figures, layout) |
| **PyMuPDF** (fitz) | Python library — renders page images, extracts text with formatting | Best for per-character formatting and creating text-stripped backgrounds |
| **python-docx** + **lxml** | Python libraries — builds Word (.docx) files with tables, images, text boxes | python-docx for basics, lxml for advanced XML manipulation (positioned elements) |
| **deep-translator** | Python library — wraps Google Translate | Free, 100+ languages, simple API |
| **React** + **TypeScript** | Frontend framework — interactive two-panel editor | Component model suits complex UI; TypeScript catches data structure errors |
| **Vite** | Development server and build tool | Fastest hot-reload for React development |
| **react-pdf** (PDF.js) | Renders original PDF in the browser | Uses Mozilla's PDF engine — most reliable PDF rendering |
| **react-draggable** | Makes text blocks draggable | Handles mouse/touch dragging with performance optimization |
| **axios** | HTTP client for frontend-backend communication | Clean API for file uploads and REST requests |

---

## Project folder structure (simplified)

```
backend/
  main.py                → Starts the web server
  config.py              → Settings (paths, zoom levels, unit conversions)
  routers/               → Handles API requests (upload, translate, download)
  services/
    pdf_extractor.py     → Breaks apart the PDF (Adobe API + PyMuPDF)
    docx_builder.py      → Assembles the Word file
    translator.py        → Translates text via Google Translate
    project_manager.py   → Manages project files and folders
  models/
    schemas.py           → Data structure definitions

frontend/src/
  App.tsx                → Main app with two-panel layout
  api/client.ts          → REST API client for talking to the backend
  types/project.ts       → TypeScript type definitions
  hooks/useProject.ts    → Project state management
  components/
    PdfViewer.tsx        → Shows original PDF (left panel)
    DocEditor.tsx        → Editable Word view (right panel)
    TextBlock.tsx        → Individual draggable/editable text block
    Toolbar.tsx          → Buttons for translate, download, etc.
    PageNavigator.tsx    → Page navigation controls

projects/                → Runtime: per-upload project directories
  {project-id}/
    assets/              → Background images (page_0_bg.png, etc.)
    figures/             → Extracted figure images from Adobe
    tables/              → Extracted table files from Adobe (xlsx, png)
    structuredData.json  → Raw Adobe extraction output
    project.json         → Project state (pages, blocks, tables)
    output.docx          → Generated Word file
```

---

## Key concepts

**Why strip text from the background?**
The PDF has text mixed with images, shapes, and colors. By removing the text and keeping everything else as an image, we get a clean "canvas". We then place new (translated) text on top. This way, all the visual design is preserved perfectly — no matter how complex the original layout is.

**Why use Adobe API AND PyMuPDF?**
Adobe's API is great at understanding document structure (where tables are, which images are figures vs decorations). PyMuPDF is great at extracting exact text formatting (font, size, color per character) and rendering clean page images. Neither tool does both well, so together they give us the best of both worlds.

**Why use VML text boxes in the Word file?**
Word doesn't natively support placing text at exact pixel coordinates like a PDF does. VML (Vector Markup Language) text boxes can be absolutely positioned anywhere on the page, letting us recreate the PDF layout precisely in Word. All text boxes for a page are packed into a single paragraph to avoid overflow.

**Why build native Word tables instead of text boxes for tables?**
Tables have structured data — rows, columns, aligned numbers. Using VML text boxes for each cell would lose the table structure and look messy. Native Word tables preserve the grid layout, borders, and cell alignment properly. They also reduce the element count significantly (one table vs dozens of individual text boxes).

**Why is the coordinate system tricky?**
Adobe uses a coordinate system where (0,0) is at the bottom-left of the page (like math graphs). PyMuPDF and Word use (0,0) at the top-left (like computer screens). Every coordinate from Adobe needs to be flipped: `y_screen = page_height - y_adobe`. Getting this wrong by even a few pixels makes text appear in the wrong place.



Here's a complete breakdown of how the docx editor works in this project:                                                          
  ---                                                                                                                                
  Architecture Overview                                                                                                                                                                                                                                                   
  The editor is a dual-pane layout: the original PDF on one side, and an editable "Word-like" canvas on the other. The canvas is NOT   a real Word document — it's a React-based visual editor that mimics one, and the actual .docx is only built at export time.                                                                                                                                               ---                                                                                                                                  1. Data Flow Pipeline                                                                                                              
 
  PDF Upload
    → Adobe Extract API (text positions, figures)
    → PyMuPDF (text-stripped backgrounds, font/color/bold formatting per span)
    → Structured JSON (pages → blocks → lines → spans)
    → React frontend renders blocks as draggable/editable divs
    → User edits (move, resize, edit text, delete, add)
    → Save layout → Translate → Build .docx with VML textboxes
 
  2. The Data Model
 
  Everything revolves around this hierarchy:
 
  Project
   └─ Page (width, height, background image path)
       └─ Block (id, bbox [x0, y0, x1, y1])
           └─ Line (bbox)
               └─ Span (text, font, size, color, bold, italic, bbox)
 
  Each PDF line becomes a separate Block — this gives per-line drag/edit control. Spans within a line preserve mixed formatting      
  (e.g., "offers Expertise in").
 
  3. Frontend: The Visual Editor
 
  DocEditor (components/DocEditor.tsx)
 
  - Renders the text-stripped page background as an <img> (PyMuPDF renders the PDF page with all text redacted to white)
  - Overlays extracted figures (logos, photos) on top
  - Maps each block to a <TextBlock> component
  - Computes a scale factor: scale = (containerWidth - 20) / page.width so the canvas is responsive
 
  TextBlock (components/TextBlock.tsx)
 
  This is the core interactive element. Each block is a <div> with:
 
  - Absolute positioning: left = bbox[0] * scale, top = bbox[1] * scale
  - Dimensions: width = (bbox[2] - bbox[0]) * scale, height = (bbox[3] - bbox[1]) * scale
  - Dragging via react-draggable — on drag stop, pixel deltas are converted back to points (dx / scale) and the bbox is updated      
  - 8 resize handles (corners + edges) — mouse move recalculates bbox bounds with minimum size enforcement (20pt wide, 10pt tall)    
  - Inline editing — double-click flips spans from <span> to <input> fields. Font size is span.size * scale * 0.75. Press Escape to  
  exit edit mode
  - Deletion — Delete key or X button when selected
 
  State Management (hooks/useProject.ts)
 
  All mutations are immutable (spread operators) to trigger React re-renders:
 
  ┌────────────────────────────────────────────────┬──────────────────────────────────────────────────┐
  │                    Function                    │                   What it does                   │
  ├────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
  │ updateBlockText(page, block, line, span, text) │ Updates a single span's text                     │
  ├────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
  │ moveBlock(page, block, dx, dy, scale)          │ Shifts bbox by pixel delta / scale               │
  ├────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
  │ resizeBlock(page, block, newBbox)              │ Replaces bbox directly                           │
  ├────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
  │ addBlock(page, x, y)                           │ Creates new block with default span (Arial 11pt) │
  ├────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
  │ deleteBlock(page, block)                       │ Filters block out of page                        │
  └────────────────────────────────────────────────┴──────────────────────────────────────────────────┘
 
  4. Backend: How the .docx is Actually Built
 
  The frontend editor is purely visual. The real Word document is built at download time in docx_builder.py:
 
  Page Setup
 
  - Each page becomes a Word section with dimensions matching the PDF page
  - All margins set to 0
 
  Background
 
  - The text-stripped PNG is inserted as a floating image using wp:anchor with behindDoc='1' — this places it behind everything,     
  anchored to the page
 
  Figures
 
  - Extracted PNGs (logos, QR codes, photos) are inserted as floating images with behindDoc='0' (in front of background, behind text)
 
  Text Blocks → VML Textboxes
 
  This is the key technique. Each block becomes a VML (Vector Markup Language) textbox — Word's mechanism for absolute text
  positioning:
 
  <v:shape style="position:absolute; left:72pt; top:100pt; width:200pt; height:30pt; ...">
<v:textbox>
<w:txbxContent>
<w:p>
<w:r>
<w:rPr>  <!-- font, size, color, bold, italic -->
<w:t>Hello world</w:t>
</w:r>
</w:p>
</w:txbxContent>
</v:textbox>
</v:shape>
 
  Each span becomes a <w:r> (run) with its formatting properties. This gives pixel-perfect positioning matching the editor.
 
  Tables
 
  - Native Word tables with tblpPr (table positioning properties) for absolute placement
  - Cell widths, borders, shading all carried over
 
  5. Coordinate System
 
  Three systems are reconciled:
 
  ┌─────────────────────────┬───────────────────────────┬─────────────────────────────┐
  │         System          │          Origin           │           Used By           │
  ├─────────────────────────┼───────────────────────────┼─────────────────────────────┤
  │ Adobe PDF Extract       │ Bottom-left               │ Raw extraction data         │
  ├─────────────────────────┼───────────────────────────┼─────────────────────────────┤
  │ PyMuPDF / Editor / Word │ Top-left                  │ Everything after conversion │
  ├─────────────────────────┼───────────────────────────┼─────────────────────────────┤
  │ Word EMU                │ Top-left, 1pt = 12700 EMU │ .docx XML                   │
  └─────────────────────────┴───────────────────────────┴─────────────────────────────┘
 
  Conversion: y_topleft = page_height - y_bottomleft
 
  6. Key Design Decisions
 
  1. Text-stripped backgrounds — PyMuPDF renders pages with text redacted to white, so you see the original design (colors, shapes,  
  images) without text duplication
  2. Per-line blocks — Each line is independently movable, not grouped by paragraph
  3. VML textboxes — The only way to get absolute text positioning in .docx (native paragraphs flow, they don't have fixed positions)
  4. Scale factor with 0.75 — Font sizes are rendered at size * scale * 0.75 — an empirical correction for screen vs. print rendering
   differences
  5. Immutable state — All edits create new objects via spread, ensuring clean React re-renders
 
  The result is that users see a WYSIWYG-like editor where they can drag, resize, and edit text over the original PDF background, and
   the export produces a .docx that visually matches.



Here's how the editor and backend work together:                                                                                                                                                                                                                        
  The Editor: How It's Built                                                                                                            
  It's NOT a real Word document in the browser                                                                                                                                                                                                                            
  The editor is a visual illusion. It's a React canvas that looks like a Word document but is actually just HTML divs positioned over
   an image. The real .docx file only gets built when you click Download.                                                            

  The Layering System

  Think of each page as a stack of transparent sheets:

  Layer 3 (top):    Text blocks — draggable, editable <div> elements
  Layer 2:          Extracted figures (logos, QR codes, photos)
  Layer 1 (bottom): Background image — the PDF page with text erased

  The background image is a PNG rendered by PyMuPDF at 4x zoom (288 DPI). PyMuPDF "redacts" every text span by painting over it with 
  no fill, then renders the result. What's left is all the visual design — colors, shapes, gradients, photos — without any text.     

  How Text Blocks Work

  Each line of text from the PDF becomes one TextBlock component. Let me walk through the code:

● Read 3 files (ctrl+o to expand)    
                                          
● Now let me look at the backend routers to explain the full request flow:                                                           
  
● Read 3 files (ctrl+o to expand)                                                                                                    
                                                                                                                                     
● Now I have the full picture. Here's the explanation:                                                                               
                                                                                                                                     
  ---                                                                                                                                
  How the Backend and Editor Were Built                                                                                              
                                                                                                                                       The Big Picture                                                                                                                    
                                                                                                                                     
  The project has 4 API endpoints that drive the entire flow: 

  POST /api/upload      →  Extract PDF into editable data
  POST /api/save-layout →  Save editor changes (drag/resize/edit)
  POST /api/translate   →  Translate all text, save result
  GET  /api/download    →  Build .docx from saved data, return file

  1. Upload Flow (POST /api/upload)

  When you pick a PDF file and click upload:

  Frontend (App.tsx → useProject.ts):
  - Creates a FormData with the file, sends it via axios to /api/upload
  - Sets loading: true so the UI shows "Processing PDF..."

  Backend (upload.py → pdf_extractor.py):
  - Saves the PDF to a new project folder (projects/{random-id}/)
  - Runs extraction in a thread pool (run_in_executor) so the server doesn't freeze
  - Adobe PDF Extract API: Sends the PDF to Adobe's cloud, gets back a ZIP containing structuredData.json (element positions) +      
  figure PNGs + table files (xlsx/png). The structured data tells us where every table, figure, and text element is
  - PyMuPDF background render: Opens the PDF, loops through each page, "redacts" every text span (erases it), renders the result as a
   PNG at 4x zoom. This gives us clean backgrounds
  - PyMuPDF text extraction: Reads every text span with its font, size, color, bold/italic flags, and bounding box [x0, y0, x1, y1]. 
  Each line becomes a separate "block"
  - Table parsing: Walks Adobe's elements looking for Table/TR/TH/TD paths, builds structured row/cell data, converts coordinates    
  from Adobe's bottom-left origin to top-left
  - Returns JSON with all pages, each containing: background_image, blocks[], tables[], images[]

  Frontend receives the data → stores it in React state → renders the editor

  2. The Editor (frontend only — no backend calls during editing)

  The editor is entirely client-side. Every edit updates React state — no API calls until you save or translate.

  DocEditor (DocEditor.tsx):
  - Computes a scale factor: scale = containerWidth / page.width so the page fits the browser window
  - Renders the background as an <img> filling the canvas
  - Maps each block to a <TextBlock> component

  TextBlock (TextBlock.tsx) — each text block is a <div> wrapped in <Draggable>:
  - Positioning: left = bbox[0] * scale, top = bbox[1] * scale — coordinates are in PDF points, multiplied by scale for screen pixels
  - Text rendering: Each span renders as a <span> with fontSize = span.size * scale * 0.75 (the 0.75 is an empirical correction for  
  screen vs print rendering)
  - Dragging: react-draggable tracks mouse movement. On drag stop, pixel deltas are converted back to points (dx / scale) and the    
  bbox is shifted
  - Resizing: 8 handles (corners + edges). Mouse move recalculates bbox bounds with minimum size enforcement (20pt wide, 10pt tall)  
  - Inline editing: Double-click flips spans from <span> to <input>. Escape exits edit mode
  - Deletion: Delete key or X button when selected

  State management (useProject.ts):
  - All mutations use spread operators ({ ...prev, pages: newPages }) to create new objects — this triggers React re-renders
  - moveBlock: shifts bbox by dx/scale, dy/scale
  - resizeBlock: replaces bbox directly
  - updateBlockText: updates a single span's text
  - addBlock: creates a new block with default formatting (Arial 11pt black)
  - deleteBlock: filters the block out

  3. Save Layout (POST /api/save-layout)

  Before translating or downloading, the frontend saves the current editor state:
  - Sends the full pages[] array (with any moved/resized/edited blocks) to the backend
  - Backend overwrites project.json with the new data
  - This is how drag/edit changes persist

  4. Translate (POST /api/translate)

  When you click Translate:

  Frontend: Saves layout first, then sends {project_id, target_lang} to /api/translate

  Backend (translator.py):
  - Loads the saved project data
  - Deep-copies it (so original is preserved)
  - Walks every page → block → line → span and collects all text strings
  - Also walks every page → table → row → cell for table text
  - Sends all text to Google Translate via deep-translator (batched, with retry logic)
  - Numbers and punctuation are skipped (regex check: ^[\d\s\W]+$)
  - Writes translated text back into the same data structure at the same positions
  - Saves the translated data as the new project state

  Frontend: Receives the translated project data, replaces React state → editor immediately shows translated text at the same        
  positions

  5. Download (GET /api/download/{project_id})

  When you click Download:

  Frontend: Saves layout first, then opens /api/download/{id} in a new tab

  Backend (docx_builder.py):
  - Creates a new Word document
  - For each page:
    a. New section with exact PDF dimensions (595×842pt for A4), zero margins
    b. Background image: Inserted as a floating wp:anchor image with behindDoc='1', positioned at (0,0) filling the full page        
    c. Tables: For each Adobe-detected table, builds a native Word <w:tbl> element with absolute positioning via tblpPr. Inserted    
  after the anchor paragraph using addnext() to stay in the correct section
    d. Text blocks: For each non-table block, builds a VML <w:r> containing a <v:shape> textbox at the exact position. All VML runs  
  are packed into the single anchor paragraph (prevents overflow). Each span becomes a <w:r> with font/size/color/bold/italic        
  properties
  - Saves as output.docx, returns as file download

  The Key Insight: Two Separate Rendering Systems

  The editor and the DOCX are completely independent renderers of the same data:

  ┌──────────────────┬──────────────────────────────────────┬──────────────────────────────────────┐
  │                  │           Editor (browser)           │             DOCX (Word)              │
  ├──────────────────┼──────────────────────────────────────┼──────────────────────────────────────┤
  │ Background       │ <img> tag                            │ wp:anchor floating image             │
  ├──────────────────┼──────────────────────────────────────┼──────────────────────────────────────┤
  │ Text positioning │ CSS position: absolute               │ VML v:shape with absolute coords     │
  ├──────────────────┼──────────────────────────────────────┼──────────────────────────────────────┤
  │ Text formatting  │ CSS fontSize, fontWeight, color      │ w:rPr with w:sz, w:b, w:color        │
  ├──────────────────┼──────────────────────────────────────┼──────────────────────────────────────┤
  │ Tables           │ Individual text blocks (no table UI) │ Native w:tbl with tblpPr positioning │
  ├──────────────────┼──────────────────────────────────────┼──────────────────────────────────────┤
  │ Coordinate units │ PDF points × scale → pixels          │ PDF points × 12700 → EMU             │
  └──────────────────┴──────────────────────────────────────┴──────────────────────────────────────┘

  They both read from the same project.json data, but render it using their respective technologies. This is why "everything looks   
  fine in the editor" but the DOCX can have different issues — they're separate rendering paths.