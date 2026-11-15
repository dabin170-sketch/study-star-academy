import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { DialogueLine } from '@academy/shared';
import { db } from '../../storage/db';
import { Modal } from '../../components/ui';
import { HighlightedChunk } from '../../components/Evidence';
import { FACT_BADGE } from './Stage';

export function EvidenceModal({ line, onClose, sceneTitle }: { line: DialogueLine | null; onClose: () => void; sceneTitle?: string }) {
  const data = useLiveQuery(async () => {
    if (!line?.evidence) return null;
    const doc = await db.documents.get(line.evidence.documentId);
    const chunk = await db.chunks.get(line.evidence.chunkId);
    const concept = await db.concepts.get(line.evidence.conceptId);
    return { doc, chunk, concept };
  }, [line?.id, line?.evidence?.chunkId]);
  return (
    <Modal open={!!line} onClose={onClose} title="이 대사의 원문 근거">
      {line && (
        <div className="space-y-3 text-sm">
          <div className="rounded-lg bg-lavender-soft p-2">
            <div className="mb-1 flex flex-wrap gap-1 text-xs">
              <span className={`chip ${FACT_BADGE[line.fact].cls}`}>{FACT_BADGE[line.fact].label}</span>
              {sceneTitle && <span className="chip bg-white">장면: {sceneTitle}</span>}
              {data?.concept && <span className="chip bg-white">개념: {data.concept.term}</span>}
              {line.edited && <span className="chip bg-pink">사용자가 고친 대사 — 원문과 비교해 확인하세요</span>}
            </div>
            <p>“{line.text}”</p>
          </div>
          {!line.evidence ? (
            <p className="text-ink-soft">이 대사는 이야기를 위한 창작 대사(이야기 설정)라 원문 근거가 없어요. 실제 사실이나 연구 결과를 말하는 것이 아니에요.</p>
          ) : (
            <>
              <p className="text-xs text-ink-soft">
                원본 문서: <b>{data?.doc?.title ?? '삭제된 자료'}</b> · {line.evidence.pageNumber}쪽(구간)
              </p>
              <div className="rounded-lg border-2 border-butter-deep/50 bg-butter-soft p-3">
                {data?.chunk ? <HighlightedChunk text={data.chunk.text} start={Math.max(0, data.chunk.text.indexOf(line.evidence.quote))} quote={line.evidence.quote} /> : <p>“{line.evidence.quote}”</p>}
              </div>
              {data?.doc && (
                <Link className="btn-ghost btn-sm" to={`/library/${data.doc.id}?page=${line.evidence.pageNumber}&chunk=${line.evidence.chunkId}`}>
                  도서관에서 원문 열기
                </Link>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
