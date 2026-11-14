import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { CONCEPT_STATUS_LABEL, type ConceptStatus } from '@academy/shared';
import { db } from '../storage/db';

export function ConceptStatusBadge({ status }: { status: ConceptStatus }) {
  const cls = { auto: 'bg-milk', verified: 'bg-mint', 'needs-check': 'bg-butter', rejected: 'bg-ink-faint/40 line-through' }[status];
  return <span className={`chip ${cls}`}>{CONCEPT_STATUS_LABEL[status]}</span>;
}

/** 문단 원문 안에서 근거 문장을 형광펜으로 표시 */
export function HighlightedChunk({ text, start, quote }: { text: string; start: number; quote: string }) {
  const ok = text.slice(start, start + quote.length) === quote;
  if (!ok) return <p className="whitespace-pre-wrap">{text}</p>;
  return (
    <p className="whitespace-pre-wrap leading-relaxed">
      {text.slice(0, start)}
      <mark className="evidence">{quote}</mark>
      {text.slice(start + quote.length)}
    </p>
  );
}

/** 개념의 원문 근거 목록(문서 제목·쪽 번호·원문 문단) */
export function ConceptEvidenceList({ conceptId, compact }: { conceptId: string; compact?: boolean }) {
  const data = useLiveQuery(async () => {
    const ev = await db.evidence.where('conceptId').equals(conceptId).toArray();
    const chunks = await db.chunks.bulkGet(ev.map((e) => e.chunkId));
    const docs = await db.documents.bulkGet([...new Set(ev.map((e) => e.documentId))]);
    return ev.map((e, i) => ({ e, chunk: chunks[i], doc: docs.find((d) => d?.id === e.documentId) }));
  }, [conceptId]);
  if (!data) return null;
  if (!data.length) return <p className="text-sm text-ink-soft">연결된 원문 근거가 없습니다.</p>;
  return (
    <div className="space-y-2">
      {data.map(({ e, chunk, doc }) => (
        <div key={e.id} className="rounded-lg border-2 border-butter-deep/50 bg-butter-soft p-3 text-sm">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
            <span className="chip bg-white">원문</span>
            {doc && (
              <Link className="underline" to={`/library/${doc.id}?page=${e.pageNumber}&chunk=${e.chunkId}`}>
                {doc.title} · {e.pageNumber}
                {doc.fileType === 'pptx' ? '번 슬라이드' : doc.fileType === 'pdf' ? '쪽' : '구간'}
              </Link>
            )}
          </div>
          {compact || !chunk ? <p className="whitespace-pre-wrap">“{e.quote}”</p> : <HighlightedChunk text={chunk.text} start={e.start} quote={e.quote} />}
        </div>
      ))}
    </div>
  );
}
