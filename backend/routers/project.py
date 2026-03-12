from fastapi import APIRouter, HTTPException
from backend.services import project_manager
from backend.models.schemas import SaveLayoutRequest

router = APIRouter()


@router.get("/api/project/{project_id}")
async def get_project(project_id: str):
    data = project_manager.load_project_data(project_id)
    if not data:
        raise HTTPException(404, "Project not found")
    return data


@router.post("/api/save-layout")
async def save_layout(req: SaveLayoutRequest):
    data = project_manager.load_project_data(req.project_id)
    if not data:
        raise HTTPException(404, "Project not found")

    data['pages'] = req.pages
    project_manager.save_project_data(req.project_id, data)
    return {"status": "ok"}


@router.get("/api/projects")
async def list_projects():
    project_ids = project_manager.list_projects()
    projects = []
    for pid in project_ids:
        data = project_manager.load_project_data(pid)
        if data:
            projects.append({
                'project_id': pid,
                'pdf_filename': data.get('pdf_filename', ''),
            })
    return projects
