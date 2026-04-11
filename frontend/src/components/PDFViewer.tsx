import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import { getAuthToken } from '../api/client';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

interface PDFViewerProps {
  url: string;
  pageNumber?: number;
}

const PDFViewer: React.FC<PDFViewerProps> = ({ url, pageNumber = 1 }) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(pageNumber);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPDF = async () => {
      setLoading(true);
      try {
        const token = getAuthToken();
        const loadingTask = pdfjsLib.getDocument(
          token
            ? {
                url,
                httpHeaders: { Authorization: `Bearer ${token}` },
              }
            : url
        );
        const pdf = await loadingTask.promise;
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
      } catch (error) {
        console.error('Error loading PDF:', error);
      } finally {
        setLoading(false);
      }
    };

    void loadPDF();
  }, [url]);

  useEffect(() => {
    if (pageNumber >= 1 && pageNumber <= numPages) {
      setCurrentPage(pageNumber);
    }
  }, [pageNumber, numPages]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) {
      return;
    }

    const renderPage = async () => {
      const page = await pdfDoc.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext('2d');
      if (!context) return;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({
        canvasContext: context,
        viewport,
      }).promise;
    };

    void renderPage();
  }, [currentPage, pdfDoc]);

  const handlePrev = () => setCurrentPage((prev) => Math.max(prev - 1, 1));
  const handleNext = () => setCurrentPage((prev) => Math.min(prev + 1, numPages));

  return (
    <div className="flex flex-col h-full bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
      <div className="flex items-center justify-between p-2 bg-gray-900 border-b border-gray-700">
        <span className="text-sm font-medium text-gray-300 ml-2">{t('pdf.title')}</span>
        <div className="flex items-center space-x-4 pr-2">
          <button
            onClick={handlePrev}
            disabled={currentPage <= 1 || loading}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm disabled:opacity-50"
          >
            {t('pdf.prev')}
          </button>
          <span className="text-sm text-gray-300">
            {currentPage} / {numPages || '-'}
          </span>
          <button
            onClick={handleNext}
            disabled={currentPage >= numPages || loading}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm disabled:opacity-50"
          >
            {t('pdf.next')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto flex justify-center bg-gray-900 p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-400">{t('pdf.loading')}</div>
        ) : (
          <canvas ref={canvasRef} className="shadow-lg max-w-full h-auto object-contain" />
        )}
      </div>
    </div>
  );
};

export default PDFViewer;
