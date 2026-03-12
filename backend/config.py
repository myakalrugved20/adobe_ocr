import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECTS_DIR = os.path.join(BASE_DIR, "projects")
RENDER_ZOOM = 4.0  # 288 DPI for high quality backgrounds
EXPORT_ZOOM = 4.0  # 288 DPI for final .docx export
PT_TO_EMU = 12700

os.makedirs(PROJECTS_DIR, exist_ok=True)
