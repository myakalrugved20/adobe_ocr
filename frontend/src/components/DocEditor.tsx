import { useRef, useState, useEffect, useCallback } from 'react';
import type { Page } from '../types/project';
import TextBlock from './TextBlock';
import type { TextBlockHandle } from './TextBlock';
import ZoomControls from './ZoomControls';
import { getAssetUrl } from '../api/client';

interface DocEditorProps {
  page: Page;
  projectId: string;
  addMode: boolean;
  groupMode: boolean;
  groupSelectedBlocks: Set<string>;
  selectedBlock: string | null;
  onSelectBlock: (id: string | null) => void;
  onMoveBlock: (blockId: string, dx: number, dy: number, scale: number) => void;
  onResizeBlock: (blockId: string, newBbox: number[]) => void;
  onDeleteBlock: (blockId: string) => void;
  onAddBlock: (xPt: number, yPt: number) => string;
  onTextChange: (blockId: string, lineIdx: number, spanIdx: number, text: string) => void;
  onTextChangeAll: (blockId: string, text: string) => void;
  onUpdateLines: (blockId: string, lines: import('../types/project').Block['lines']) => void;
  onExitAddMode: () => void;
  onGroupSelect: (blockIds: Set<string>) => void;
  onTranslateGroup: () => void;
  onCancelGroup: () => void;
  onFormatRef?: (ref: TextBlockHandle | null) => void;
}

