import axios from 'axios';
import type { Project } from '../types/project';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
const API = axios.create({ baseURL: API_BASE, timeout: 300000 });

export async function uploadPdf(file: File): Promise<Project> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await API.post('/api/upload', form);
  return data;
}

export async function getProject(id: string): Promise<Project> {
  const { data } = await API.get(`/api/project/${id}`);
  return data;
}

export async function saveLayout(projectId: string, pages: Project['pages']) {
  await API.post('/api/save-layout', { project_id: projectId, pages });
}

export async function translateProject(
  projectId: string,
  targetLang: string,
  sourceLang = 'auto',
  paragraphMode = false
): Promise<Project> {
  const { data } = await API.post('/api/translate', {
    project_id: projectId,
    target_lang: targetLang,
    source_lang: sourceLang,
    paragraph_mode: paragraphMode,
  });
  return data;
}

export function getDownloadUrl(projectId: string): string {
  return `${API_BASE}/api/download/${projectId}`;
}

export function getAssetUrl(projectId: string, assetPath: string): string {
  return `${API_BASE}/static/projects/${projectId}/${assetPath}`;
}
