import type { Block } from '../types/project';

interface LayersPanelProps {
  blocks: Block[];
  selectedBlockId: string | null;
  onSelectBlock: (id: string) => void;
  onReorder: (blockId: string, direction: 'up' | 'down') => void;
  onDuplicate: (blockId: string) => void;
  onDelete: (blockId: string) => void;
}

function getBlockPreview(block: Block): string {
  const text = block.lines
    .flatMap(l => l.spans.map(s => s.text))
    .join(' ')
    .trim();
  return text.length > 28 ? text.slice(0, 28) + '...' : text || '(empty)';
}

const actionBtn: React.CSSProperties = {
  flex: 1, height: 28,
  background: '#1e1e2e',
  border: '1px solid #45475a',
  borderRadius: 4,
  color: '#cdd6f4',
  cursor: 'pointer',
  fontSize: 13,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

export default function LayersPanel({
  blocks, selectedBlockId, onSelectBlock, onReorder, onDuplicate, onDelete,
}: LayersPanelProps) {
  // Show topmost (last in array) first
  const reversed = [...blocks].reverse();

  return (
    <div style={{
      width: 200, flexShrink: 0,
      background: '#181825',
      borderLeft: '1px solid #313244',
      display: 'flex', flexDirection: 'column',
      color: '#cdd6f4', fontSize: 12,
    }}>
      <div style={{
        padding: '10px 10px 8px',
        fontSize: 11, fontWeight: 700, color: '#89b4fa',
        textTransform: 'uppercase',
        borderBottom: '1px solid #313244',
      }}>
        Layers
      </div>

      {/* Block list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {reversed.map(block => {
          const isSelected = block.id === selectedBlockId;
          return (
            <div
              key={block.id}
              onClick={() => onSelectBlock(block.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 10px',
                cursor: 'pointer',
                background: isSelected ? '#313244' : 'transparent',
                borderLeft: isSelected ? '3px solid #89b4fa' : '3px solid transparent',
              }}
              onMouseEnter={e => {
                if (!isSelected) e.currentTarget.style.background = '#1e1e2e';
              }}
              onMouseLeave={e => {
                if (!isSelected) e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{
                fontSize: 11, fontWeight: 700,
                color: '#89b4fa', flexShrink: 0,
                width: 16, textAlign: 'center',
              }}>T</span>
              <span style={{
                overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap', fontSize: 11,
                color: isSelected ? '#cdd6f4' : '#a6adc8',
              }}>
                {getBlockPreview(block)}
              </span>
            </div>
          );
        })}
        {blocks.length === 0 && (
          <div style={{ padding: '12px 10px', color: '#6c7086', fontSize: 11 }}>
            No text layers
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{
        padding: '8px 8px', display: 'flex', gap: 4,
        borderTop: '1px solid #313244',
      }}>
        <button
          style={actionBtn}
          title="Bring Forward"
          disabled={!selectedBlockId}
          onClick={() => selectedBlockId && onReorder(selectedBlockId, 'up')}
        >&#9650;</button>
        <button
          style={actionBtn}
          title="Send Backward"
          disabled={!selectedBlockId}
          onClick={() => selectedBlockId && onReorder(selectedBlockId, 'down')}
        >&#9660;</button>
        <button
          style={actionBtn}
          title="Duplicate"
          disabled={!selectedBlockId}
          onClick={() => selectedBlockId && onDuplicate(selectedBlockId)}
        >&#9112;</button>
        <button
          style={actionBtn}
          title="Delete"
          disabled={!selectedBlockId}
          onClick={() => selectedBlockId && onDelete(selectedBlockId)}
        >&#10005;</button>
      </div>
    </div>
  );
}
