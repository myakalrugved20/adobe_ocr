import { useRef, useState } from 'react';

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'Hindi' },
  { code: 'mr', name: 'Marathi' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'bn', name: 'Bengali' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'kn', name: 'Kannada' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'ur', name: 'Urdu' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ja', name: 'Japanese' },
  { code: 'zh-CN', name: 'Chinese (Simplified)' },
  { code: 'ar', name: 'Arabic' },
];

interface ToolbarProps {
  onUpload: (file: File) => void;
  onTranslate: (lang: string) => void;
  onTranslateGroup: (lang: string) => void;
  onDownload: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onToggleAddMode: () => void;
  onToggleGroupMode: () => void;
  addMode: boolean;
  groupMode: boolean;
  groupCount: number;
  hasProject: boolean;
  loading: boolean;
  translating: boolean;
  pdfFilename?: string;
}

export default function Toolbar({
  onUpload, onTranslate, onTranslateGroup, onDownload,
  onUndo, onRedo, canUndo, canRedo,
  onToggleAddMode, onToggleGroupMode,
  addMode, groupMode, groupCount, hasProject, loading, translating, pdfFilename,
}: ToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [targetLang, setTargetLang] = useState('hi');

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 16px',
      background: '#1e1e2e', color: '#cdd6f4',
      borderBottom: '1px solid #313244',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <h3 style={{ margin: 0, marginRight: 8, color: '#89b4fa', fontSize: 16 }}>
        PDF Translator
      </h3>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf"
        onChange={handleFile}
        style={{ display: 'none' }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={loading}
        style={btnStyle}
      >
        {loading ? 'Processing...' : 'Upload PDF'}
      </button>

      {pdfFilename && (
        <span style={{ fontSize: 13, color: '#a6adc8' }}>
          {pdfFilename}
        </span>
      )}

      {hasProject && (
        <>
          <div style={{ width: 1, height: 24, background: '#45475a' }} />

          <button
            onClick={onToggleAddMode}
            style={{
              ...btnStyle,
              background: addMode ? '#f9e2af' : '#45475a',
              color: addMode ? '#1e1e2e' : '#cdd6f4',
            }}
          >
            {addMode ? '+ Placing...' : '+ Text Box'}
          </button>

          <div style={{ width: 1, height: 24, background: '#45475a' }} />

          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            style={{
              ...btnStyle,
              opacity: canUndo ? 1 : 0.4,
              cursor: canUndo ? 'pointer' : 'default',
              fontSize: 15,
              padding: '4px 10px',
            }}
          >
            &#x21A9;
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
            style={{
              ...btnStyle,
              opacity: canRedo ? 1 : 0.4,
              cursor: canRedo ? 'pointer' : 'default',
              fontSize: 15,
              padding: '4px 10px',
            }}
          >
            &#x21AA;
          </button>

          <div style={{ width: 1, height: 24, background: '#45475a' }} />

          <button
            onClick={onToggleGroupMode}
            style={{
              ...btnStyle,
              background: groupMode ? '#cba6f7' : '#45475a',
              color: groupMode ? '#1e1e2e' : '#cdd6f4',
            }}
          >
            {groupMode
              ? groupCount > 0
                ? `Selected ${groupCount} blocks`
                : 'Draw to select...'
              : 'Group Translate'}
          </button>
        </>
      )}

      <div style={{ flex: 1 }} />

      {hasProject && (
        <>
          <select
            value={targetLang}
            onChange={e => setTargetLang(e.target.value)}
            style={selectStyle}
          >
            {LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>{l.name}</option>
            ))}
          </select>

          <button
            onClick={() => onTranslate(targetLang)}
            disabled={translating}
            style={{ ...btnStyle, background: '#a6e3a1', color: '#1e1e2e' }}
          >
            {translating ? 'Translating...' : 'Translate All'}
          </button>

          {groupCount > 0 && (
            <button
              onClick={() => onTranslateGroup(targetLang)}
              disabled={translating}
              style={{ ...btnStyle, background: '#cba6f7', color: '#1e1e2e' }}
            >
              {translating ? 'Translating...' : `Translate ${groupCount} Blocks`}
            </button>
          )}

          <button
            onClick={onDownload}
            style={{ ...btnStyle, background: '#89b4fa', color: '#1e1e2e' }}
          >
            Download .docx
          </button>
        </>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 6,
  border: 'none',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 13,
  background: '#45475a',
  color: '#cdd6f4',
};

const selectStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid #45475a',
  background: '#313244',
  color: '#cdd6f4',
  fontSize: 13,
};
