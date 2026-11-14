/**
 * PDF.js로 PDF의 텍스트 위치 정보를 읽는다(브라우저에서만 실행, 서버로 전송하지 않음).
 */
import type { PdfPageInput } from '@academy/document-parser';

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

export function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist');
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

/** 한글 CID 글꼴(Adobe-Korea1 등)을 읽기 위한 공통 옵션 */
export const PDF_OPTIONS = {
  isEvalSupported: false,
  cMapUrl: '/pdfjs/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: '/pdfjs/standard_fonts/',
} as const;

export async function extractPdf(
  data: ArrayBuffer,
  onProgress?: (done: number, total: number) => void,
): Promise<{ pages: PdfPageInput[]; title: string | null }> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), ...PDF_OPTIONS }).promise;
  const pages: PdfPageInput[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = [];
    for (const it of content.items) {
      if (!('str' in it)) continue;
      const t = it.transform as number[];
      const fontSize = Math.hypot(t[2], t[3]) || it.height || 10;
      items.push({ str: it.str, x: t[4], y: t[5], width: it.width || it.str.length * fontSize * 0.5, fontSize });
    }
    pages.push({ pageNumber: i, width: viewport.width, items });
    page.cleanup();
    onProgress?.(i, doc.numPages);
  }
  let title: string | null = null;
  try {
    const meta = await doc.getMetadata();
    const info = meta.info as { Title?: string } | undefined;
    const t = info?.Title?.trim() ?? '';
    // 'lecture.html', 'Microsoft Word - 문서1.docx', 'Untitled' 같은 의미 없는 제목은 파일 이름으로 대신한다
    if (t.length > 1 && !/\.(html?|docx?|pptx?|hwpx?|pdf|txt|md)$/i.test(t) && !/^(Microsoft (Word|PowerPoint)|untitled|제목 없음)/i.test(t)) title = t;
  } catch {
    /* 메타데이터 없음 */
  }
  await doc.destroy();
  return { pages, title };
}
