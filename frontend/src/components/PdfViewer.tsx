import { useState, useEffect, useRef, useCallback } from 'react';
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

export default function PdfViewer({ file, currentPage, onTotalPages }: PdfViewerProps) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [pageAspect, setPageAspect] = useState<number | null>(null);

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setFileUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setDims({ w: el.clientWidth, h: el.clientHeight });
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const onPageLoaded = useCallback((page: { width: number; height: number }) => {
    setPageAspect(page.width / page.height);
  }, []);

  // Compute the width that makes the PDF fill the container as much as possible
  // while maintaining aspect ratio
  let pageWidth = dims.w;
  if (pageAspect && dims.w > 0 && dims.h > 0) {
    const containerAspect = dims.w / dims.h;
    if (containerAspect > pageAspect) {
      // Container is wider than page → height is the constraint
      pageWidth = dims.h * pageAspect;
    } else {
      // Container is taller than page → width is the constraint
      pageWidth = dims.w;
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
      {dims.w > 0 && (
        <Document
          file={fileUrl}
          onLoadSuccess={({ numPages: n }) => { onTotalPages?.(n); }}
          loading={null}
        >
          <Page
            pageNumber={currentPage + 1}
            width={pageWidth}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            onLoadSuccess={onPageLoaded}
          />
        </Document>
      )}
    </div>
  );
}
