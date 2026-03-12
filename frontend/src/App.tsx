import { useState } from 'react';
import { useProject } from './hooks/useProject';
import Toolbar from './components/Toolbar';
import PdfViewer from './components/PdfViewer';
import DocEditor from './components/DocEditor';
import PageNavigator from './components/PageNavigator';
import { getDownloadUrl } from './api/client';

function App() {
  const {
    project, currentPage, setCurrentPage,
    loading, translating, error,
    upload, translate,
    updateBlockText, moveBlock, resizeBlock,
    addBlock, deleteBlock,
    saveLayout,
  } = useProject();

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [addMode, setAddMode] = useState(false);

  const handleUpload = (file: File) => {
    setPdfFile(file);
    upload(file);
    setAddMode(false);
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

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', background: '#1e1e2e',
      overflow: 'hidden',
    }}>
      <Toolbar
        onUpload={handleUpload}
        onTranslate={translate}
        onDownload={handleDownload}
        onToggleAddMode={() => setAddMode(!addMode)}
        addMode={addMode}
        hasProject={!!project}
        loading={loading || saving}
        translating={translating}
        pdfFilename={project?.pdf_filename}
      />

      {error && (
        <div style={{
          padding: '8px 16px',
          background: '#f38ba8',
          color: '#1e1e2e',
          fontSize: 13,
          fontWeight: 600,
        }}>
          {error}
        </div>
      )}

      {translating && (
        <div style={{
          padding: '8px 16px',
          background: '#a6e3a1',
          color: '#1e1e2e',
          fontSize: 13,
          fontWeight: 600,
          textAlign: 'center',
        }}>
          Translating... This may take a minute.
        </div>
      )}

      <div style={{
        flex: 1, display: 'flex',
        overflow: 'hidden',
      }}>
        {/* Left Pane: PDF Viewer */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '2px solid #313244',
          minWidth: 0,
        }}>
          <div style={{
            padding: '6px 12px',
            background: '#181825',
            color: '#a6adc8',
            fontSize: 12,
            fontWeight: 600,
            borderBottom: '1px solid #313244',
          }}>
            SOURCE PDF
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <PdfViewer file={pdfFile} currentPage={currentPage} />
          </div>
        </div>

        {/* Right Pane: Document Editor */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}>
          <div style={{
            padding: '6px 12px',
            background: '#181825',
            color: '#a6adc8',
            fontSize: 12,
            fontWeight: 600,
            borderBottom: '1px solid #313244',
          }}>
            EDITABLE OUTPUT {page ? `(${page.blocks.length} text blocks)` : ''}
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {page && project ? (
              <DocEditor
                page={page}
                projectId={project.project_id}
                addMode={addMode}
                onMoveBlock={(blockId, dx, dy, scale) =>
                  moveBlock(currentPage, blockId, dx, dy, scale)
                }
                onResizeBlock={(blockId, bbox) =>
                  resizeBlock(currentPage, blockId, bbox)
                }
                onDeleteBlock={(blockId) =>
                  deleteBlock(currentPage, blockId)
                }
                onAddBlock={(xPt, yPt) =>
                  addBlock(currentPage, xPt, yPt)
                }
                onTextChange={(blockId, li, si, text) =>
                  updateBlockText(currentPage, blockId, li, si, text)
                }
                onExitAddMode={() => setAddMode(false)}
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
      </div>

      <PageNavigator
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}

export default App;
