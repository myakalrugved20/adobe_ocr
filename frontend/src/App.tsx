import { useState, useEffect, useRef } from 'react';
import { useProject } from './hooks/useProject';
import Toolbar from './components/Toolbar';
import PdfViewer from './components/PdfViewer';
import DocEditor from './components/DocEditor';
import type { TextBlockHandle } from './components/TextBlock';
import PageNavigator from './components/PageNavigator';
import PropertiesPanel from './components/PropertiesPanel';
import LayersPanel from './components/LayersPanel';
import { getDownloadUrl } from './api/client';

function App() {
  const {
    project, currentPage, setCurrentPage,
    loading, translating, error,
    upload, translate, translateGroup,
    updateBlockText, moveBlock, resizeBlock,
    addBlock, deleteBlock,
    updateBlockSpanProperty, updateBlockOpacity, updateBlockAlign, updateBlockLines,
    updateBlockPosition, reorderBlock, duplicateBlock,
    updateBlockAllText,
    saveLayout,
    undo, redo, canUndo, canRedo,
  } = useProject();

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [groupMode, setGroupMode] = useState(false);
  const [groupSelectedBlocks, setGroupSelectedBlocks] = useState<Set<string>>(new Set());
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [targetLang, setTargetLang] = useState('hi');
  const formatRef = useRef<TextBlockHandle | null>(null);

  // Ctrl+Z / Ctrl+Shift+Z
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable = (e.target as HTMLElement)?.isContentEditable;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || isEditable) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  const handleUpload = (file: File) => {
    setPdfFile(file);
    upload(file);
    setAddMode(false);
    setSelectedBlock(null);
  };

  const handleDownload = async () => {
    if (!project) return;
    setSaving(true);
    try {
      await saveLayout();
      window.open(getDownloadUrl(project.project_id), '_blank');
    } finally {
      setSaving(false);
    }
  };

  const totalPages = project?.pages.length || 0;
  const page = project?.pages[currentPage];
  const selectedBlockData = page?.blocks.find(b => b.id === selectedBlock) || null;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', background: '#1e1e2e',
      overflow: 'hidden',
    }}>
      <Toolbar
        onUpload={handleUpload}
        onTranslate={(lang) => { setTargetLang(lang); setSelectedBlock(null); translate(lang); }}
        onTranslateGroup={(lang) => {
          const ids = Array.from(groupSelectedBlocks);
          translateGroup(currentPage, ids, lang);
          setGroupMode(false);
          setGroupSelectedBlocks(new Set());
        }}
        onDownload={handleDownload}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        onToggleAddMode={() => { setAddMode(!addMode); if (!addMode) { setGroupMode(false); setGroupSelectedBlocks(new Set()); } }}
        onToggleGroupMode={() => {
          if (groupMode) { setGroupMode(false); setGroupSelectedBlocks(new Set()); }
          else { setGroupMode(true); setAddMode(false); setGroupSelectedBlocks(new Set()); }
        }}
        addMode={addMode}
        groupMode={groupMode}
        groupCount={groupSelectedBlocks.size}
        hasProject={!!project}
        loading={loading || saving}
        translating={translating}
        pdfFilename={project?.pdf_filename}
      />

      <div style={{
        position: 'relative',
        flex: 1, display: 'flex',
        overflow: 'hidden',
      }}>
        {/* Overlay banners */}
        {error && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 900,
            padding: '8px 16px', background: '#f38ba8', color: '#1e1e2e',
            fontSize: 13, fontWeight: 600, textAlign: 'center',
          }}>
            {error}
          </div>
        )}
        {translating && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 900,
            padding: '8px 16px', background: '#a6e3a1', color: '#1e1e2e',
            fontSize: 13, fontWeight: 600, textAlign: 'center',
          }}>
            Translating... This may take a minute.
          </div>
        )}

        {/* Properties Panel */}
        {page ? (
          selectedBlockData ? (
            <PropertiesPanel
              block={selectedBlockData}
              onChangeProperty={(prop, value) =>
                updateBlockSpanProperty(currentPage, selectedBlock!, prop, value)
              }
              onChangePosition={(x, y) =>
                updateBlockPosition(currentPage, selectedBlock!, x, y)
              }
              onChangeOpacity={(opacity) =>
                updateBlockOpacity(currentPage, selectedBlock!, opacity)
              }
              onChangeAllText={(text) =>
                updateBlockAllText(currentPage, selectedBlock!, text)
              }
              onChangeAlign={(align) =>
                updateBlockAlign(currentPage, selectedBlock!, align)
              }
              onApplySelectionFormat={(cmd, val) => {
                if (formatRef.current?.isEditing()) {
                  formatRef.current.applyFormat(cmd, val);
                  return true;
                }
                return false;
              }}
            />
          ) : (
            <div style={{
              width: 220, flexShrink: 0,
              background: '#181825',
              borderRight: '1px solid #313244',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#6c7086', fontSize: 11, padding: '0 16px', textAlign: 'center',
            }}>
              Select a text layer to edit properties
            </div>
          )
        ) : null}

        {/* Left Pane: PDF Viewer */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          borderRight: '2px solid #313244', minWidth: 0,
        }}>
          <div style={{
            padding: '6px 12px', background: '#181825', color: '#a6adc8',
            fontSize: 12, fontWeight: 600, borderBottom: '1px solid #313244',
          }}>
            SOURCE PDF
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <PdfViewer file={pdfFile} currentPage={currentPage} />
          </div>
        </div>

        {/* Middle Pane: Document Editor */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0,
        }}>
          <div style={{
            padding: '6px 12px', background: '#181825', color: '#a6adc8',
            fontSize: 12, fontWeight: 600, borderBottom: '1px solid #313244',
          }}>
            EDITABLE OUTPUT {page ? `(${page.blocks.length} text blocks)` : ''}
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {page && project ? (
              <DocEditor
                page={page}
                projectId={project.project_id}
                addMode={addMode}
                groupMode={groupMode}
                groupSelectedBlocks={groupSelectedBlocks}
                selectedBlock={selectedBlock}
                onSelectBlock={setSelectedBlock}
                onMoveBlock={(blockId, dx, dy, scale) =>
                  moveBlock(currentPage, blockId, dx, dy, scale)
                }
                onResizeBlock={(blockId, bbox) =>
                  resizeBlock(currentPage, blockId, bbox)
                }
                onDeleteBlock={(blockId) => {
                  deleteBlock(currentPage, blockId);
                  setSelectedBlock(null);
                }}
                onAddBlock={(xPt, yPt) =>
                  addBlock(currentPage, xPt, yPt)
                }
                onTextChange={(blockId, li, si, text) =>
                  updateBlockText(currentPage, blockId, li, si, text)
                }
                onTextChangeAll={(blockId, text) =>
                  updateBlockAllText(currentPage, blockId, text)
                }
                onUpdateLines={(blockId, lines) =>
                  updateBlockLines(currentPage, blockId, lines)
                }
                onExitAddMode={() => setAddMode(false)}
                onGroupSelect={setGroupSelectedBlocks}
                onTranslateGroup={() => {
                  const ids = Array.from(groupSelectedBlocks);
                  translateGroup(currentPage, ids, targetLang);
                  setGroupMode(false);
                  setGroupSelectedBlocks(new Set());
                }}
                onCancelGroup={() => {
                  setGroupMode(false);
                  setGroupSelectedBlocks(new Set());
                }}
                onFormatRef={(handle) => { formatRef.current = handle; }}
              />
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100%', color: '#6c7086', fontSize: 14,
              }}>
                {loading ? 'Processing PDF...' : 'Upload a PDF to start editing'}
              </div>
            )}
          </div>
        </div>

        {/* Layers Panel */}
        {page && (
          <LayersPanel
            blocks={page.blocks}
            selectedBlockId={selectedBlock}
            onSelectBlock={setSelectedBlock}
            onReorder={(blockId, dir) => reorderBlock(currentPage, blockId, dir)}
            onDuplicate={(blockId) => {
              const newId = duplicateBlock(currentPage, blockId);
              if (newId) setSelectedBlock(newId);
            }}
            onDelete={(blockId) => {
              deleteBlock(currentPage, blockId);
              setSelectedBlock(null);
            }}
          />
        )}
      </div>

      <PageNavigator
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(p) => { setCurrentPage(p); setSelectedBlock(null); }}
      />
    </div>
  );
}

export default App;
