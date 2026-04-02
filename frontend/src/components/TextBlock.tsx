import { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import Draggable from 'react-draggable';
import type { Block } from '../types/project';

export interface TextBlockHandle {
  isEditing: () => boolean;
  applyFormat: (command: string, value?: string) => void;
}

interface TextBlockProps {
  block: Block;
  scale: number;
  selected: boolean;
  grouped?: boolean;
  onSelect: () => void;
  onMove: (dx: number, dy: number) => void;
  onResize: (newBbox: number[]) => void;
  onDelete: () => void;
  onTextChange: (lineIdx: number, spanIdx: number, text: string) => void;
  onTextChangeAll: (text: string) => void;
  onUpdateLines?: (lines: Block['lines']) => void;
  onDrag?: (dx: number, dy: number) => void;
  onDragEnd?: () => void;
}

const TextBlock = forwardRef<TextBlockHandle, TextBlockProps>(function TextBlock({
  block, scale, selected, grouped, onSelect, onMove, onResize, onDelete, onTextChange, onTextChangeAll, onUpdateLines, onDrag, onDragEnd,
}, ref) {
  const [editing, setEditing] = useState(false);
  const [resizing, setResizing] = useState<string | null>(null);
  const nodeRef = useRef<HTMLDivElement>(null!);
  const editRef = useRef<HTMLDivElement>(null);
  const startRef = useRef({ x: 0, y: 0, bbox: [0, 0, 0, 0] });

  useImperativeHandle(ref, () => ({
    isEditing: () => editing,
    applyFormat: (command: string, value?: string) => {
      if (!editing || !editRef.current) return;
      editRef.current.focus();

      if (command === 'fontSize' && value) {
        // execCommand fontSize only supports 1-7, so use a workaround:
        // Apply size 7 as a marker, then replace with the real CSS size
        document.execCommand('fontSize', false, '7');
        editRef.current.querySelectorAll('font[size="7"]').forEach(el => {
          const span = document.createElement('span');
          span.style.fontSize = value + 'px';
          span.innerHTML = el.innerHTML;
          el.replaceWith(span);
        });
      } else {
        document.execCommand(command, false, value);
      }
    },
  }), [editing]);

  const [x0, y0, x1, y1] = block.bbox;
  const left = x0 * scale;
  const top = y0 * scale;
  const width = (x1 - x0) * scale;
  const opacity = block.opacity ?? 1;

  // Handle keyboard delete
  useEffect(() => {
    if (!selected || editing) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (e.target as HTMLElement)?.tagName;
        const isEditable = (e.target as HTMLElement)?.isContentEditable;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || isEditable) return;
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

  // Enter edit mode
  const enterEdit = useCallback(() => {
    setEditing(true);
    // Focus the contentEditable after render
    requestAnimationFrame(() => {
      if (editRef.current) {
        editRef.current.focus();
      }
    });
  }, []);

  // Parse contentEditable HTML into span structures
  const parseEditableToLines = useCallback(() => {
    if (!editRef.current) return null;
    const firstSpan = block.lines[0]?.spans[0];
    const defaults = {
      font: firstSpan?.font || 'Arial',
      size: firstSpan?.size || 11,
      color: firstSpan?.color || '000000',
      bold: firstSpan?.bold || false,
      italic: firstSpan?.italic || false,
      underline: firstSpan?.underline || false,
    };

    const getStyle = (el: HTMLElement) => {
      const computed = window.getComputedStyle(el);
      const colorRaw = computed.color;
      let color = defaults.color;
      // Parse rgb(r,g,b) to hex
      const match = colorRaw.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        color = [match[1], match[2], match[3]]
          .map(n => parseInt(n).toString(16).padStart(2, '0'))
          .join('');
      }

      const fontSizeStr = computed.fontSize;
      let size = defaults.size;
      if (fontSizeStr) {
        const px = parseFloat(fontSizeStr);
        if (px > 0) size = Math.round(px / 0.75 * 100) / 100; // px to pt (reverse of scale * 0.75)
      }

      return {
        font: computed.fontFamily?.split(',')[0]?.replace(/['"]/g, '').trim() || defaults.font,
        size,
        color,
        bold: computed.fontWeight === 'bold' || parseInt(computed.fontWeight) >= 700,
        italic: computed.fontStyle === 'italic',
        underline: computed.textDecorationLine?.includes('underline') || false,
      };
    };

    // Walk text nodes to build spans
    const lines: Block['lines'] = [];
    const walker = document.createTreeWalker(editRef.current, NodeFilter.SHOW_TEXT);
    let currentLineSpans: Block['lines'][0]['spans'] = [];

    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.textContent || '';
      if (!text) continue;

      const parent = node.parentElement;
      if (!parent) continue;

      const style = getStyle(parent);
      const parts = text.split('\n');

      parts.forEach((part, i) => {
        if (i > 0) {
          // Line break: flush current line
          lines.push({ spans: currentLineSpans.length ? currentLineSpans : [{ text: '', bbox: [...block.bbox], ...defaults }], bbox: [...block.bbox] });
          currentLineSpans = [];
        }
        if (part) {
          currentLineSpans.push({
            text: part,
            bbox: [...block.bbox],
            ...style,
          });
        }
      });
    }

    // Flush last line
    if (currentLineSpans.length > 0) {
      lines.push({ spans: currentLineSpans, bbox: [...block.bbox] });
    }

    return lines.length > 0 ? lines : null;
  }, [block]);

  // Exit edit mode, save text, and resize bbox to fit content
  const exitEdit = useCallback(() => {
    if (editRef.current) {
      // Try to preserve rich formatting
      const parsedLines = parseEditableToLines();
      if (parsedLines && onUpdateLines) {
        onUpdateLines(parsedLines);
      } else {
        const text = editRef.current.innerText || '';
        onTextChangeAll(text);
      }

      // Update bbox to match the rendered size of the edit area
      const el = nodeRef.current;
      if (el) {
        const newWidthPt = el.offsetWidth / scale;
        const newHeightPt = el.offsetHeight / scale;
        onResize([x0, y0, x0 + newWidthPt, y0 + newHeightPt]);
      }
    }
    setEditing(false);
  }, [onTextChangeAll, onUpdateLines, parseEditableToLines, onResize, scale, x0, y0]);

  // Delayed blur: don't exit if focus moved to a PropertiesPanel control
  const handleBlur = useCallback(() => {
    setTimeout(() => {
      const active = document.activeElement;
      if (!active) { exitEdit(); return; }
      // If focus moved to an input, button, select, or textarea (PropertiesPanel), stay in edit mode
      const tag = active.tagName;
      if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      // If focus moved to another contentEditable (not ours), exit
      if (active.isContentEditable && active !== editRef.current) { exitEdit(); return; }
      // If focus is still in our contentEditable, stay
      if (editRef.current?.contains(active)) return;
      exitEdit();
    }, 100);
  }, [exitEdit]);

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

  // Get all text for contentEditable initial value
  const allText = block.lines.map(l => l.spans.map(s => s.text).join('')).join('\n');
  // Get dominant style for display in edit mode
  const firstSpan = block.lines[0]?.spans[0];
  const editFontSize = firstSpan ? Math.max(firstSpan.size * scale * 0.75, 6) : 10;
  const editFont = firstSpan?.font || 'Arial';
  const editColor = firstSpan ? '#' + firstSpan.color : '#000000';
  const editBold = firstSpan?.bold ?? false;
  const editItalic = firstSpan?.italic ?? false;

  return (
    <Draggable
      nodeRef={nodeRef as any}
      disabled={editing || !!resizing}
      position={{ x: 0, y: 0 }}
      onStart={() => onSelect()}
      onDrag={(_e, data) => {
        onDrag?.(data.x, data.y);
      }}
      onStop={(_e, data) => {
        onDragEnd?.();
        if (data.x !== 0 || data.y !== 0) {
          onMove(data.x, data.y);
        }
      }}
    >
      <div
        ref={nodeRef}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        onDoubleClick={() => !editing && enterEdit()}
        style={{
          position: 'absolute',
          left, top,
          width: editing ? undefined : width,
          minWidth: editing ? width : undefined,
          minHeight: 4,
          cursor: editing ? 'text' : 'move',
          outline: selected ? '2px solid #89b4fa' : grouped ? '2px solid #a6e3a1' : 'none',
          background: grouped && !selected ? 'rgba(166, 227, 161, 0.1)' : 'transparent',
          zIndex: selected ? 100 : 10,
          boxSizing: 'border-box',
          padding: 0,
          opacity,
        }}
      >
        {/* Resize handles */}
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
        {editing ? (
          <div
            ref={editRef}
            contentEditable
            suppressContentEditableWarning
            onBlur={handleBlur}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.preventDefault();
                exitEdit();
              }
            }}
            style={{
              minHeight: 10,
              fontSize: editFontSize,
              fontFamily: editFont + ', Arial, sans-serif',
              fontWeight: editBold ? 'bold' : 'normal',
              fontStyle: editItalic ? 'italic' : 'normal',
              color: editColor,
              background: 'rgba(255,255,255,0.95)',
              border: '1px solid #89b4fa',
              borderRadius: 2,
              outline: 'none',
              padding: '2px 3px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflowWrap: 'break-word',
              lineHeight: 1.2,
              textAlign: block.align || 'left',
            }}
            dangerouslySetInnerHTML={{ __html: allText.replace(/\n/g, '<br>') }}
          />
        ) : (
          block.lines.map((line, li) => (
            <div key={li} style={{
              display: 'flex', flexWrap: 'wrap',
              justifyContent: block.align === 'center' ? 'center'
                : block.align === 'right' ? 'flex-end'
                : block.align === 'justify' ? 'space-between'
                : 'flex-start',
              textAlign: block.align || 'left',
              overflowWrap: 'break-word', wordBreak: 'break-word',
            }}>
              {line.spans.map((span, si) => {
                const fontSize = Math.max(span.size * scale * 0.75, 6);
                return (
                  <span
                    key={si}
                    style={{
                      fontSize,
                      fontFamily: span.font + ', Arial, sans-serif',
                      fontWeight: span.bold ? 'bold' : 'normal',
                      fontStyle: span.italic ? 'italic' : 'normal',
                      textDecoration: span.underline ? 'underline' : 'none',
                      color: '#' + span.color,
                      lineHeight: 1.2,
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'break-word',
                      wordBreak: 'break-word',
                    }}
                  >
                    {span.text}
                  </span>
                );
              })}
            </div>
          ))
        )}
      </div>
    </Draggable>
  );
});

export default TextBlock;
