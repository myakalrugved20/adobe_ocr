import { useState, useEffect, useRef, useCallback, memo } from 'react';
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
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [pageAspect, setPageAspect] = useState<number | null>(null);
  const onTotalPagesRef = useRef(onTotalPages);
  onTotalPagesRef.current = onTotalPages;

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setFileUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setFileUrl(null);
    }
  }, [file]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let rafId: number;
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setContainerWidth(prev => prev === w ? prev : w);
      setContainerHeight(prev => prev === h ? prev : h);
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

  // Use a ref-based callback so Document never sees a new onLoadSuccess reference
  const onDocLoaded = useCallback(({ numPages: n }: { numPages: number }) => {
    onTotalPagesRef.current?.(n);
  }, []);

  // Compute the width that makes the PDF fill the container
  let pageWidth = containerWidth;
  if (pageAspect && containerWidth > 0 && containerHeight > 0) {
    const containerAspect = containerWidth / containerHeight;
    if (containerAspect > pageAspect) {
      pageWidth = containerHeight * pageAspect;
    }
  }

  if (!fileUrl) {
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
      {containerWidth > 0 && (
        <Document
          file={fileUrl}
          onLoadSuccess={onDocLoaded}
          loading={null}
        >
          <Page
            pageNumber={currentPage + 1}
            width={Math.round(pageWidth)}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            onLoadSuccess={onPageLoaded}
            loading={null}
          />
        </Document>
      )}
    </div>
  );
})
