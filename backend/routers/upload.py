import asyncio
from functools import partial
from fastapi import APIRouter, UploadFile, File, HTTPException
from backend.services import project_manager, pdf_extractor

router = APIRouter()


@router.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(400, "Only PDF files are accepted")

    content = await file.read()
    project_id, project_dir = project_manager.create_project(file.filename)

    # Save PDF
    pdf_path = project_manager.save_pdf(project_id, content, file.filename)

    # Extract everything — run in thread pool to avoid blocking the event loop
    try:
        loop = asyncio.get_event_loop()
        pages_data = await loop.run_in_executor(
            None, partial(pdf_extractor.extract_project, pdf_path, project_dir)
        )
    except Exception as e:
        raise HTTPException(500, f"PDF extraction failed: {str(e)}")

    # Save project state
    project_data = {
        'project_id': project_id,
        'pdf_filename': file.filename,
        'pages': pages_data,
    }
    project_manager.save_project_data(project_id, project_data)

    return project_data
