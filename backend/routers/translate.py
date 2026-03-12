from fastapi import APIRouter, HTTPException
from backend.services import project_manager, translator
from backend.models.schemas import TranslateRequest

router = APIRouter()


@router.post("/api/translate")
async def translate_project(req: TranslateRequest):
    data = project_manager.load_project_data(req.project_id)
    if not data:
        raise HTTPException(404, "Project not found")

    try:
        translated_data = translator.translate_project_data(
            data,
            src_lang=req.source_lang,
            dest_lang=req.target_lang,
            paragraph_mode=req.paragraph_mode,
        )
    except Exception as e:
        raise HTTPException(500, f"Translation failed: {str(e)}")

    # Save translated version
    translated_data['project_id'] = req.project_id
    translated_data['pdf_filename'] = data['pdf_filename']
    project_manager.save_project_data(req.project_id, translated_data)

    return translated_data
