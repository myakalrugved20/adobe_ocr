import { useRef, useState, useEffect } from 'react';
import Draggable from 'react-draggable';
import type { Block } from '../types/project';

interface TextBlockProps {
  block: Block;
  scale: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (dx: number, dy: number) => void;
  onResize: (newBbox: number[]) => void;
  onDelete: () => void;
  onTextChange: (lineIdx: number, spanIdx: number, text: string) => void;
}

export default function TextBlock({
  block, scale, selected, onSelect, onMove, onResize, onDelete, onTextChange,
}: TextBlockProps) {
  const [editing, setEditing] = useState(false);
  const [resizing, setResizing] = useState<string | null>(null);
  const nodeRef = useRef<HTMLDivElement>(null!);
  const startRef = useRef({ x: 0, y: 0, bbox: [0, 0, 0, 0] });

  const [x0, y0, x1, y1] = block.bbox;
  const left = x0 * scale;
  const top = y0 * scale;
  const width = (x1 - x0) * scale;
  const height = (y1 - y0) * scale;

  // Handle keyboard delete
  useEffect(() => {
    if (!selected || editing) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!editing) {
          e.preventDefault();
          onDelete();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected, editing, onDelete]);

  // Handle resize drag
  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const { x: sx, y: sy, bbox } = startRef.current;
      const dx = (e.clientX - sx) / scale;
      const dy = (e.clientY - sy) / scale;
      const [bx0, by0, bx1, by1] = bbox;

      let nx0 = bx0, ny0 = by0, nx1 = bx1, ny1 = by1;
      if (resizing.includes('e')) nx1 = Math.max(bx0 + 20, bx1 + dx);
      if (resizing.includes('w')) nx0 = Math.min(bx1 - 20, bx0 + dx);
      if (resizing.includes('s')) ny1 = Math.max(by0 + 10, by1 + dy);
      if (resizing.includes('n')) ny0 = Math.min(by1 - 10, by0 + dy);

      onResize([nx0, ny0, nx1, ny1]);
    };

    const handleMouseUp = () => setResizing(null);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, scale, onResize]);

  const startResize = (handle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    startRef.current = { x: e.clientX, y: e.clientY, bbox: [...block.bbox] };
    setResizing(handle);
  };

  const handleCorner = (pos: string): React.CSSProperties => ({
    position: 'absolute',
    width: 8, height: 8,
    background: '#89b4fa',
    border: '1px solid #1e1e2e',
    borderRadius: 1,
    cursor: pos === 'nw' || pos === 'se' ? 'nwse-resize'
      : pos === 'ne' || pos === 'sw' ? 'nesw-resize'
      : pos === 'n' || pos === 's' ? 'ns-resize' : 'ew-resize',
    ...(pos.includes('n') ? { top: -4 } : {}),
    ...(pos.includes('s') ? { bottom: -4 } : {}),
    ...(pos.includes('w') ? { left: -4 } : {}),
    ...(pos.includes('e') ? { right: -4 } : {}),
    ...(pos === 'n' || pos === 's' ? { left: '50%', marginLeft: -4 } : {}),
    ...(pos === 'w' || pos === 'e' ? { top: '50%', marginTop: -4 } : {}),
    zIndex: 200,
  });

  return (
    <Draggable
      nodeRef={nodeRef as any}
      disabled={editing || !!resizing}
      position={{ x: 0, y: 0 }}
      onStart={() => onSelect()}
      onStop={(_e, data) => {
        if (data.x !== 0 || data.y !== 0) {
          onMove(data.x, data.y);
        }
      }}
    >
      <div
        ref={nodeRef}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        onDoubleClick={() => setEditing(true)}
        style={{
          position: 'absolute',
          left, top, width,
          minHeight: height,
          cursor: editing ? 'text' : 'move',
          outline: selected ? '2px solid #89b4fa' : 'none',
          background: 'transparent',
          zIndex: selected ? 100 : 10,
          boxSizing: 'border-box',
          padding: 0,
        }}
      >
        {/* Resize handles — only when selected and not editing */}
        {selected && !editing && (
          <>
            {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(pos => (
              <div
                key={pos}
                style={handleCorner(pos)}
                onMouseDown={(e) => startResize(pos, e)}
              />
            ))}
            {/* Delete button */}
            <div
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="Delete text box"
              style={{
                position: 'absolute', top: -20, right: -2,
                width: 16, height: 16,
                background: '#f38ba8', color: '#1e1e2e',
                borderRadius: 3, fontSize: 11, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', zIndex: 200,
                lineHeight: 1,
              }}
            >
              X
            </div>
          </>
        )}

        {/* Text content */}
        {block.lines.map((line, li) => (
          <div key={li} style={{ display: 'flex', flexWrap: 'wrap' }}>
            {line.spans.map((span, si) => {
              const fontSize = Math.max(span.size * scale * 0.75, 6);
              return editing ? (
                <input
                  key={si}
                  value={span.text}
                  onChange={e => onTextChange(li, si, e.target.value)}
                  autoFocus={li === 0 && si === 0}
                  onKeyDown={e => {
                    if (e.key === 'Escape') setEditing(false);
                  }}
                  style={{
                    fontSize,
                    fontFamily: span.font + ', Arial, sans-serif',
                    fontWeight: span.bold ? 'bold' : 'normal',
                    fontStyle: span.italic ? 'italic' : 'normal',
                    color: '#' + span.color,
                    background: 'rgba(255,255,255,0.95)',
                    border: '1px solid #89b4fa',
                    borderRadius: 2,
                    outline: 'none',
                    padding: '1px 3px',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                />
              ) : (
                <span
                  key={si}
                  style={{
                    fontSize,
                    fontFamily: span.font + ', Arial, sans-serif',
                    fontWeight: span.bold ? 'bold' : 'normal',
                    fontStyle: span.italic ? 'italic' : 'normal',
                    color: '#' + span.color,
                    lineHeight: 1.2,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {span.text}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </Draggable>
  );
}
