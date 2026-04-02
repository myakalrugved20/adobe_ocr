interface ZoomControlsProps {
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
}

const btn: React.CSSProperties = {
  padding: '3px 10px',
  background: '#313244',
  border: '1px solid #45475a',
  borderRadius: 4,
  color: '#cdd6f4',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1,
};

export default function ZoomControls({ zoomLevel, onZoomIn, onZoomOut, onZoomFit }: ZoomControlsProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '4px 8px',
      background: '#181825',
      borderBottom: '1px solid #313244',
    }}>
      <button style={btn} onClick={onZoomOut}>-</button>
      <span style={{
        minWidth: 42, textAlign: 'center',
        fontSize: 11, fontWeight: 600, color: '#a6adc8',
      }}>
        {Math.round(zoomLevel * 100)}%
      </span>
      <button style={btn} onClick={onZoomIn}>+</button>
      <button style={{ ...btn, fontSize: 11, padding: '3px 8px' }} onClick={onZoomFit}>Fit</button>
    </div>
  );
}