export default function DocEditor({
  page, projectId, addMode, groupMode, groupSelectedBlocks,
  selectedBlock, onSelectBlock,
  onMoveBlock, onResizeBlock, onDeleteBlock, onAddBlock,
  onTextChange, onTextChangeAll, onUpdateLines, onExitAddMode,
  onGroupSelect, onTranslateGroup, onCancelGroup,
  onFormatRef,
}: DocEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const blockRefsMap = useRef<Map<string, TextBlockHandle>>(new Map());
  const [containerWidth, setContainerWidth] = useState(500);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Snap guidelines state
  const [guidelines, setGuidelines] = useState<{ type: 'h' | 'v'; pos: number }[]>([]);

  // Selection rectangle state (in PDF points)
  const [selStart, setSelStart] = useState<{ x: number; y: number } | null>(null);
  const [selEnd, setSelEnd] = useState<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const baseScale = (containerWidth - 20) / page.width;
  const effectiveScale = baseScale * zoomLevel;
  const displayWidth = page.width * effectiveScale;
  const displayHeight = page.height * effectiveScale;
  const bgUrl = getAssetUrl(projectId, page.background_image);

  const SNAP_THRESHOLD = 3;
  const computeGuidelines = useCallback((blockId: string, dxPx: number, dyPx: number) => {
    const block = page.blocks.find(b => b.id === blockId);
    if (!block) return;

    const dxPt = dxPx / effectiveScale;
    const dyPt = dyPx / effectiveScale;
    const [bx0, by0, bx1, by1] = block.bbox;
    const dragLeft = bx0 + dxPt, dragRight = bx1 + dxPt;
    const dragTop = by0 + dyPt, dragBottom = by1 + dyPt;
    const dragCx = (dragLeft + dragRight) / 2, dragCy = (dragTop + dragBottom) / 2;

    const lines: { type: 'h' | 'v'; pos: number }[] = [];
    const seenV = new Set<number>(), seenH = new Set<number>();

    for (const other of page.blocks) {
      if (other.id === blockId) continue;
      const [ox0, oy0, ox1, oy1] = other.bbox;
      const ocx = (ox0 + ox1) / 2, ocy = (oy0 + oy1) / 2;

      for (const [dv, ov] of [
        [dragLeft, ox0], [dragLeft, ox1], [dragRight, ox0], [dragRight, ox1],
        [dragCx, ocx], [dragLeft, ocx], [dragRight, ocx], [dragCx, ox0], [dragCx, ox1],
      ] as [number, number][]) {
        if (Math.abs(dv - ov) < SNAP_THRESHOLD) {
          const r = Math.round(ov * 10) / 10;
          if (!seenV.has(r)) { seenV.add(r); lines.push({ type: 'v', pos: ov }); }
        }
      }
      for (const [dh, oh] of [
        [dragTop, oy0], [dragTop, oy1], [dragBottom, oy0], [dragBottom, oy1],
        [dragCy, ocy], [dragTop, ocy], [dragBottom, ocy], [dragCy, oy0], [dragCy, oy1],
      ] as [number, number][]) {
        if (Math.abs(dh - oh) < SNAP_THRESHOLD) {
          const r = Math.round(oh * 10) / 10;
          if (!seenH.has(r)) { seenH.add(r); lines.push({ type: 'h', pos: oh }); }
        }
      }
    }

    const pageCx = page.width / 2, pageCy = page.height / 2;
    if (Math.abs(dragCx - pageCx) < SNAP_THRESHOLD) lines.push({ type: 'v', pos: pageCx });
    if (Math.abs(dragCy - pageCy) < SNAP_THRESHOLD) lines.push({ type: 'h', pos: pageCy });

    setGuidelines(lines);
  }, [page.blocks, page.width, page.height, effectiveScale]);

  const clearGuidelines = useCallback(() => setGuidelines([]), []);

  const zoomIn = useCallback(() => setZoomLevel(z => Math.min(z * 1.25, 5)), []);
  const zoomOut = useCallback(() => setZoomLevel(z => Math.max(z / 1.25, 0.2)), []);
  const zoomFit = useCallback(() => setZoomLevel(1), []);

  // Ctrl+wheel zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoomLevel(z => {
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        return Math.min(5, Math.max(0.2, z * delta));
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // Convert mouse event to PDF points relative to canvas
  const toPdfPt = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / effectiveScale,
      y: (e.clientY - rect.top) / effectiveScale,
    };
  }, [effectiveScale]);

  // Group mode: mouse handlers for selection rectangle
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!groupMode || addMode) return;
    // Only start drag from canvas background (not from text blocks)
    if (e.target !== canvasRef.current && e.target !== canvasRef.current?.querySelector('img')) {
      return;
    }
    e.preventDefault();
    const pt = toPdfPt(e);
    setSelStart(pt);
    setSelEnd(pt);
    draggingRef.current = true;
  }, [groupMode, addMode, toPdfPt]);

  // Store callbacks in refs to avoid effect re-runs
  const groupSelectedBlocksRef = useRef(groupSelectedBlocks);
  groupSelectedBlocksRef.current = groupSelectedBlocks;
  const onGroupSelectRef = useRef(onGroupSelect);
  onGroupSelectRef.current = onGroupSelect;
  const pageBlocksRef = useRef(page.blocks);
  pageBlocksRef.current = page.blocks;
  const selStartRef = useRef(selStart);
  selStartRef.current = selStart;
  const selEndRef = useRef(selEnd);
  selEndRef.current = selEnd;
  const toPdfPtRef = useRef(toPdfPt);
  toPdfPtRef.current = toPdfPt;

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const pt = toPdfPtRef.current(e as any);
      setSelEnd(pt);
    };

    const handleUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;

      const start = selStartRef.current;
      const end = selEndRef.current;
      if (start && end) {
        const x0 = Math.min(start.x, end.x);
        const y0 = Math.min(start.y, end.y);
        const x1 = Math.max(start.x, end.x);
        const y1 = Math.max(start.y, end.y);

        if (x1 - x0 > 5 && y1 - y0 > 5) {
          const newSelected = new Set(groupSelectedBlocksRef.current);
          for (const block of pageBlocksRef.current) {
            const cx = (block.bbox[0] + block.bbox[2]) / 2;
            const cy = (block.bbox[1] + block.bbox[3]) / 2;
            if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) {
              if (newSelected.has(block.id)) {
                newSelected.delete(block.id);
              } else {
                newSelected.add(block.id);
              }
            }
          }
          onGroupSelectRef.current(newSelected);
        }
      }
      setSelStart(null);
      setSelEnd(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []); // Stable — uses refs for all dynamic values

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (groupMode) return; // handled by mouseDown/mouseUp
    if (addMode && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const xPx = e.clientX - rect.left;
      const yPx = e.clientY - rect.top;
      const xPt = xPx / effectiveScale;
      const yPt = yPx / effectiveScale;
      const newId = onAddBlock(xPt, yPt);
      onSelectBlock(newId);
      onExitAddMode();
    } else {
      onSelectBlock(null);
    }
  };

  // Selection rectangle visual (screen pixels)
  const selRect = selStart && selEnd ? {
    left: Math.min(selStart.x, selEnd.x) * effectiveScale,
    top: Math.min(selStart.y, selEnd.y) * effectiveScale,
    width: Math.abs(selEnd.x - selStart.x) * effectiveScale,
    height: Math.abs(selEnd.y - selStart.y) * effectiveScale,
  } : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ZoomControls
        zoomLevel={zoomLevel}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomFit={zoomFit}
      />
      <div ref={containerRef} style={{
        flex: 1, overflow: 'auto',
        background: '#11111b',
      }}>
        <div style={{
          display: 'inline-flex',
          justifyContent: 'center',
          minWidth: '100%',
          padding: '10px 0',
        }}>
          <div
            ref={canvasRef}
            onClick={handleCanvasClick}
            onMouseDown={handleMouseDown}
            style={{
              position: 'relative',
              width: displayWidth,
              minWidth: displayWidth,
              height: displayHeight,
              flexShrink: 0,
              background: '#ffffff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              cursor: addMode ? 'crosshair' : groupMode ? 'crosshair' : 'default',
            }}
          >
          {/* Background image */}
          <img
            src={bgUrl}
            alt="Page background"
            style={{
              position: 'absolute',
              top: 0, left: 0,
              width: '100%', height: '100%',
              objectFit: 'fill',
              pointerEvents: 'none',
            }}
          />

          {/* Extracted images */}
          {page.images.map(img => {
            const [ix0, iy0, ix1, iy1] = img.bbox;
            return (
              <img
                key={img.id}
                src={getAssetUrl(projectId, img.path)}
                alt=""
                style={{
                  position: 'absolute',
                  left: ix0 * effectiveScale,
                  top: iy0 * effectiveScale,
                  width: (ix1 - ix0) * effectiveScale,
                  height: (iy1 - iy0) * effectiveScale,
                  pointerEvents: 'none',
                }}
              />
            );
          })}

          {/* Text blocks */}
          {page.blocks.map(block => (
            <TextBlock
              key={block.id}
              ref={(handle) => {
                if (handle) {
                  blockRefsMap.current.set(block.id, handle);
                  if (selectedBlock === block.id) onFormatRef?.(handle);
                } else {
                  blockRefsMap.current.delete(block.id);
                }
              }}
              block={block}
              scale={effectiveScale}
              selected={selectedBlock === block.id}
              grouped={groupSelectedBlocks.has(block.id)}
              onSelect={() => {
                if (groupMode) {
                  // In group mode, clicking a block toggles its selection
                  const newSet = new Set(groupSelectedBlocks);
                  if (newSet.has(block.id)) {
                    newSet.delete(block.id);
                  } else {
                    newSet.add(block.id);
                  }
                  onGroupSelect(newSet);
                } else {
                  onSelectBlock(block.id);
                }
              }}
              onMove={(dx, dy) => onMoveBlock(block.id, dx, dy, effectiveScale)}
              onResize={(bbox) => onResizeBlock(block.id, bbox)}
              onDelete={() => { onDeleteBlock(block.id); onSelectBlock(null); }}
              onTextChange={(li, si, text) => onTextChange(block.id, li, si, text)}
              onTextChangeAll={(text) => onTextChangeAll(block.id, text)}
              onUpdateLines={(lines) => onUpdateLines(block.id, lines)}
              onDrag={(dx, dy) => computeGuidelines(block.id, dx, dy)}
              onDragEnd={clearGuidelines}
            />
          ))}

          {/* Snap guidelines */}
          {guidelines.map((g, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                ...(g.type === 'v'
                  ? { left: g.pos * effectiveScale, top: 0, width: 1, height: '100%' }
                  : { top: g.pos * effectiveScale, left: 0, height: 1, width: '100%' }),
                background: '#ff69b4',
                pointerEvents: 'none',
                zIndex: 300,
              }}
            />
          ))}

          {/* Selection rectangle overlay */}
          {selRect && (
            <div style={{
              position: 'absolute',
              left: selRect.left,
              top: selRect.top,
              width: selRect.width,
              height: selRect.height,
              border: '2px dashed #cba6f7',
              background: 'rgba(203, 166, 247, 0.1)',
              pointerEvents: 'none',
              zIndex: 400,
            }} />
          )}

          {/* Add mode indicator */}
          {addMode && (
            <div style={{
              position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
              background: '#89b4fa', color: '#1e1e2e',
              padding: '4px 12px', borderRadius: 4,
              fontSize: 12, fontWeight: 600, zIndex: 500,
              pointerEvents: 'none',
            }}>
              Click to place text box
            </div>
          )}

          {/* Group mode indicator */}
          {groupMode && !selStart && (
            <div style={{
              position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
              background: '#cba6f7', color: '#1e1e2e',
              padding: '4px 12px', borderRadius: 4,
              fontSize: 12, fontWeight: 600, zIndex: 500,
              pointerEvents: 'none',
            }}>
              Draw rectangle or click blocks to select
            </div>
          )}

          {/* Floating action bar for group selection */}
          {groupMode && groupSelectedBlocks.size > 0 && (
            <div style={{
              position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
              display: 'flex', gap: 8, alignItems: 'center',
              background: '#1e1e2e', padding: '8px 16px', borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              zIndex: 500,
            }}>
              <span style={{ color: '#cdd6f4', fontSize: 13, fontWeight: 600 }}>
                {groupSelectedBlocks.size} blocks selected
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onTranslateGroup(); }}
                style={{
                  padding: '5px 12px', borderRadius: 6, border: 'none',
                  background: '#a6e3a1', color: '#1e1e2e',
                  fontWeight: 600, fontSize: 12, cursor: 'pointer',
                }}
              >
                Translate Group
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onCancelGroup(); }}
                style={{
                  padding: '5px 12px', borderRadius: 6, border: 'none',
                  background: '#f38ba8', color: '#1e1e2e',
                  fontWeight: 600, fontSize: 12, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
