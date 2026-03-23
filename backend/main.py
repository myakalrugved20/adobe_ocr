import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from backend.config import PROJECTS_DIR
from backend.routers import upload, project, translate, download

app = FastAPI(title="PDF to Word Translator")

allowed_origins = [
    "http://localhost:5173", "http://localhost:5174",
    "http://localhost:5175", "http://localhost:5176",
    "http://localhost:3000",
]
frontend_url = os.environ.get("FRONTEND_URL")
if frontend_url:
    allowed_origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
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


# Serve frontend build (for Docker / HF Spaces deployment)
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")
if os.path.isdir(FRONTEND_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIR, "assets")), name="frontend-assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Catch-all: serve index.html for any non-API route (SPA routing)."""
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))
