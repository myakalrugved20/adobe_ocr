import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from backend.config import PROJECTS_DIR
from backend.routers import upload, project, translate, download

app = FastAPI(title="PDF to Word Translator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve project assets (images, backgrounds)
os.makedirs(PROJECTS_DIR, exist_ok=True)
app.mount("/static/projects", StaticFiles(directory=PROJECTS_DIR), name="projects")

# Register routers
app.include_router(upload.router)
app.include_router(project.router)
app.include_router(translate.router)
app.include_router(download.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
