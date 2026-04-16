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
  block, scale, selected, grouped, onSelect, onMove, onResize, onDelete, onTextChange: _onTextChange, onTextChangeAll, onUpdateLines, onDrag, onDragEnd,
}, ref) {
  const [editing, setEditing] = useState(false);
  const [resizing, setResizing] = useState<string | null>(null);
  const nodeRef = useRef<HTMLDivElement>(null!);
  const editRef = useRef<HTMLDivElement>(null);
  const startRef = useRef({ x: 0, y: 0, bbox: [0, 0, 0, 0] });
  const lastRangeRef = useRef<Range | null>(null);
  const fsWrapperRef = useRef<HTMLElement | null>(null);

  // Track last known selection inside the editable, so PropertiesPanel inputs
  // that steal focus can still have their formatting applied correctly.
  useEffect(() => {
    if (!editing) { fsWrapperRef.current = null; return; }
    const save = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !editRef.current) return;
      const range = sel.getRangeAt(0);
      if (editRef.current.contains(range.commonAncestorContainer)) {
        lastRangeRef.current = range.cloneRange();
      }
    };
    document.addEventListener('selectionchange', save);
    return () => document.removeEventListener('selectionchange', save);
  }, [editing]);

  // Clear the fontSize wrapper when the user explicitly starts a new
  // interaction inside the editable (click or key). This keeps the wrapper
  // alive across slider ticks (which fire via focus-stealing inputs) but
  // abandons it when the user re-selects / moves the caret themselves.
  useEffect(() => {
    if (!editing) return;
    const el = editRef.current;
    if (!el) return;
    const clear = () => { fsWrapperRef.current = null; };
    el.addEventListener('mousedown', clear);
    el.addEventListener('keydown', clear);
    return () => {
      el.removeEventListener('mousedown', clear);
      el.removeEventListener('keydown', clear);
    };
  }, [editing]);

  useImperativeHandle(ref, () => ({
    isEditing: () => editing,
    applyFormat: (command: string, value?: string) => {
      if (!editing || !editRef.current) return;

      // fontSize uses direct DOM wrapping against the saved range — this avoids
      // stealing focus from the slider/stepper, which would abort a drag.
      if (command === 'fontSize' && value) {
        const pt = parseFloat(value);
        if (!(pt > 0)) return;
        const px = Math.max(pt * scale * 0.75, 6);

        // If we already have a live wrapper from this size-change session,
        // just mutate its font-size. The wrapper is only abandoned when the
        // user changes selection (see selectionchange listener).
        const existing = fsWrapperRef.current;
        if (existing && editRef.current.contains(existing)) {
          existing.style.fontSize = px + 'px';
          return;
        }

        // First tick: wrap the saved range in a new span.
        const range = lastRangeRef.current;
        if (!range || range.collapsed) return;
        if (!editRef.current.contains(range.commonAncestorContainer)) return;

        try {
          const contents = range.extractContents();
          contents.querySelectorAll('[style*="font-size"]').forEach(el => {
            (el as HTMLElement).style.fontSize = '';
          });
          const wrapper = document.createElement('span');
          wrapper.style.fontSize = px + 'px';
          wrapper.appendChild(contents);
          range.insertNode(wrapper);
          fsWrapperRef.current = wrapper;
        } catch { /* ignore */ }
        return;
      }

      // Other commands (bold/italic/underline/sub/super) use execCommand, which
      // requires focus + a selection inside the editable.
      const sel = window.getSelection();
      const selInside = sel && sel.rangeCount > 0 &&
        editRef.current.contains(sel.getRangeAt(0).commonAncestorContainer);
      editRef.current.focus();
      if (!selInside && lastRangeRef.current) {
        sel?.removeAllRanges();
        sel?.addRange(lastRangeRef.current);
      }
      document.execCommand(command, false, value);
    },
  }), [editing, scale]);

  const [x0, y0, x1, _y1] = block.bbox;
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

    const findSubSup = (el: HTMLElement | null): 'sub' | 'super' | null => {
      let cur: HTMLElement | null = el;
      while (cur && cur !== editRef.current) {
        if (cur.tagName === 'SUB') return 'sub';
        if (cur.tagName === 'SUP') return 'super';
        cur = cur.parentElement;
      }
      return null;
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
        if (px > 0) size = Math.round(px / scale / 0.75 * 100) / 100; // px to pt (reverse of span.size * scale * 0.75)
      }

      const subSup = findSubSup(el);

      return {
        font: computed.fontFamily?.split(',')[0]?.replace(/['"]/g, '').trim() || defaults.font,
        size,
        color,
        bold: computed.fontWeight === 'bold' || parseInt(computed.fontWeight) >= 700,
        italic: computed.fontStyle === 'italic',
        underline: computed.textDecorationLine?.includes('underline') || false,
        subscript: subSup === 'sub',
        superscript: subSup === 'super',
      };
    };

    const lines: Block['lines'] = [];
    let currentLineSpans: Block['lines'][0]['spans'] = [];

    const flushLine = () => {
      lines.push({
        spans: currentLineSpans.length ? currentLineSpans : [{ text: '', bbox: [...block.bbox], ...defaults }],
        bbox: [...block.bbox],
      });
      currentLineSpans = [];
    };

    // Walk children: handle TEXT nodes, BR, and block wrappers (DIV/P the browser may insert)
    const walk = (node: Node) => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          const text = child.textContent || '';
          if (!text) continue;
          const parent = child.parentElement;
          if (!parent) continue;
          const style = getStyle(parent);
          const parts = text.split('\n');
          parts.forEach((part, i) => {
            if (i > 0) flushLine();
            if (part) currentLineSpans.push({ text: part, bbox: [...block.bbox], ...style });
          });
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const el = child as HTMLElement;
          if (el.tagName === 'BR') {
            flushLine();
          } else if (el.tagName === 'DIV' || el.tagName === 'P') {
            if (currentLineSpans.length > 0) flushLine();
            walk(el);
            if (currentLineSpans.length > 0) flushLine();
          } else {
            walk(el);
          }
        }
      }
    };
    walk(editRef.current);
    if (currentLineSpans.length > 0) flushLine();

    return lines.length > 0 ? lines : null;
  }, [block, scale]);

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
    }
    setEditing(false);
  }, [onTextChangeAll, onUpdateLines, parseEditableToLines]);

  // Delayed blur: don't exit if focus moved to a PropertiesPanel control
  const handleBlur = useCallback(() => {
    setTimeout(() => {
      const active = document.activeElement;
      if (!active) { exitEdit(); return; }
      // If focus moved to an input, button, select, or textarea (PropertiesPanel), stay in edit mode
      const tag = active.tagName;
      if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      // If focus moved to another contentEditable (not ours), exit
      if ((active as HTMLElement).isContentEditable && active !== editRef.current) { exitEdit(); return; }
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

  // Build initial HTML preserving per-span styles so parseEditableToLines can recover them
  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const initialHtml = block.lines.map(line =>
    line.spans.map(span => {
      const size = Math.max(span.size * scale * 0.75, 6);
      const decls = [
        `font-size:${size}px`,
        `font-family:${span.font || 'Arial'}, Arial, sans-serif`,
        `font-weight:${span.bold ? 'bold' : 'normal'}`,
        `font-style:${span.italic ? 'italic' : 'normal'}`,
        `color:#${span.color || '000000'}`,
        span.underline ? 'text-decoration:underline' : '',
      ].filter(Boolean).join(';');
      let body = escapeHtml(span.text);
      if (span.subscript) body = `<sub>${body}</sub>`;
      else if (span.superscript) body = `<sup>${body}</sup>`;
      return `<span style="${decls}">${body}</span>`;
    }).join('') || '<br>'
  ).join('<br>');

  // Fallback defaults for the editor container (used for newly-typed text)
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
          overflow: 'hidden',
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

        {/* Neutralize UA sub/sup font-size so edit→exit round-trip doesn't shrink text
            (Word's <w:vertAlign> handles the actual size reduction in the .docx). */}
        <style>{`
          .tb-edit sub, .tb-edit sup, .tb-view sub, .tb-view sup {
            font-size: inherit;
            line-height: 0;
            position: relative;
            vertical-align: baseline;
          }
          .tb-edit sub, .tb-view sub { top: 0.3em; }
          .tb-edit sup, .tb-view sup { top: -0.4em; }
        `}</style>

        {/* Text content */}
        {editing ? (
          <div
            ref={editRef}
            className="tb-edit"
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
              background: 'transparent',
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
            dangerouslySetInnerHTML={{ __html: initialHtml }}
          />
        ) : (
          block.lines.map((line, li) => (
            <div key={li} className="tb-view" style={{
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
                const content = span.subscript ? <sub>{span.text}</sub>
                  : span.superscript ? <sup>{span.text}</sup>
                  : span.text;
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
                    {content}
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
