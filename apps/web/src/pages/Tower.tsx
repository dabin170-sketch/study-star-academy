import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { QUESTION_TYPE_LABEL, type QuestionType } from '@academy/shared';
import { db } from '../storage/db';
import { Card, EmptyState, InfoBox, LinkButton, PageHeader, formatDateTime } from '../components/ui';
import { PixelBuilding } from '../components/PixelBuilding';
import { SubjectPicker } from '../components/SubjectPicker';
import { createExam, masteryMap, startAttempt } from '../learning/services';
import { useCurrentSubject } from '../hooks/data';
import { toast } from '../stores/ui';

const TYPES: QuestionType[] = ['mcq', 'ox', 'short', 'blank', 'essay'];

export default function Tower() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { subject } = useCurrentSubject();
  const [types, setTypes] = useState<QuestionType[]>(['mcq', 'ox', 'blank', 'essay']);
  const [count, setCount] = useState(10);
  const [duration, setDuration] = useState(20);
  const [weakFirst, setWeakFirst] = useState(true);
  const [onlyScope, setOnlyScope] = useState(true);
  const [busy, setBusy] = useState(false);
  const docFilter = params.get('doc');

  const info = useLiveQuery(async () => {
    if (!subject) return null;
    const docs = await db.documents.where('subjectId').equals(subject.id).toArray();
    const qs = await db.questions.where('subjectId').equals(subject.id).toArray();
    const attempts = (await db.attempts.toArray()).filter((a) => a.subjectId === subject.id).sort((a, b) => b.startedAt - a.startedAt);
    const exams = await db.exams.bulkGet(attempts.map((a) => a.examId));
    return { docs, qs, attempts: attempts.map((a, i) => ({ a, exam: exams[i] })) };
  }, [subject?.id]);

  const create = async () => {
    if (!subject || !info) return;
    setBusy(true);
    const scopeDocs = new Set(info.docs.filter((d) => (docFilter ? d.id === docFilter : !onlyScope || d.inExamScope)).map((d) => d.id));
    let pool = info.qs.filter((q) => types.includes(q.type) && (!q.documentId || scopeDocs.has(q.documentId)));
    if (!pool.length) {
      setBusy(false);
      toast('조건에 맞는 문제가 없어요. 문제 유형이나 범위를 바꿔 보세요.', 'error');
      return;
    }
    pool = pool.sort(() => Math.random() - 0.5);
    if (weakFirst) {
      const mm = await masteryMap(subject.id);
      pool.sort((a, b) => (mm.get(a.conceptId ?? '')?.mastery ?? 0.5) - (mm.get(b.conceptId ?? '')?.mastery ?? 0.5));
    }
    // 같은 개념에서 너무 많이 나오지 않도록 개념당 최대 2문항
    const perConcept = new Map<string, number>();
    const picked = [];
    for (const q of pool) {
      const k = q.conceptId ?? q.id;
      if ((perConcept.get(k) ?? 0) >= 2) continue;
      perConcept.set(k, (perConcept.get(k) ?? 0) + 1);
      picked.push(q);
      if (picked.length >= count) break;
    }
    picked.sort(() => Math.random() - 0.5);
    const exam = await createExam({ subjectId: subject.id, title: `${subject.name} 모의고사 ${new Date().toLocaleDateString('ko-KR')}`, questionIds: picked.map((q) => q.id), durationMin: duration });
    const attempt = await startAttempt(exam.id);
    navigate(`/tower/exam/${attempt.id}`);
  };

  const available = info ? info.qs.filter((q) => types.includes(q.type)).length : 0;

  return (
    <div>
      <PageHeader
        title="시험의 탑"
        subtitle="실제 시험처럼 시간을 재고, 제출하고, 채점 기준표로 채점해요."
        icon={<PixelBuilding roof="#6fa8e8" wall="#eaf5ff" size={56} />}
        actions={
          <>
            <SubjectPicker />
            <LinkButton to="/tower/author" tone="ghost">
              출제자 모드
            </LinkButton>
          </>
        }
      />
      {!subject || !info ? null : info.qs.length === 0 ? (
        <EmptyState title="아직 문제가 없어요" desc="자료를 올리고 개념을 확인하면 문제가 자동으로 만들어져요. 직접 문제를 만들 수도 있어요." action={<div className="flex gap-2"><LinkButton to="/library">도서관으로</LinkButton><LinkButton to="/tower/author" tone="ghost">문제 만들기</LinkButton></div>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3">
            <h2 className="text-lg font-bold">새 모의고사</h2>
            {docFilter && <InfoBox tone="milk">선택한 자료의 문제로만 출제해요.</InfoBox>}
            <fieldset>
              <legend className="label">문제 유형</legend>
              <div className="flex flex-wrap gap-2">
                {TYPES.map((t) => (
                  <label key={t} className="chip cursor-pointer bg-white">
                    <input type="checkbox" checked={types.includes(t)} onChange={(e) => setTypes((ts) => (e.target.checked ? [...ts, t] : ts.filter((x) => x !== t)))} />
                    {QUESTION_TYPE_LABEL[t]} ({info.qs.filter((q) => q.type === t).length})
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-ink-soft">다중 선택·연결형·순서 배열형·사례 분석형·교직 상황 판단형은 개발 예정이에요. 사례형 문제는 출제자 모드에서 서술형으로 직접 만들 수 있어요.</p>
            </fieldset>
            <label className="block">
              <span className="label">문항 수: {count} (사용 가능 {available})</span>
              <input type="range" min={3} max={40} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full" />
            </label>
            <label className="block">
              <span className="label">시험 시간: {duration}분</span>
              <input type="range" min={5} max={180} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={weakFirst} onChange={(e) => setWeakFirst(e.target.checked)} /> 약한 개념 우선 출제
            </label>
            {!docFilter && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={onlyScope} onChange={(e) => setOnlyScope(e.target.checked)} /> 시험 범위로 지정한 자료만
              </label>
            )}
            <button className="btn-primary w-full" onClick={create} disabled={busy || types.length === 0}>
              {busy ? '준비 중…' : '시험 시작'}
            </button>
          </Card>
          <Card>
            <h2 className="mb-2 text-lg font-bold">시험 기록</h2>
            {info.attempts.length === 0 ? (
              <p className="text-sm text-ink-soft">아직 본 시험이 없어요.</p>
            ) : (
              <ul className="space-y-2">
                {info.attempts.slice(0, 15).map(({ a, exam }) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-ink/15 p-2 text-sm">
                    <div>
                      <div className="font-bold">{exam?.title ?? '삭제된 시험'}</div>
                      <div className="text-xs text-ink-soft">
                        {formatDateTime(a.startedAt)} · {a.status === 'in-progress' ? '응시 중' : a.status === 'submitted' ? '채점 대기' : `${a.score}/${a.maxScore}점`}
                      </div>
                    </div>
                    {a.status === 'in-progress' ? (
                      <Link className="btn-pink btn-sm" to={`/tower/exam/${a.id}`}>
                        이어서 풀기
                      </Link>
                    ) : (
                      <Link className="btn-ghost btn-sm" to={`/tower/result/${a.id}`}>
                        {a.status === 'submitted' ? '채점하기' : '결과 보기'}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
