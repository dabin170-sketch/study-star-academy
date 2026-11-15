/**
 * 시청 후 복습: 3줄 정리 → 이해도 퀴즈 → 장면으로 설명하기 → 잘못된 대사 찾기 → 백지 복습·카드·오답 연결.
 * 시청 완료만으로는 숙달로 기록하지 않고, 실제로 떠올리고 적용한 결과만 학습 기록에 남긴다.
 */
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { compact, containsKeyword, keywordsOf, seededRandom, shuffle, tokenize } from '@academy/learning-engine';
import type { Concept, Question } from '@academy/shared';
import { db, entity } from '../storage/db';
import { Card, EmptyState, InfoBox, Loading, PageHeader, Progress } from '../components/ui';
import { InstantQuestion } from '../features/quiz/QuestionView';
import { recordAnswer } from '../learning/services';
import { toast } from '../stores/ui';

function keywordCheck(text: string, statements: { term: string; statement: string }[]) {
  const tokens = tokenize(text);
  const comp = compact(text);
  return statements.map((s) => {
    const kws = keywordsOf(s.statement, s.term, 6);
    const hit = kws.filter((k) => containsKeyword(tokens, comp, k));
    return { term: s.term, termFound: comp.includes(compact(s.term)), hit, miss: kws.filter((k) => !hit.includes(k)) };
  });
}

