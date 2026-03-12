interface PageNavigatorProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function PageNavigator({ currentPage, totalPages, onPageChange }: PageNavigatorProps) {
  if (totalPages <= 1) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 8, padding: '6px 0',
      background: '#181825', borderTop: '1px solid #313244',
    }}>
      <button
        onClick={() => onPageChange(Math.max(0, currentPage - 1))}
        disabled={currentPage === 0}
        style={navBtnStyle}
      >
        &lt; Prev
      </button>
      <span style={{ color: '#a6adc8', fontSize: 13 }}>
        Page {currentPage + 1} / {totalPages}
      </span>
      <button
        onClick={() => onPageChange(Math.min(totalPages - 1, currentPage + 1))}
        disabled={currentPage === totalPages - 1}
        style={navBtnStyle}
      >
        Next &gt;
      </button>
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 4,
  border: '1px solid #45475a',
  background: '#313244',
  color: '#cdd6f4',
  cursor: 'pointer',
  fontSize: 12,
};
