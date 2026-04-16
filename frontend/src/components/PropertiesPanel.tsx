import { useEffect, useMemo, useState } from 'react';
import type { Block } from '../types/project';

interface PropertiesPanelProps {
  block: Block;
  onChangeProperty: (prop: string, value: any) => void;
  onChangePosition: (x: number, y: number) => void;
  onChangeOpacity: (opacity: number) => void;
  onChangeAllText: (text: string) => void;
  onChangeAlign: (align: 'left' | 'center' | 'right' | 'justify') => void;
  onApplySelectionFormat?: (command: string, value?: string) => boolean;
}

function getDominant(block: Block) {
  const fonts: Record<string, number> = {};
  const sizes: Record<string, number> = {};
  const colors: Record<string, number> = {};
  let boldCount = 0, italicCount = 0, underlineCount = 0, subCount = 0, superCount = 0, total = 0;

  for (const line of block.lines) {
    for (const span of line.spans) {
      total++;
      fonts[span.font] = (fonts[span.font] || 0) + 1;
      sizes[String(span.size)] = (sizes[String(span.size)] || 0) + 1;
      colors[span.color] = (colors[span.color] || 0) + 1;
      if (span.bold) boldCount++;
      if (span.italic) italicCount++;
      if (span.underline) underlineCount++;
      if (span.subscript) subCount++;
      if (span.superscript) superCount++;
    }
  }

  const topKey = (map: Record<string, number>) =>
    Object.entries(map).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

  return {
    font: topKey(fonts) || 'Arial',
    size: Number(topKey(sizes)) || 11,
    color: topKey(colors) || '000000',
    bold: boldCount > total / 2,
    italic: italicCount > total / 2,
    underline: underlineCount > total / 2,
    subscript: subCount > total / 2,
    superscript: superCount > total / 2,
  };
}

function getAllText(block: Block) {
  return block.lines.map(l => l.spans.map(s => s.text).join('')).join('\n');
}

const FONTS = [
  'Arial', 'Helvetica', 'Times New Roman', 'Georgia',
  'Verdana', 'Courier New', 'Trebuchet MS', 'Tahoma',
];

const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: '#a6adc8',
  marginBottom: 4, textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
};

const sectionStyle: React.CSSProperties = {
  marginBottom: 12,
};