export default function TheaterReview() {
  const { id = '' } = useParams();
  const project = useLiveQuery(() => db.storyProjects.get(id), [id]);
  const data = useLiveQuery(async () => {
    if (!project) return null;
    const ids = project.episode.objectives.map((o) => o.conceptId);
    const concepts = (await db.concepts.bulkGet(ids)).filter((c): c is Concept => !!c);
    const qs = (await db.questions.where('conceptId').anyOf(ids).toArray()).filter((q) => q.type !== 'essay');
    const others = (await db.concepts.where('subjectId').equals(project.subjectId).toArray()).filter((c) => !ids.includes(c.id) && (c.status === 'auto' || c.status === 'verified'));
    return { concepts, qs, others };
  }, [project?.id]);
  const [summary, setSummary] = useState('');
  const [summaryChecked, setSummaryChecked] = useState(false);
  const [explain, setExplain] = useState('');
  const [explainChecked, setExplainChecked] = useState(false);
  const [qi, setQi] = useState(0);
  const [score, setScore] = useState({ c: 0, n: 0 });
  const [wrongPick, setWrongPick] = useState<number | null>(null);

  const quiz = useMemo(() => (data ? shuffle(data.qs, seededRandom(id)).slice(0, 5) : []), [data, id]);
  // 잘못된 대사 찾기: 원문 문장 3개 + 용어를 바꿔치기한 문장 1개
  const wrongLines = useMemo(() => {
    if (!data || !data.concepts.length) return null;
    const rand = seededRandom(`${id}-wrong`);
    const target = data.concepts[0];
    const swap = data.others.find((o) => o.statement.startsWith(o.term) && !o.statement.includes(target.term));
    if (!swap) return null;
    const fake = target.term + swap.statement.slice(swap.term.length);
    const truths = shuffle([...data.concepts, ...data.others].filter((c) => c.id !== swap.id), rand).slice(0, 3).map((c) => ({ text: c.statement, wrong: false, conceptId: c.id }));
    return { items: shuffle([...truths, { text: fake, wrong: true, conceptId: target.id }], rand), target, swap };
  }, [data, id]);

  if (project === undefined || data === undefined) return <Loading />;
  if (!project || !data) return <EmptyState title="작품을 찾을 수 없어요" action={<Link className="btn-primary" to="/theater">이야기 극장으로</Link>} />;
  const statements = data.concepts.map((c) => ({ term: c.term, statement: c.statement }));
  const sumRes = summaryChecked ? keywordCheck(summary, statements) : [];
  const expRes = explainChecked ? keywordCheck(explain, statements) : [];
  const firstConcept = data.concepts[0];

  return (
    <div className="space-y-4">
      <PageHeader title="이야기 복습" subtitle={`${project.title} — 본 내용을 직접 떠올리고 적용해 봐요.`} actions={<Link className="btn-ghost btn-sm" to={`/theater/${id}/play`}>← 다시 보기</Link>} />
      <InfoBox>시청만으로는 숙달로 기록하지 않아요. 아래 활동에서 직접 떠올리고 맞힌 결과가 숙련도와 오답 노트에 반영돼요.</InfoBox>

      <Card className="space-y-2" as="section">
        <h2 className="font-pixel text-lg font-bold">1. 핵심 개념 3줄 정리</h2>
        <textarea className="input" rows={3} value={summary} onChange={(e) => { setSummary(e.target.value); setSummaryChecked(false); }} placeholder="원문을 보지 말고 세 줄로 정리해 보세요." aria-label="3줄 정리" />
        <button className="btn-primary btn-sm" disabled={summary.trim().split('\n').filter(Boolean).length < 1} onClick={() => setSummaryChecked(true)}>
          원문과 비교
        </button>
        {sumRes.map((r) => (
          <p key={r.term} className="text-sm">
            <b>{r.term}</b> {r.termFound ? '✔ 용어 사용' : '✕ 용어 없음'} · 핵심어 {r.hit.length}/{r.hit.length + r.miss.length}
            {r.miss.length > 0 && <span className="text-pink-deep"> (빠진 말: {r.miss.join(', ')})</span>}
          </p>
        ))}
        {summaryChecked && <p className="text-xs text-ink-soft">단어 포함 여부만 비교한 참고 결과예요.</p>}
      </Card>

      <Card className="space-y-2" as="section">
        <h2 className="font-pixel text-lg font-bold">2. 이해도 확인 퀴즈</h2>
        {quiz.length === 0 ? (
          <p className="text-sm text-ink-soft">이 개념으로 만든 문제가 없어요.</p>
        ) : qi < quiz.length ? (
          <>
            <p className="text-xs text-ink-soft">
              {qi + 1}/{quiz.length} · 정답 {score.c}/{score.n}
            </p>
            <InstantQuestion
              key={quiz[qi].id}
              q={quiz[qi] as Question}
              onAnswered={async (v, ms) => {
                const { record } = await recordAnswer({ question: quiz[qi], value: v, source: 'quiz', responseMs: ms });
                setScore((s) => ({ c: s.c + (record.correct ? 1 : 0), n: s.n + 1 }));
              }}
            />
            <button className="btn-ghost btn-sm" onClick={() => setQi((i) => i + 1)}>
              다음 →
            </button>
          </>
        ) : (
          <div>
            <p className="font-bold">
              퀴즈 결과 {score.c}/{score.n}
            </p>
            <Progress value={score.c} max={score.n || 1} color="bg-mint-deep" label="퀴즈 정답률" />
            <p className="mt-1 text-xs text-ink-soft">틀린 문제는 오답 노트에 저장되고 다시 풀 날짜가 예약됐어요.</p>
          </div>
        )}
      </Card>

      <Card className="space-y-2" as="section">
        <h2 className="font-pixel text-lg font-bold">3. 기억나는 장면으로 설명하기</h2>
        <p className="text-sm">이야기의 어느 장면에서 {firstConcept ? `‘${firstConcept.term}’` : '개념'}을(를) 이해했나요? 그 장면을 떠올리며 개념을 설명해 보세요.</p>
        <textarea className="input" rows={3} value={explain} onChange={(e) => { setExplain(e.target.value); setExplainChecked(false); }} aria-label="장면으로 설명" />
        <button className="btn-primary btn-sm" disabled={!explain.trim()} onClick={() => setExplainChecked(true)}>
          원문과 비교
        </button>
        {expRes.map((r) => (
          <p key={r.term} className="text-sm">
            <b>{r.term}</b>: 핵심어 {r.hit.length}개 사용 {r.miss.length > 0 && <span className="text-pink-deep">· 더 넣으면 좋은 말: {r.miss.join(', ')}</span>}
          </p>
        ))}
      </Card>

      {wrongLines && (
        <Card className="space-y-2" as="section">
          <h2 className="font-pixel text-lg font-bold">4. 잘못된 대사 찾아보기</h2>
          <p className="text-sm">캐릭터들이 한 말 중 하나가 틀렸어요. 어느 것일까요?</p>
          <div className="grid gap-2">
            {wrongLines.items.map((it, i) => (
              <button
                key={i}
                disabled={wrongPick !== null}
                className={`rounded-lg border-2 p-2 text-left text-sm ${wrongPick === i ? (it.wrong ? 'border-mint-deep bg-mint' : 'border-pink-deep bg-pink') : wrongPick !== null && it.wrong ? 'border-mint-deep bg-mint-soft' : 'border-ink/30 bg-white'}`}
                onClick={async () => {
                  setWrongPick(i);
                  // 학습 기록(회상·판별) — 오답 노트에는 넣지 않고 숙련도 계산에만 반영
                  await db.answers.add(
                    entity({ questionId: `theater-wrong:${id}`, conceptId: wrongLines.target.id, subjectId: project.subjectId, source: 'quiz' as const, questionType: 'ox' as const, correct: it.wrong, scoreRatio: it.wrong ? 1 : 0, responseMs: 0, answeredAt: Date.now(), userAnswer: i }),
                  );
                  if (!it.wrong) toast('아쉬워요. 바꿔치기된 문장을 확인해 보세요.');
                }}
              >
                “{it.text}”
              </button>
            ))}
          </div>
          {wrongPick !== null && (
            <p className="text-sm">
              틀린 대사는 ‘{wrongLines.swap.term}’의 원문 설명에 용어만 ‘{wrongLines.target.term}’(으)로 바꾼 문장이었어요. ‘{wrongLines.target.term}’의 원문: “{wrongLines.target.statement}”
            </p>
          )}
        </Card>
      )}

      <Card className="space-y-2" as="section">
        <h2 className="font-pixel text-lg font-bold">5. 이어서 공부하기</h2>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-pink btn-sm" to={`/lecture/blank?doc=${project.documentId}`}>
            백지 복습
          </Link>
          {data.concepts.map((c) => (
            <Link key={c.id} className="btn-mint btn-sm" to={`/greenhouse?concept=${c.id}`}>
              {c.term} 카드
            </Link>
          ))}
          <Link className="btn-ghost btn-sm" to="/detective">
            오답 노트
          </Link>
        </div>
        <p className="text-xs text-ink-soft">이 작품의 개념 카드는 기억 온실의 간격 반복 일정에 이미 들어 있어요.</p>
      </Card>
    </div>
  );
}
