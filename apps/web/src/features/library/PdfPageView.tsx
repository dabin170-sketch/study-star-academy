/** 원본 PDF 한 쪽을 그린다(현재 보는 쪽만 그려 메모리를 아낌 = 페이지 가상화). */
import { useEffect, useRef, useState } from 'react';
import { db } from '../../storage/db';
import { PDF_OPTIONS, loadPdfjs } from '../import/pdf';

type PdfDoc = Awaited<ReturnType<Awaited<ReturnType<typeof loadPdfjs>>['getDocument']>['promise']>;

const cache = new Map<string, Promise<PdfDoc | null>>();

function openDoc(documentId: string) {
  if (!cache.has(documentId)) {
    cache.set(
      documentId,
      (async () => {
        const row = await db.blobs.get(documentId);
        if (!row) return null;
        const pdfjs = await loadPdfjs();
        return pdfjs.getDocument({ data: new Uint8Array(await row.blob.arrayBuffer()), ...PDF_OPTIONS }).promise;
      })(),
    );
  }
  return cache.get(documentId)!;
}

export function PdfPageView({ documentId, pageNumber }: { documentId: string; pageNumber: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    setState('loading');
    (async () => {
      try {
        const doc = await openDoc(documentId);
        if (!doc) return !cancelled && setState('missing');
        const page = await doc.getPage(pageNumber);
        const width = box.current?.clientWidth ?? 600;
        const base = page.getViewport({ scale: 1 });
        const scale = (width / base.width) * (window.devicePixelRatio || 1);
        const vp = page.getViewport({ scale });
        const c = canvas.current;
        if (!c || cancelled) return;
        c.width = vp.width;
        c.height = vp.height;
        c.style.width = '100%';
        task = page.render({ canvasContext: c.getContext('2d')!, viewport: vp });
        await task.promise;
        if (!cancelled) setState('ok');
      } catch (e) {
        if ((e as { name?: string })?.name !== 'RenderingCancelledException' && !cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [documentId, pageNumber]);

  return (
    <div ref={box} className="relative w-full overflow-hidden rounded-lg border-2 border-ink/30 bg-white">
      {state === 'missing' && <p className="p-4 text-sm text-ink-soft">원본 PDF 파일이 이 기기에 없습니다(백업에서 원본 없이 복원한 경우). 추출된 원문 텍스트는 오른쪽에서 볼 수 있어요.</p>}
      {state === 'error' && <p className="p-4 text-sm text-ink-soft">이 쪽을 그리지 못했습니다. 추출된 원문 텍스트를 확인해 주세요.</p>}
      {state === 'loading' && <p className="absolute inset-0 flex items-center justify-center text-sm text-ink-soft">쪽을 그리는 중…</p>}
      <canvas ref={canvas} aria-label={`원본 ${pageNumber}쪽`} className={state === 'ok' || state === 'loading' ? '' : 'hidden'} />
    </div>
  );
}
