import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CONCEPT_KIND_LABEL, type Concept } from '@academy/shared';
import { ConceptEvidenceList, ConceptStatusBadge } from '../../components/Evidence';
import { Modal } from '../../components/ui';
import { updateConcept } from '../import/importDocument';
import { toast } from '../../stores/ui';

export function ConceptCard({ concept, defaultOpen = false }: { concept: Concept; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [editing, setEditing] = useState(false);
  const [term, setTerm] = useState(concept.term);
  const [statement, setStatement] = useState(concept.statement);
  const [note, setNote] = useState(concept.userNote);
  const [importance, setImportance] = useState(concept.importance);

  const save = async () => {
    await updateConcept(concept.id, { term: term.trim(), statement: statement.trim(), userNote: note, importance, status: 'verified' });
    setEditing(false);
    toast('개념을 고쳤어요. 이후 카드와 문제에 고친 내용이 먼저 반영돼요.', 'success');
  };

  return (
    <article className={`rounded-xl border-2 p-3 ${concept.status === 'rejected' ? 'border-ink/20 bg-ink-faint/10 opacity-70' : concept.status === 'needs-check' ? 'border-butter-deep/60 bg-butter-soft/60' : 'border-ink/30 bg-white'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-pixel text-base font-bold">{concept.term}</h3>
        {concept.aliases.length > 0 && <span className="text-xs text-ink-soft">({concept.aliases.join(', ')})</span>}
        <span className="chip bg-lavender-soft">{CONCEPT_KIND_LABEL[concept.kind]}</span>
        <ConceptStatusBadge status={concept.status} />
        {concept.importance === 3 && <span className="chip bg-pink-soft">중요</span>}
        <span className="ml-auto text-xs text-ink-soft">{concept.pageNumber} · 신뢰도 {Math.round(concept.confidence * 100)}%</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm">
        <span className="mr-1 chip bg-white">{concept.userEdited ? '내가 고친 설명' : '원문'}</span>
        {concept.statement}
      </p>
      {concept.userNote && (
        <p className="mt-1 text-sm text-ink-soft">
          <span className="mr-1 chip bg-mint-soft">내 메모</span>
          {concept.userNote}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button className="btn-ghost btn-sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? '근거 접기' : '원문 근거 보기'}
        </button>
        {concept.status !== 'verified' && concept.status !== 'rejected' && (
          <button className="btn-mint btn-sm" onClick={() => updateConcept(concept.id, { status: 'verified' })}>
            원문과 맞아요
          </button>
        )}
        <button className="btn-ghost btn-sm" onClick={() => setEditing(true)}>
          고치기
        </button>
        {concept.status === 'rejected' ? (
          <button className="btn-ghost btn-sm" onClick={() => updateConcept(concept.id, { status: 'needs-check' })}>
            되살리기
          </button>
        ) : (
          <button className="btn-ghost btn-sm" onClick={() => updateConcept(concept.id, { status: 'rejected' })}>
            개념 아님(제외)
          </button>
        )}
        {concept.status !== 'rejected' && (
          <Link to={`/lecture?concept=${concept.id}`} className="btn-ghost btn-sm">
            자세히 공부
          </Link>
        )}
      </div>
      {open && (
        <div className="mt-2">
          <ConceptEvidenceList conceptId={concept.id} />
        </div>
      )}

      <Modal open={editing} onClose={() => setEditing(false)} title="개념 고치기">
        <div className="space-y-3">
          <label className="block">
            <span className="label">용어</span>
            <input className="input" value={term} onChange={(e) => setTerm(e.target.value)} maxLength={40} />
          </label>
          <label className="block">
            <span className="label">설명(원문 문장을 그대로 두는 것을 권장)</span>
            <textarea className="input" rows={4} value={statement} onChange={(e) => setStatement(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">내 메모(원문과 구분되어 표시돼요)</span>
            <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">중요도</span>
            <select className="input" value={importance} onChange={(e) => setImportance(Number(e.target.value) as 1 | 2 | 3)}>
              <option value={1}>보통</option>
              <option value={2}>중요</option>
              <option value={3}>매우 중요</option>
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setEditing(false)}>
              취소
            </button>
            <button className="btn-primary" onClick={save} disabled={!term.trim() || !statement.trim()}>
              저장하고 확인 완료
            </button>
          </div>
        </div>
      </Modal>
    </article>
  );
}
