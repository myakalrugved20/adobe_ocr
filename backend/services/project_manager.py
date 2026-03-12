"""
Project manager.
Handles project creation, state persistence, and file management.
"""

import os
import json
import uuid
import shutil
from backend.config import PROJECTS_DIR


def create_project(pdf_filename):
    """Create a new project directory and return its ID."""
    project_id = str(uuid.uuid4())[:8]
    project_dir = os.path.join(PROJECTS_DIR, project_id)
    os.makedirs(project_dir, exist_ok=True)

    # Save metadata
    meta = {
        'project_id': project_id,
        'pdf_filename': pdf_filename,
        'pages': [],
    }
    save_project_data(project_id, meta)
    return project_id, project_dir


def get_project_dir(project_id):
    return os.path.join(PROJECTS_DIR, project_id)


def save_project_data(project_id, data):
    project_dir = get_project_dir(project_id)
    path = os.path.join(project_dir, "project.json")
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def load_project_data(project_id):
    project_dir = get_project_dir(project_id)
    path = os.path.join(project_dir, "project.json")
    if not os.path.exists(path):
        return None
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_pdf(project_id, pdf_content, filename):
    """Save uploaded PDF to project directory."""
    project_dir = get_project_dir(project_id)
    pdf_path = os.path.join(project_dir, filename)
    with open(pdf_path, 'wb') as f:
        f.write(pdf_content)
    return pdf_path


def list_projects():
    """List all project IDs."""
    if not os.path.exists(PROJECTS_DIR):
        return []
    return [
        d for d in os.listdir(PROJECTS_DIR)
        if os.path.isdir(os.path.join(PROJECTS_DIR, d))
    ]
