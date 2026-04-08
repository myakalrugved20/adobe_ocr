import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PdfViewerProps {
  file: File | null;
  currentPage: number;
  onTotalPages?: (n: number) => void;
}

export default memo(function PdfViewer({ file, currentPage, onTotalPages }: PdfViewerProps) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [pageAspect, setPageAspect] = useState<number | null>(null);

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setFileUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setFileUrl(null);
    }
  }, [file]);

  // Stable file source to prevent Document re-mounting on unrelated re-renders
  const fileSource = useMemo(() => fileUrl ? { url: fileUrl } : null, [fileUrl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let rafId: number;
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setDims(prev => (prev.w === w && prev.h === h) ? prev : { w, h });
    };
    update();
    const obs = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(update);
    });
    obs.observe(el);
    return () => { obs.disconnect(); cancelAnimationFrame(rafId); };
  }, []);

  const onPageLoaded = useCallback((page: { width: number; height: number }) => {
    setPageAspect(page.width / page.height);
  }, []);

  const onDocLoaded = useCallback(({ numPages: n }: { numPages: number }) => {
    onTotalPages?.(n);
  }, [onTotalPages]);

  // Compute the width that makes the PDF fill the container as much as possible
  let pageWidth = dims.w;
  if (pageAspect && dims.w > 0 && dims.h > 0) {
    const containerAspect = dims.w / dims.h;
    if (containerAspect > pageAspect) {
      pageWidth = dims.h * pageAspect;
    } else {
      pageWidth = dims.w;
    }
  }

  if (!fileSource) {
    return (
      <div ref={containerRef} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', width: '100%', color: '#6c7086', fontSize: 14,
      }}>
        Upload a PDF to see it here
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{
      height: '100%', width: '100%',
      overflow: 'hidden',
      background: '#11111b',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {dims.w > 0 && (
        <Document
          file={fileSource}
          onLoadSuccess={onDocLoaded}
          loading={null}
        >
          <Page
            pageNumber={currentPage + 1}
            width={Math.round(pageWidth)}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            onLoadSuccess={onPageLoaded}
          />
        </Document>
      )}
    </div>
  );
})
