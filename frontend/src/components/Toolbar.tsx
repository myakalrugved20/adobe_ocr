import { useRef, useState } from 'react';

const LANGUAGES = [
  // ── Indian Languages ──
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
  { code: 'as', name: 'Assamese' },
  { code: 'or', name: 'Odia' },
  { code: 'sa', name: 'Sanskrit' },
  { code: 'sd', name: 'Sindhi' },
  { code: 'ne', name: 'Nepali' },
  { code: 'si', name: 'Sinhala' },
  { code: 'doi', name: 'Dogri' },
  { code: 'mai', name: 'Maithili' },
  { code: 'kok', name: 'Konkani' },
  { code: 'mni-Mtei', name: 'Meiteilon (Manipuri)' },
  { code: 'bho', name: 'Bhojpuri' },
  // ── European Languages ──
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' },
  { code: 'ro', name: 'Romanian' },
  { code: 'el', name: 'Greek' },
  { code: 'cs', name: 'Czech' },
  { code: 'sk', name: 'Slovak' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'hr', name: 'Croatian' },
  { code: 'sr', name: 'Serbian' },
  { code: 'sl', name: 'Slovenian' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'ru', name: 'Russian' },
  { code: 'da', name: 'Danish' },
  { code: 'sv', name: 'Swedish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'fi', name: 'Finnish' },
  { code: 'et', name: 'Estonian' },
  { code: 'lv', name: 'Latvian' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'ga', name: 'Irish' },
  { code: 'cy', name: 'Welsh' },
  { code: 'sq', name: 'Albanian' },
  { code: 'mk', name: 'Macedonian' },
  { code: 'bs', name: 'Bosnian' },
  { code: 'is', name: 'Icelandic' },
  { code: 'mt', name: 'Maltese' },
  { code: 'lb', name: 'Luxembourgish' },
  { code: 'ca', name: 'Catalan' },
  { code: 'gl', name: 'Galician' },
  { code: 'eu', name: 'Basque' },
  // ── East Asian ──
  { code: 'zh-CN', name: 'Chinese (Simplified)' },
  { code: 'zh-TW', name: 'Chinese (Traditional)' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'mn', name: 'Mongolian' },
  // ── Southeast Asian ──
  { code: 'th', name: 'Thai' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'id', name: 'Indonesian' },
  { code: 'ms', name: 'Malay' },
  { code: 'tl', name: 'Filipino' },
  { code: 'my', name: 'Myanmar (Burmese)' },
  { code: 'km', name: 'Khmer' },
  { code: 'lo', name: 'Lao' },
  // ── Middle Eastern / African ──
  { code: 'ar', name: 'Arabic' },
  { code: 'he', name: 'Hebrew' },
  { code: 'fa', name: 'Persian' },
  { code: 'tr', name: 'Turkish' },
  { code: 'az', name: 'Azerbaijani' },
  { code: 'ka', name: 'Georgian' },
  { code: 'hy', name: 'Armenian' },
  { code: 'ku', name: 'Kurdish' },
  { code: 'sw', name: 'Swahili' },
  { code: 'am', name: 'Amharic' },
  { code: 'so', name: 'Somali' },
  { code: 'zu', name: 'Zulu' },
  { code: 'af', name: 'Afrikaans' },
  { code: 'ha', name: 'Hausa' },
  { code: 'ig', name: 'Igbo' },
  { code: 'yo', name: 'Yoruba' },
  { code: 'mg', name: 'Malagasy' },
  // ── Central Asian ──
  { code: 'uz', name: 'Uzbek' },
  { code: 'kk', name: 'Kazakh' },
  { code: 'ky', name: 'Kyrgyz' },
  { code: 'tg', name: 'Tajik' },
  { code: 'tk', name: 'Turkmen' },
  { code: 'tt', name: 'Tatar' },
  // ── Other ──
  { code: 'la', name: 'Latin' },
  { code: 'eo', name: 'Esperanto' },
  { code: 'haw', name: 'Hawaiian' },
  { code: 'mi', name: 'Maori' },
  { code: 'sm', name: 'Samoan' },
  { code: 'jv', name: 'Javanese' },
  { code: 'su', name: 'Sundanese' },
  { code: 'ceb', name: 'Cebuano' },
  { code: 'hmn', name: 'Hmong' },
  { code: 'ht', name: 'Haitian Creole' },
  { code: 'ny', name: 'Chichewa' },
  { code: 'co', name: 'Corsican' },
  { code: 'fy', name: 'Frisian' },
  { code: 'gd', name: 'Scots Gaelic' },
  { code: 'xh', name: 'Xhosa' },
  { code: 'ps', name: 'Pashto' },
];

const FEEDBACK_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSdVWcslL-oOL7laq9mMgYFid5f1DIdQaTnbA5LW0MSycW8TfA/viewform?usp=header';

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

      <button
        onClick={() => {
          if (FEEDBACK_FORM_URL) {
            window.open(FEEDBACK_FORM_URL, '_blank', 'noopener,noreferrer');
          }
        }}
        disabled={!FEEDBACK_FORM_URL}
        title={FEEDBACK_FORM_URL ? 'Share feedback' : 'Feedback URL not configured'}
        style={{
          ...btnStyle,
          background: '#f9e2af',
          color: '#1e1e2e',
          opacity: FEEDBACK_FORM_URL ? 1 : 0.5,
          cursor: FEEDBACK_FORM_URL ? 'pointer' : 'not-allowed',
        }}
      >
        Feedback
      </button>
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
