import { useState, useCallback, useRef } from 'react';
import type { Project, Block } from '../types/project';
import * as api from '../api/client';

const MAX_HISTORY = 50;
let blockCounter = 0;

export function useProject() {
  const [project, setProject] = useState<Project | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Undo/redo history
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const [_historyVersion, setHistoryVersion] = useState(0); // triggers re-render for canUndo/canRedo

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  // Wrapper: push history then set project
  const setProjectWithHistory = useCallback((updater: Project | ((prev: Project | null) => Project | null)) => {
    // Push current state before mutation
    setProject(prev => {
      if (prev) {
        const snapshot = JSON.stringify(prev);
        const idx = historyIndexRef.current;
        historyRef.current = historyRef.current.slice(0, idx + 1);
        historyRef.current.push(snapshot);
        if (historyRef.current.length > MAX_HISTORY) {
          historyRef.current.shift();
        }
        historyIndexRef.current = historyRef.current.length - 1;
      }
      // Apply the actual update
      if (typeof updater === 'function') {
        return updater(prev);
      }
      return updater;
    });
    setHistoryVersion(v => v + 1);
  }, []);

  const undo = useCallback(() => {
    const idx = historyIndexRef.current;
    if (idx < 0 || historyRef.current.length === 0) return;

    // Save current state for redo
    setProject(prev => {
      if (prev) {
        const current = JSON.stringify(prev);
        if (idx === historyRef.current.length - 1 && historyRef.current[idx] !== current) {
          historyRef.current.push(current);
        }
      }
      if (idx > 0) {
        historyIndexRef.current = idx - 1;
        return JSON.parse(historyRef.current[idx - 1]);
      }
      return JSON.parse(historyRef.current[0]);
    });
    setHistoryVersion(v => v + 1);
  }, []);

  const redo = useCallback(() => {
    const idx = historyIndexRef.current;
    if (idx >= historyRef.current.length - 1) return;
    historyIndexRef.current = idx + 1;
    setProject(JSON.parse(historyRef.current[idx + 1]));
    setHistoryVersion(v => v + 1);
  }, []);

  const upload = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.uploadPdf(file);
      setProject(data);
      setCurrentPage(0);
      blockCounter = 0;
      historyRef.current = [JSON.stringify(data)];
      historyIndexRef.current = 0;
      setHistoryVersion(v => v + 1);
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
      setProjectWithHistory(data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Translation failed');
    } finally {
      setTranslating(false);
    }
  }, [project]);

  const updateBlockText = useCallback((pageIdx: number, blockId: string, lineIdx: number, spanIdx: number, text: string) => {
    setProjectWithHistory(prev => {
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
    setProjectWithHistory(prev => {
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
    setProjectWithHistory(prev => {
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
    setProjectWithHistory(prev => {
      if (!prev) return prev;
      const newPages = [...prev.pages];
      const page = { ...newPages[pageIdx] };
      page.blocks = [...page.blocks, newBlock];
      newPages[pageIdx] = page;
      return { ...prev, pages: newPages };
    });
    return id;
  }, [setProjectWithHistory]);

  const deleteBlock = useCallback((pageIdx: number, blockId: string) => {
    setProjectWithHistory(prev => {
      if (!prev) return prev;
      const newPages = [...prev.pages];
      const page = { ...newPages[pageIdx] };
      page.blocks = page.blocks.filter(b => b.id !== blockId);
      newPages[pageIdx] = page;
      return { ...prev, pages: newPages };
    });
  }, []);

  const updateBlockSpanProperty = useCallback((pageIdx: number, blockId: string, property: string, value: any) => {
    setProjectWithHistory(prev => {
      if (!prev) return prev;
      const newPages = [...prev.pages];
      const page = { ...newPages[pageIdx] };
      page.blocks = page.blocks.map(b => {
        if (b.id !== blockId) return b;
        return {
          ...b,
          lines: b.lines.map(line => ({
            ...line,
            spans: line.spans.map(span => ({ ...span, [property]: value })),
          })),
        };
      });
      newPages[pageIdx] = page;
      return { ...prev, pages: newPages };
    });
  }, []);

  const updateBlockOpacity = useCallback((pageIdx: number, blockId: string, opacity: number) => {
    setProjectWithHistory(prev => {
      if (!prev) return prev;
      const newPages = [...prev.pages];
      const page = { ...newPages[pageIdx] };
      page.blocks = page.blocks.map(b =>
        b.id === blockId ? { ...b, opacity } : b
      );
      newPages[pageIdx] = page;
      return { ...prev, pages: newPages };
    });
  }, []);

  const updateBlockAlign = useCallback((pageIdx: number, blockId: string, align: 'left' | 'center' | 'right' | 'justify') => {
    setProjectWithHistory(prev => {
      if (!prev) return prev;
      const newPages = [...prev.pages];
      const page = { ...newPages[pageIdx] };
      page.blocks = page.blocks.map(b =>
        b.id === blockId ? { ...b, align } : b
      );
      newPages[pageIdx] = page;
      return { ...prev, pages: newPages };
    });
  }, []);

  const updateBlockPosition = useCallback((pageIdx: number, blockId: string, x: number, y: number) => {
    setProjectWithHistory(prev => {
      if (!prev) return prev;
      const newPages = [...prev.pages];
      const page = { ...newPages[pageIdx] };
      page.blocks = page.blocks.map(b => {
        if (b.id !== blockId) return b;
        const w = b.bbox[2] - b.bbox[0];
        const h = b.bbox[3] - b.bbox[1];
        return { ...b, bbox: [x, y, x + w, y + h] };
      });
      newPages[pageIdx] = page;
      return { ...prev, pages: newPages };
    });
  }, []);

  const reorderBlock = useCallback((pageIdx: number, blockId: string, direction: 'up' | 'down') => {
    setProjectWithHistory(prev => {
      if (!prev) return prev;
      const newPages = [...prev.pages];
      const page = { ...newPages[pageIdx] };
      const blocks = [...page.blocks];
      const idx = blocks.findIndex(b => b.id === blockId);
      if (idx < 0) return prev;
      const swapIdx = direction === 'up' ? idx + 1 : idx - 1;
      if (swapIdx < 0 || swapIdx >= blocks.length) return prev;
      [blocks[idx], blocks[swapIdx]] = [blocks[swapIdx], blocks[idx]];
      page.blocks = blocks;
      newPages[pageIdx] = page;
      return { ...prev, pages: newPages };
    });
  }, []);

  const duplicateBlock = useCallback((pageIdx: number, blockId: string) => {
    blockCounter++;
    const newId = `dup_b${blockCounter}`;
    setProjectWithHistory(prev => {
      if (!prev) return prev;
      const newPages = [...prev.pages];
      const page = { ...newPages[pageIdx] };
      const source = page.blocks.find(b => b.id === blockId);
      if (!source) return prev;
      const clone: Block = {
        ...source,
        id: newId,
        bbox: [source.bbox[0] + 15, source.bbox[1] + 15, source.bbox[2] + 15, source.bbox[3] + 15],
        lines: source.lines.map(l => ({
          ...l,
          spans: l.spans.map(s => ({ ...s })),
        })),
      };
      page.blocks = [...page.blocks, clone];
      newPages[pageIdx] = page;
      return { ...prev, pages: newPages };
    });
    return newId;
  }, []);

  const updateBlockAllText = useCallback((pageIdx: number, blockId: string, text: string) => {
    setProjectWithHistory(prev => {
      if (!prev) return prev;
      const newPages = [...prev.pages];
      const page = { ...newPages[pageIdx] };
      page.blocks = page.blocks.map(b => {
        if (b.id !== blockId) return b;
        const firstSpan = b.lines[0]?.spans[0];
        const baseSpan = firstSpan ? { ...firstSpan, text } : {
          text, font: 'Arial', size: 11, color: '000000',
          bold: false, italic: false, bbox: [...b.bbox],
        };
        return {
          ...b,
          lines: [{ spans: [baseSpan], bbox: [...b.bbox] }],
        };
      });
      newPages[pageIdx] = page;
      return { ...prev, pages: newPages };
    });
  }, []);

  const translateGroup = useCallback(async (pageIdx: number, blockIds: string[], targetLang: string) => {
    if (!project) return;
    setTranslating(true);
    setError(null);
    try {
      await api.saveLayout(project.project_id, project.pages);
      const data = await api.translateBlockGroup(
        project.project_id, pageIdx, blockIds, targetLang
      );
      setProjectWithHistory(data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Group translation failed');
    } finally {
      setTranslating(false);
    }
  }, [project]);

  const updateBlockLines = useCallback((pageIdx: number, blockId: string, lines: Block['lines']) => {
    setProjectWithHistory(prev => {
      if (!prev) return prev;
      const newPages = [...prev.pages];
      const page = { ...newPages[pageIdx] };
      page.blocks = page.blocks.map(b =>
        b.id === blockId ? { ...b, lines } : b
      );
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
    upload, translate, translateGroup,
    updateBlockText, moveBlock, resizeBlock,
    addBlock, deleteBlock,
    updateBlockSpanProperty, updateBlockOpacity, updateBlockAlign, updateBlockLines,
    updateBlockPosition, reorderBlock, duplicateBlock,
    updateBlockAllText,
    saveLayout,
    undo, redo, canUndo, canRedo,
  };
}
