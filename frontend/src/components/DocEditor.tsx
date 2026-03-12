import { useRef, useState, useEffect } from 'react';
import type { Page } from '../types/project';
import TextBlock from './TextBlock';
import { getAssetUrl } from '../api/client';

interface DocEditorProps {
  page: Page;
  projectId: string;
  addMode: boolean;
  onMoveBlock: (blockId: string, dx: number, dy: number, scale: number) => void;
  onResizeBlock: (blockId: string, newBbox: number[]) => void;
  onDeleteBlock: (blockId: string) => void;
  onAddBlock: (xPt: number, yPt: number) => string;
  onTextChange: (blockId: string, lineIdx: number, spanIdx: number, text: string) => void;
  onExitAddMode: () => void;
}

export default function DocEditor({
  page, projectId, addMode,
  onMoveBlock, onResizeBlock, onDeleteBlock, onAddBlock, onTextChange, onExitAddMode,
}: DocEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(500);
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);

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

  const scale = (containerWidth - 20) / page.width;
  const displayHeight = page.height * scale;
  const bgUrl = getAssetUrl(projectId, page.background_image);

  const handleCanvasClick = (e: React.MouseEvent) => {
    // Clicked on canvas background (not on a block)
    if (addMode && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const xPx = e.clientX - rect.left;
      const yPx = e.clientY - rect.top;
      const xPt = xPx / scale;
      const yPt = yPx / scale;
      const newId = onAddBlock(xPt, yPt);
      setSelectedBlock(newId);
      onExitAddMode();
    } else {
      setSelectedBlock(null);
    }
  };

  return (
    <div ref={containerRef} style={{
      overflow: 'auto', height: '100%',
      display: 'flex', justifyContent: 'center',
      background: '#11111b',
    }}>
      <div
        ref={canvasRef}
        onClick={handleCanvasClick}
        style={{
          position: 'relative',
          width: containerWidth - 20,
          height: displayHeight,
          margin: '10px 0',
          background: '#ffffff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          cursor: addMode ? 'crosshair' : 'default',
        }}
      >
        {/* Background image (text-stripped page render) */}
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

        {/* Extracted images at their positions */}
        {page.images.map(img => {
          const [ix0, iy0, ix1, iy1] = img.bbox;
          return (
            <img
              key={img.id}
              src={getAssetUrl(projectId, img.path)}
              alt=""
              style={{
                position: 'absolute',
                left: ix0 * scale,
                top: iy0 * scale,
                width: (ix1 - ix0) * scale,
                height: (iy1 - iy0) * scale,
                pointerEvents: 'none',
              }}
            />
          );
        })}

        {/* Text blocks */}
        {page.blocks.map(block => (
          <TextBlock
            key={block.id}
            block={block}
            scale={scale}
            selected={selectedBlock === block.id}
            onSelect={() => setSelectedBlock(block.id)}
            onMove={(dx, dy) => onMoveBlock(block.id, dx, dy, scale)}
            onResize={(bbox) => onResizeBlock(block.id, bbox)}
            onDelete={() => { onDeleteBlock(block.id); setSelectedBlock(null); }}
            onTextChange={(li, si, text) => onTextChange(block.id, li, si, text)}
          />
        ))}

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
      </div>
    </div>
  );
}
