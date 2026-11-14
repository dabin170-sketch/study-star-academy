import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, touch } from '../storage/db';
import { Card, EmptyState, InfoBox, Modal, PageHeader } from '../components/ui';
import { PixelBuilding } from '../components/PixelBuilding';
import { Uploader } from '../features/import/Uploader';
import { deleteDocument } from '../features/import/importDocument';
import { createSubject, ensureDefaultSubject, loadSampleDocument } from '../learning/sample';
import { useCurrentSubject } from '../hooks/data';
import { toast } from '../stores/ui';

export default function Library() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { subject, subjects, setSubject } = useCurrentSubject();
  const [uploadOpen, setUploadOpen] = useState(params.get('upload') === '1');
  const [newSubject, setNewSubject] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (params.get('sample') === '1') {
      setParams({}, { replace: true });
      loadSampleDocument(subject?.id).then((id) => {
        toast('예시 자료를 준비했어요.', 'success');
        navigate(`/library/${id}`);
      });
    }
  }, [params, setParams, subject?.id, navigate]);

  useEffect(() => {
    if (subjects && subjects.length === 0) ensureDefaultSubject();
  }, [subjects]);

  const docs = useLiveQuery(async () => {
    if (!subject) return [];
    const list = await db.documents.where('subjectId').equals(subject.id).toArray();
    return Promise.all(
      list
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(async (d) => {
          const cs = await db.concepts.where('documentId').equals(d.id).toArray();
          return { d, total: cs.length, check: cs.filter((c) => c.status === 'needs-check').length, verified: cs.filter((c) => c.status === 'verified').length };
        }),
    );
  }, [subject?.id]);

  return (
    <div>
      <PageHeader
        title="별빛 도서관"
        subtitle="학습 자료를 올리고, 원문에서 찾은 개념을 확인해요."
        icon={<PixelBuilding roof="#9b83e6" wall="#f0eaff" size={56} />}
        actions={
          <button className="btn-primary" onClick={() => setUploadOpen(true)} disabled={!subject}>
            + 자료 올리기
          </button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="h-fit">
          <h2 className="mb-2 font-bold">과목</h2>
          <ul className="space-y-1">
            {subjects?.map((s) => (
              <li key={s.id}>
                <button className={`w-full rounded-lg px-3 py-2 text-left text-sm ${s.id === subject?.id ? 'bg-lavender font-bold' : 'hover:bg-lavender-soft'}`} onClick={() => setSubject(s.id)}>
                  {s.name}
                  {s.examDate && <span className="ml-1 text-xs text-ink-soft">· 시험 {s.examDate}</span>}
                </button>
              </li>
            ))}
          </ul>
          <form
            className="mt-3 flex gap-1"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newSubject.trim()) return;
              const id = await createSubject(newSubject);
              setSubject(id);
              setNewSubject('');
            }}
          >
            <input className="input py-1 text-sm" placeholder="새 과목 이름" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} maxLength={30} />
            <button className="btn-ghost btn-sm" type="submit">
              추가
            </button>
          </form>
          {subject && (
            <div className="mt-4 space-y-2 border-t-2 border-ink/10 pt-3 text-sm">
              <label className="block">
                <span className="label">시험 날짜</span>
                <input
                  type="date"
                  className="input py-1"
                  value={subject.examDate ?? ''}
                  onChange={async (e) => {
                    await db.subjects.put(touch(subject, { examDate: e.target.value || undefined }));
                  }}
                />
              </label>
              <label className="block">
                <span className="label">시험 범위 메모</span>
                <textarea
                  className="input py-1"
                  rows={2}
                  defaultValue={subject.examScope ?? ''}
                  onBlur={async (e) => {
                    await db.subjects.put(touch(subject, { examScope: e.target.value }));
                  }}
                  placeholder="예: 1~6주차, 행동지원 제외"
                />
              </label>
            </div>
          )}
        </Card>

        <div className="space-y-3">
          {docs && docs.length === 0 && (
            <EmptyState
              title="이 과목에 자료가 없어요"
              desc="PDF·PPTX·DOCX·TXT·Markdown 파일을 올려 주세요."
              action={
                <div className="flex gap-2">
                  <button className="btn-primary" onClick={() => setUploadOpen(true)}>
                    자료 올리기
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={async () => {
                      const id = await loadSampleDocument(subject?.id);
                      navigate(`/library/${id}`);
                    }}
                  >
                    예시 자료로 체험
                  </button>
                </div>
              }
            />
          )}
          {docs?.map(({ d, total, check, verified }) => (
            <Card key={d.id} className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <Link to={`/library/${d.id}`} className="font-pixel text-lg font-bold hover:underline">
                  {d.title}
                </Link>
                <div className="text-xs text-ink-soft">
                  {d.fileType === 'sample' ? '예시 자료' : d.fileName} · {d.pageCount}
                  {d.fileType === 'pptx' ? '슬라이드' : d.fileType === 'pdf' ? '쪽' : '구간'} · 개념 {total}개 (확인 완료 {verified}, 확인 필요 {check})
                </div>
                {d.warnings.length > 0 && <div className="mt-1 text-xs text-butter-deep">⚠ 안내 {d.warnings.length}건</div>}
              </div>
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={d.inExamScope}
                  onChange={async (e) => {
                    await db.documents.put(touch(d, { inExamScope: e.target.checked }));
                  }}
                />
                시험 범위
              </label>
              <Link to={`/library/${d.id}`} className="btn-primary btn-sm">
                열기
              </Link>
              <button className="btn-ghost btn-sm" onClick={() => setConfirmDelete(d.id)}>
                삭제
              </button>
            </Card>
          ))}
        </div>
      </div>

      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title={`자료 올리기 — ${subject?.name ?? ''}`}>
        {subject && (
          <Uploader
            subjectId={subject.id}
            onDone={(id) => {
              setUploadOpen(false);
              toast('자료를 정리했어요. 원문 근거와 함께 개념을 확인해 보세요.', 'success');
              navigate(`/library/${id}`);
            }}
          />
        )}
        <InfoBox tone="milk">
          글자를 선택할 수 없는 스캔본 PDF는 글자를 읽지 못합니다. 이 경우 자동으로 개념을 확정하지 않고 ‘확인 필요’로 표시합니다. (이미지 글자 인식 OCR은 개발 예정입니다.)
        </InfoBox>
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="자료를 삭제할까요?">
        <p className="text-sm">원본 파일, 원문, 개념, 자동으로 만든 카드·문제, 그 문제의 오답 노트가 함께 삭제됩니다.</p>
        <p className="mt-1 text-sm text-ink-soft">정답 기록·복습 기록·공부 시간은 통계를 위해 남고, 직접 만든 문제는 출처 연결만 해제됩니다.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>
            취소
          </button>
          <button
            className="btn-pink"
            onClick={async () => {
              await deleteDocument(confirmDelete!);
              setConfirmDelete(null);
              toast('자료를 삭제했어요.');
            }}
          >
            삭제
          </button>
        </div>
      </Modal>
    </div>
  );
}