const btnBase: React.CSSProperties = {
  width: 32, height: 28,
  border: '1px solid #45475a',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 13,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

export default function PropertiesPanel({
  block, onChangeProperty, onChangePosition, onChangeOpacity, onChangeAllText, onChangeAlign, onApplySelectionFormat,
}: PropertiesPanelProps) {
  const dom = useMemo(() => getDominant(block), [block]);
  const text = useMemo(() => getAllText(block), [block]);
  const opacity = block.opacity ?? 1;

  // Local UI state for the size slider/stepper. During selection-based editing
  // we mutate the contentEditable DOM directly, without updating block state,
  // so this decouples the control's displayed value from dom.size.
  const [uiSize, setUiSize] = useState(dom.size);
  useEffect(() => { setUiSize(dom.size); }, [dom.size, block.id]);

  return (
    <div style={{
      width: 220, flexShrink: 0,
      background: '#181825',
      borderRight: '1px solid #313244',
      padding: '12px 10px',
      overflowY: 'auto',
      color: '#cdd6f4',
      fontSize: 12,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#89b4fa', marginBottom: 14, textTransform: 'uppercase' }}>
        Properties
      </div>

      {/* TEXT */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Text</div>
        <textarea
          value={text}
          onChange={e => onChangeAllText(e.target.value)}
          rows={4}
          style={{
            width: '100%', resize: 'vertical',
            background: '#1e1e2e', color: '#cdd6f4',
            border: '1px solid #45475a', borderRadius: 4,
            padding: '6px 8px', fontSize: 12,
            fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* FONT SIZE */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Font Size</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="range" min={4} max={200} step={0.5}
            value={uiSize}
            onChange={e => {
              const v = Number(e.target.value);
              setUiSize(v);
              if (!onApplySelectionFormat?.('fontSize', String(v))) {
                onChangeProperty('size', v);
              }
            }}
            style={{ flex: 1, accentColor: '#89b4fa' }}
          />
          <input
            type="number" min={1} max={400} step={1}
            value={Number.isInteger(uiSize) ? uiSize : Number(uiSize.toFixed(1))}
            onChange={e => {
              const v = Number(e.target.value);
              if (v <= 0) return;
              setUiSize(v);
              if (!onApplySelectionFormat?.('fontSize', String(v))) {
                onChangeProperty('size', v);
              }
            }}
            style={{
              width: 42, padding: '3px 4px',
              background: '#1e1e2e', color: '#cdd6f4',
              border: '1px solid #45475a', borderRadius: 4,
              fontSize: 12, fontWeight: 600, textAlign: 'center',
              boxSizing: 'border-box',
            }}
          />
          <span style={{ fontSize: 10, color: '#6c7086', fontWeight: 600 }}>PT</span>
        </div>
      </div>

      {/* COLOR */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Color</div>
        <input
          type="color"
          value={'#' + dom.color}
          onChange={e => {
            if (!onApplySelectionFormat?.('foreColor', e.target.value)) {
              onChangeProperty('color', e.target.value.slice(1));
            }
          }}
          style={{
            width: '100%', height: 30,
            border: '1px solid #45475a', borderRadius: 4,
            background: '#1e1e2e', cursor: 'pointer',
            padding: 2,
          }}
        />
      </div>

      {/* FONT FAMILY */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Font Family</div>
        <select
          value={dom.font}
          onMouseDown={e => e.stopPropagation()}
          onChange={e => {
            if (!onApplySelectionFormat?.('fontName', e.target.value)) {
              onChangeProperty('font', e.target.value);
            }
          }}
          style={{
            width: '100%', padding: '5px 6px',
            background: '#1e1e2e', color: '#cdd6f4',
            border: '1px solid #45475a', borderRadius: 4,
            fontSize: 12, cursor: 'pointer',
          }}
        >
          {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
          {!FONTS.includes(dom.font) && <option value={dom.font}>{dom.font}</option>}
        </select>
      </div>

      {/* B / I / U */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Style</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              if (!onApplySelectionFormat?.('bold')) onChangeProperty('bold', !dom.bold);
            }}
            style={{
              ...btnBase,
              fontWeight: 700,
              background: dom.bold ? '#89b4fa' : '#1e1e2e',
              color: dom.bold ? '#1e1e2e' : '#cdd6f4',
            }}
          >B</button>
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              if (!onApplySelectionFormat?.('italic')) onChangeProperty('italic', !dom.italic);
            }}
            style={{
              ...btnBase,
              fontStyle: 'italic',
              background: dom.italic ? '#89b4fa' : '#1e1e2e',
              color: dom.italic ? '#1e1e2e' : '#cdd6f4',
            }}
          >I</button>
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              if (!onApplySelectionFormat?.('underline')) onChangeProperty('underline', !dom.underline);
            }}
            style={{
              ...btnBase,
              textDecoration: 'underline',
              background: dom.underline ? '#89b4fa' : '#1e1e2e',
              color: dom.underline ? '#1e1e2e' : '#cdd6f4',
            }}
          >U</button>
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              if (!onApplySelectionFormat?.('subscript')) onChangeProperty('subscript', !dom.subscript);
            }}
            title="Subscript"
            style={{
              ...btnBase,
              background: dom.subscript ? '#89b4fa' : '#1e1e2e',
              color: dom.subscript ? '#1e1e2e' : '#cdd6f4',
            }}
          >X<sub style={{ fontSize: 9 }}>2</sub></button>
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              if (!onApplySelectionFormat?.('superscript')) onChangeProperty('superscript', !dom.superscript);
            }}
            title="Superscript"
            style={{
              ...btnBase,
              background: dom.superscript ? '#89b4fa' : '#1e1e2e',
              color: dom.superscript ? '#1e1e2e' : '#cdd6f4',
            }}
          >X<sup style={{ fontSize: 9 }}>2</sup></button>
        </div>
      </div>

      {/* ALIGNMENT */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Alignment</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {([
            { value: 'left', icon: '\u2261', title: 'Left' },
            { value: 'center', icon: '\u2261', title: 'Center' },
            { value: 'right', icon: '\u2261', title: 'Right' },
            { value: 'justify', icon: '\u2261', title: 'Justify' },
          ] as const).map(a => (
            <button
              key={a.value}
              title={a.title}
              onClick={() => onChangeAlign(a.value)}
              style={{
                ...btnBase,
                background: (block.align || 'left') === a.value ? '#89b4fa' : '#1e1e2e',
                color: (block.align || 'left') === a.value ? '#1e1e2e' : '#cdd6f4',
                fontSize: 14,
              }}
            >
              <svg width="16" height="14" viewBox="0 0 16 14" fill="currentColor">
                {a.value === 'left' && <>
                  <rect x="0" y="0" width="14" height="2" />
                  <rect x="0" y="4" width="10" height="2" />
                  <rect x="0" y="8" width="14" height="2" />
                  <rect x="0" y="12" width="8" height="2" />
                </>}
                {a.value === 'center' && <>
                  <rect x="1" y="0" width="14" height="2" />
                  <rect x="3" y="4" width="10" height="2" />
                  <rect x="1" y="8" width="14" height="2" />
                  <rect x="4" y="12" width="8" height="2" />
                </>}
                {a.value === 'right' && <>
                  <rect x="2" y="0" width="14" height="2" />
                  <rect x="6" y="4" width="10" height="2" />
                  <rect x="2" y="8" width="14" height="2" />
                  <rect x="8" y="12" width="8" height="2" />
                </>}
                {a.value === 'justify' && <>
                  <rect x="0" y="0" width="16" height="2" />
                  <rect x="0" y="4" width="16" height="2" />
                  <rect x="0" y="8" width="16" height="2" />
                  <rect x="0" y="12" width="16" height="2" />
                </>}
              </svg>
            </button>
          ))}
        </div>
      </div>

      {/* OPACITY */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Opacity</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="range" min={0} max={100} step={1}
            value={Math.round(opacity * 100)}
            onChange={e => onChangeOpacity(Number(e.target.value) / 100)}
            style={{ flex: 1, accentColor: '#89b4fa' }}
          />
          <span style={{ minWidth: 32, textAlign: 'right', fontSize: 13, fontWeight: 600 }}>
            {Math.round(opacity * 100)}%
          </span>
        </div>
      </div>

      {/* POSITION */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Position</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 10, color: '#6c7086' }}>X</span>
            <input
              type="number"
              value={Math.round(block.bbox[0])}
              onChange={e => onChangePosition(Number(e.target.value), block.bbox[1])}
              style={{
                width: '100%', padding: '4px 6px',
                background: '#1e1e2e', color: '#cdd6f4',
                border: '1px solid #45475a', borderRadius: 4,
                fontSize: 12, boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 10, color: '#6c7086' }}>Y</span>
            <input
              type="number"
              value={Math.round(block.bbox[1])}
              onChange={e => onChangePosition(block.bbox[0], Number(e.target.value))}
              style={{
                width: '100%', padding: '4px 6px',
                background: '#1e1e2e', color: '#cdd6f4',
                border: '1px solid #45475a', borderRadius: 4,
                fontSize: 12, boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
