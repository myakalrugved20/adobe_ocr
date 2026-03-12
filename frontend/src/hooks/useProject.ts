import { useState, useCallback } from 'react';
import type { Project, Block } from '../types/project';
import * as api from '../api/client';

let blockCounter = 0;

export function useProject() {
  const [project, setProject] = useState<Project | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.uploadPdf(file);
      setProject(data);
      setCurrentPage(0);
      blockCounter = 0;
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Upload failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const translate = useCallback(async (targetLang: string) => {
    if (!project) return;
    setTranslating(true);
    setError(null);
    try {
      await api.saveLayout(project.project_id, project.pages);
      const data = await api.translateProject(project.project_id, targetLang);
      setProject(data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Translation failed');
    } finally {
      setTranslating(false);
    }
  }, [project]);

  const updateBlockText = useCallback((pageIdx: number, blockId: string, lineIdx: number, spanIdx: number, text: string) => {
    setProject(prev => {
      if (!prev) return prev;
      const newPages = [...prev.pages];
      const page = { ...newPages[pageIdx] };
      page.blocks = page.blocks.map(b => {
        if (b.id !== blockId) return b;
        const newLines = [...b.lines];
        const newLine = { ...newLines[lineIdx] };
        const newSpans = [...newLine.spans];
        newSpans[spanIdx] = { ...newSpans[spanIdx], text };
        newLine.spans = newSpans;
        newLines[lineIdx] = newLine;
        return { ...b, lines: newLines };
      });
      newPages[pageIdx] = page;
      return { ...prev, pages: newPages };
    });
  }, []);

  const moveBlock = useCallback((pageIdx: number, blockId: string, dx: number, dy: number, scale: number) => {
    const dxPt = dx / scale;
    const dyPt = dy / scale;
    setProject(prev => {
      if (!prev) return prev;
      const newPages = [...prev.pages];
      const page = { ...newPages[pageIdx] };
      page.blocks = page.blocks.map(b => {
        if (b.id !== blockId) return b;
        const [x0, y0, x1, y1] = b.bbox;
        return { ...b, bbox: [x0 + dxPt, y0 + dyPt, x1 + dxPt, y1 + dyPt] };
      });
      newPages[pageIdx] = page;
      return { ...prev, pages: newPages };
    });
  }, []);

  const resizeBlock = useCallback((pageIdx: number, blockId: string, newBbox: number[]) => {
    setProject(prev => {
      if (!prev) return prev;
      const newPages = [...prev.pages];
      const page = { ...newPages[pageIdx] };
      page.blocks = page.blocks.map(b =>
        b.id === blockId ? { ...b, bbox: newBbox } : b
      );
      newPages[pageIdx] = page;
      return { ...prev, pages: newPages };
    });
  }, []);

  const addBlock = useCallback((pageIdx: number, xPt: number, yPt: number) => {
    blockCounter++;
    const id = `new_b${blockCounter}`;
    const newBlock: Block = {
      id,
      bbox: [xPt, yPt, xPt + 120, yPt + 20],
      lines: [{
        spans: [{
          text: 'New text',
          font: 'Arial',
          size: 11,
          color: '000000',
          bold: false,
          italic: false,
          bbox: [xPt, yPt, xPt + 120, yPt + 14],
        }],
        bbox: [xPt, yPt, xPt + 120, yPt + 14],
      }],
    };
    setProject(prev => {
      if (!prev) return prev;
      const newPages = [...prev.pages];
      const page = { ...newPages[pageIdx] };
      page.blocks = [...page.blocks, newBlock];
      newPages[pageIdx] = page;
      return { ...prev, pages: newPages };
    });
    return id;
  }, []);

  const deleteBlock = useCallback((pageIdx: number, blockId: string) => {
    setProject(prev => {
      if (!prev) return prev;
      const newPages = [...prev.pages];
      const page = { ...newPages[pageIdx] };
      page.blocks = page.blocks.filter(b => b.id !== blockId);
      newPages[pageIdx] = page;
      return { ...prev, pages: newPages };
    });
  }, []);

  const saveLayout = useCallback(async () => {
    if (!project) return;
    try {
      await api.saveLayout(project.project_id, project.pages);
    } catch (e: any) {
      setError('Failed to save layout');
    }
  }, [project]);

  return {
    project, currentPage, setCurrentPage,
    loading, translating, error,
    upload, translate,
    updateBlockText, moveBlock, resizeBlock,
    addBlock, deleteBlock,
    saveLayout,
  };
}
