import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CONCEPT_STATE_LABEL, TUTOR_MODE_LABEL, socraticQuestions, keywordsOf, compact, type ConceptMastery, type TutorMode } from '@academy/learning-engine';
import { CONCEPT_KIND_LABEL, type Question } from '@academy/shared';
import { db } from '../storage/db';
import { Card, EmptyState, InfoBox, LinkButton, PageHeader, Progress, Tabs } from '../components/ui';
import { PixelBuilding } from '../components/PixelBuilding';
import { ConceptEvidenceList, ConceptStatusBadge } from '../components/Evidence';
import { SubjectPicker } from '../components/SubjectPicker';
import { InstantQuestion } from '../features/quiz/QuestionView';
import { masteryMap, recordAnswer, logSession } from '../learning/services';
import { useCurrentSubject } from '../hooks/data';

function Tutor({ term, kind, statement, related }: { term: string; kind: Parameters<typeof socraticQuestions>[1]; statement: string; related: string[] }) {
  const [mode, setMode] = useState<TutorMode>('beginner');
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState(false);
  const qs = socraticQuestions(term, kind, mode, related);
  const keywords = keywordsOf(statement, term, 8);
  const comp = compact(answer);
  const hit = keywords.filter((k) => comp.includes(compact(k)));
  return (
    <Card>
      <h3 className="mb-2 font-bold">소크라테스 튜터</h3>
      <p className="mb-2 text-xs text-ink-soft">정답을 바로 알려 주는 대신 질문으로 스스로 설명하도록 도와요. (로컬 AI 없이 질문 템플릿으로 작동)</p>
      <div className="mb-3 flex flex-wrap gap-1">
        {(Object.keys(TUTOR_MODE_LABEL) as TutorMode[]).map((m) => (
          <button key={m} className={`btn btn-sm ${mode === m ? 'bg-lavender' : 'bg-white'}`} onClick={() => setMode(m)}>
            {TUTOR_MODE_LABEL[m]}
          </button>
        ))}
      </div>
      <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm">
        {qs.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ol>
      <textarea className="input" rows={4} value={answer} onChange={(e) => { setAnswer(e.target.value); setChecked(false); }} placeholder="내 말로 설명해 보세요." aria-label="내 설명" />
      <div className="mt-2 flex items-center gap-2">
        <button className="btn-primary btn-sm" disabled={!answer.trim()} onClick={() => setChecked(true)}>
          원문과 비교
        </button>
      </div>
      {checked && (
        <div className="mt-2 space-y-1 text-sm">
          <p>
            원문 핵심어 {keywords.length}개 중 <b>{hit.length}개</b>를 사용했어요.
            {keywords.filter((k) => !hit.includes(k)).length > 0 && <span className="text-pink-deep"> 빠진 단어: {keywords.filter((k) => !hit.includes(k)).join(', ')}</span>}
          </p>
          <p className="text-xs text-ink-soft">단어 포함 여부만 비교한 결과예요. 뜻이 맞는지는 아래 원문과 직접 대조해 보세요.</p>
          <p className="rounded bg-butter-soft p-2">원문: {statement}</p>
        </div>
      )}
    </Card>
  );
}

function ConceptStudy({ subjectId, initialConcept, docId }: { subjectId: string; initialConcept: string | null; docId: string | null }) {
  const concepts = useLiveQuery(
    async () => (await db.concepts.where('subjectId').equals(subjectId).toArray()).filter((c) => c.status !== 'rejected' && (!docId || c.documentId === docId)).sort((a, b) => a.pageNumber - b.pageNumber),
    [subjectId, docId],
  );
  const [selected, setSelected] = useState<string | null>(initialConcept);
  const [mm, setMm] = useState<Map<string, ConceptMastery>>(new Map());
  useEffect(() => {
    masteryMap(subjectId).then(setMm);
  }, [subjectId, concepts?.length]);
  useEffect(() => {
    if (!selected && concepts?.length) setSelected(concepts[0].id);
  }, [concepts, selected]);
  const current = concepts?.find((c) => c.id === selected);
  const qCount = useLiveQuery(async () => (selected ? db.questions.where('conceptId').equals(selected).count() : 0), [selected]);

  if (!concepts) return null;
  if (!concepts.length)
    return <EmptyState title="공부할 개념이 없어요" desc="도서관에서 자료를 올려 주세요." action={<LinkButton to="/library">도서관으로</LinkButton>} />;

  const m = current ? mm.get(current.id) : undefined;
  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="max-h-[70vh] overflow-y-auto p-2">
        <ul>
          {concepts.map((c) => {
            const cm = mm.get(c.id);
            return (
              <li key={c.id}>
                <button onClick={() => setSelected(c.id)} className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${c.id === selected ? 'bg-lavender font-bold' : 'hover:bg-lavender-soft'}`}>
                  <span className="truncate">{c.term}</span>
                  <span className="shrink-0 text-[10px] text-ink-soft">{cm ? `${Math.round(cm.mastery * 100)}%` : ''}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
      {current && (
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-pixel text-xl font-bold">{current.term}</h2>
              <span className="chip bg-lavender-soft">{CONCEPT_KIND_LABEL[current.kind]}</span>
              <ConceptStatusBadge status={current.status} />
            </div>
            {current.status === 'needs-check' && (
              <div className="mt-2">
                <InfoBox tone="butter">아직 확인이 필요한 개념이라 문제로 만들지 않았어요. 원문과 대조한 뒤 도서관에서 ‘원문과 맞아요’를 눌러 주세요.</InfoBox>
              </div>
            )}
            <p className="mt-3 whitespace-pre-wrap text-base leading-relaxed">{current.statement}</p>
            {current.userNote && <p className="mt-2 text-sm text-ink-soft">내 메모: {current.userNote}</p>}
            {m && (
              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                <div>
                  숙련도 {Math.round(m.mastery * 100)}%
                  <Progress value={m.mastery} label="숙련도" />
                </div>
                <div>상태: {CONCEPT_STATE_LABEL[m.state]}</div>
                <div>
                  풀이 {m.attempts}회 · 정답률 {Math.round(m.accuracy * 100)}%
                </div>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link className="btn-primary btn-sm" to={`/lecture?concept=${current.id}&tab=quiz`}>
                이 개념 문제 풀기 ({qCount ?? 0})
              </Link>
              <Link className="btn-mint btn-sm" to={`/greenhouse?concept=${current.id}`}>
                카드 복습
              </Link>
            </div>
          </Card>
          <Card>
            <h3 className="mb-2 font-bold">원문 근거</h3>
            <ConceptEvidenceList conceptId={current.id} />
          </Card>
          <Tutor term={current.term} kind={current.kind} statement={current.statement} related={concepts.filter((c) => c.id !== current.id && c.section === current.section).map((c) => c.term)} />
        </div>
      )}
    </div>
  );
}

function QuickQuiz({ subjectId, conceptId, docId }: { subjectId: string; conceptId: string | null; docId: string | null }) {
  const [round, setRound] = useState(0);
  const [index, setIndex] = useState(0);
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const [startedAt] = useState(Date.now());
  const pool = useLiveQuery(async () => {
    let qs: Question[] = conceptId ? await db.questions.where('conceptId').equals(conceptId).toArray() : await db.questions.where('subjectId').equals(subjectId).toArray();
    if (docId) qs = qs.filter((q) => q.documentId === docId);
    return qs;
  }, [subjectId, conceptId, docId]);
  const questions = useMemo(() => {
    if (!pool) return [];
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool?.length, round]);

  useEffect(
    () => () => {
      logSession('quiz', startedAt, Date.now(), subjectId);
    },
    [startedAt, subjectId],
  );

  if (!pool) return null;
  if (!questions.length) return <EmptyState title="풀 문제가 없어요" desc="확인된 개념이 있어야 문제가 만들어져요. 도서관에서 개념을 확인하거나, 시험의 탑 → 출제자 모드에서 직접 문제를 만들어 보세요." action={<LinkButton to="/library">도서관으로</LinkButton>} />;
  if (index >= questions.length)
    return (
      <Card className="text-center">
        <h2 className="font-pixel text-xl font-bold">퀴즈 완료!</h2>
        <p className="mt-2">
          {stats.total}문제 중 {stats.correct}문제 정답 ({stats.total ? Math.round((stats.correct / stats.total) * 100) : 0}%)
        </p>
        <p className="text-sm text-ink-soft">틀린 문제는 탐정 연구소의 오답 노트에 저장되고 내일 다시 풀도록 예약됐어요.</p>
        <div className="mt-3 flex justify-center gap-2">
          <button className="btn-primary" onClick={() => { setRound((r) => r + 1); setIndex(0); setStats({ correct: 0, total: 0 }); }}>
            한 번 더
          </button>
          <LinkButton to="/detective" tone="ghost">
            오답 노트
          </LinkButton>
        </div>
      </Card>
    );
  const q = questions[index];
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between text-xs text-ink-soft">
        <span>
          {index + 1} / {questions.length}
        </span>
        <span>
          정답 {stats.correct}/{stats.total}
        </span>
      </div>
      <InstantQuestion
        key={`${round}-${q.id}`}
        q={q}
        index={index}
        onAnswered={async (value, ms, ratio) => {
          const { record } = await recordAnswer({ question: q, value, source: 'quiz', responseMs: ms, essayRatio: ratio });
          setStats((s) => ({ correct: s.correct + (record.correct ? 1 : 0), total: s.total + 1 }));
        }}
      />
      <div className="mt-3 flex justify-end">
        <button className="btn-ghost btn-sm" onClick={() => setIndex((i) => i + 1)}>
          다음 문제 →
        </button>
      </div>
    </Card>
  );
}

export default function Lecture() {
  const [params, setParams] = useSearchParams();
  const { subject } = useCurrentSubject();
  const [tab, setTab] = useState<'concept' | 'quiz'>(params.get('tab') === 'quiz' ? 'quiz' : 'concept');
  const conceptId = params.get('concept');
  const docId = params.get('doc');
  const conceptSubject = useLiveQuery(async () => (conceptId ? (await db.concepts.get(conceptId))?.subjectId : undefined), [conceptId]);
  const subjectId = conceptSubject ?? subject?.id;

  return (
    <div>
      <PageHeader
        title="마법 강의실"
        subtitle="원문 근거로 개념을 익히고, 스스로 설명하고, 바로 문제로 확인해요."
        icon={<PixelBuilding roof="#f08fb0" wall="#ffe3ec" size={56} />}
        actions={
          <>
            <SubjectPicker />
            <LinkButton to="/lecture/blank" tone="pink">
              백지 복습 훈련
            </LinkButton>
          </>
        }
      />
      <Tabs
        value={tab}
        onChange={(t) => {
          setTab(t);
          const next = new URLSearchParams(params);
          next.set('tab', t);
          setParams(next, { replace: true });
        }}
        items={[
          { value: 'concept', label: '개념 학습' },
          { value: 'quiz', label: '빠른 퀴즈' },
        ]}
      />
      {conceptId && tab === 'quiz' && (
        <p className="mb-2 text-sm">
          선택한 개념의 문제만 풀고 있어요.{' '}
          <button className="underline" onClick={() => setParams({ tab: 'quiz' })}>
            전체 문제로
          </button>
        </p>
      )}
      {!subjectId ? (
        <EmptyState title="과목이 없어요" action={<LinkButton to="/library">도서관으로</LinkButton>} />
      ) : tab === 'concept' ? (
        <ConceptStudy subjectId={subjectId} initialConcept={conceptId} docId={docId} />
      ) : (
        <QuickQuiz subjectId={subjectId} conceptId={conceptId} docId={docId} />
      )}
    </div>
  );
}
