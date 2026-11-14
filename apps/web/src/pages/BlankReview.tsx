import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BLANK_RULES, compareBlankReview, finalBlankCoverage, recommendBlankRetryDays } from '@academy/learning-engine';
import type { BlankConceptResult, BlankReviewAttempt, BlankVerdict } from '@academy/shared';
import { db } from '../storage/db';
import { Card, EmptyState, InfoBox, LinkButton, PageHeader, Progress, formatDate, formatDateTime } from '../components/ui';
import { saveBlankReview } from '../learning/services';
import { useCurrentSubject } from '../hooks/data';
import { toast } from '../stores/ui';

const VERDICT_LABEL: Record<BlankVerdict, string> = { correct: '정확', partial: '부분', missing: '누락', wrong: '잘못 기억' };
const VERDICT_COLOR: Record<BlankVerdict, string> = { correct: 'bg-mint', partial: 'bg-butter', missing: 'bg-ink-faint/40', wrong: 'bg-pink' };

function TimeCapsule({ attempts }: { attempts: BlankReviewAttempt[] }) {
  const [a, setA] = useState(attempts[attempts.length - 1]?.id);
  const [b, setB] = useState(attempts[0]?.id);
  if (attempts.length < 2) return <p className="text-sm text-ink-soft">같은 범위로 두 번 이상 복습하면 과거 답안과 비교할 수 있어요.</p>;
  const old = attempts.find((x) => x.id === a);
  const now = attempts.find((x) => x.id === b);
  if (!old || !now) return null;
  const verdict = (r: BlankConceptResult) => r.userVerdict ?? r.autoVerdict;
  const improved = now.results.filter((r) => {
    const o = old.results.find((x) => x.conceptId === r.conceptId);
    return o && verdict(o) !== 'correct' && verdict(r) === 'correct';
  });
  const still = now.results.filter((r) => verdict(r) === 'missing' || verdict(r) === 'wrong');
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <select className="input w-auto py-1" value={a} onChange={(e) => setA(e.target.value)} aria-label="과거 답안">
          {attempts.map((x) => (
            <option key={x.id} value={x.id}>
              {formatDateTime(x.createdAt)} ({Math.round(x.coverage * 100)}%)
            </option>
          ))}
        </select>
        <span className="self-center">→</span>
        <select className="input w-auto py-1" value={b} onChange={(e) => setB(e.target.value)} aria-label="최근 답안">
          {attempts.map((x) => (
            <option key={x.id} value={x.id}>
              {formatDateTime(x.createdAt)} ({Math.round(x.coverage * 100)}%)
            </option>
          ))}
        </select>
      </div>
      <p>
        회상률 {Math.round(old.coverage * 100)}% → <b>{Math.round(now.coverage * 100)}%</b>
      </p>
      <p>새로 정확히 떠올린 개념: {improved.length ? improved.map((r) => r.term).join(', ') : '없음'}</p>
      <p>여전히 부족한 개념: {still.length ? still.map((r) => r.term).join(', ') : '없음'}</p>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="rounded bg-white p-2">
          <div className="text-xs text-ink-soft">그때의 답안</div>
          <p className="whitespace-pre-wrap">{old.text}</p>
        </div>
        <div className="rounded bg-white p-2">
          <div className="text-xs text-ink-soft">지금의 답안</div>
          <p className="whitespace-pre-wrap">{now.text}</p>
        </div>
      </div>
    </div>
  );
}

export default function BlankReview() {
  const [params] = useSearchParams();
  const { subject } = useCurrentSubject();
  const docs = useLiveQuery(async () => (subject ? db.documents.where('subjectId').equals(subject.id).toArray() : []), [subject?.id]);
  const [docId, setDocId] = useState<string>(params.get('doc') ?? '');
  const activeDoc = docs?.find((d) => d.id === docId) ?? docs?.[0];
  const [section, setSection] = useState('');
  const [phase, setPhase] = useState<'setup' | 'writing' | 'result' | 'saved'>('setup');
  const [text, setText] = useState('');
  const [startedAt, setStartedAt] = useState(0);
  const [results, setResults] = useState<BlankConceptResult[]>([]);
  const [saved, setSaved] = useState<BlankReviewAttempt | null>(null);

  const concepts = useLiveQuery(async () => {
    if (!activeDoc) return [];
    const all = (await db.concepts.where('documentId').equals(activeDoc.id).toArray()).filter((c) => c.status === 'auto' || c.status === 'verified');
    return section ? all.filter((c) => c.section === section) : all;
  }, [activeDoc?.id, section]);
  const sections = useLiveQuery(async () => {
    if (!activeDoc) return [];
    const all = (await db.concepts.where('documentId').equals(activeDoc.id).toArray()).filter((c) => c.status === 'auto' || c.status === 'verified');
    return [...new Set(all.map((c) => c.section).filter(Boolean))];
  }, [activeDoc?.id]);
  const history = useLiveQuery(async () => (activeDoc ? (await db.blankReviews.where('documentId').equals(activeDoc.id).toArray()).filter((h) => h.section === (section || '전체')).sort((a, b) => b.createdAt - a.createdAt) : []), [activeDoc?.id, section, phase]);
  const coverage = useMemo(() => finalBlankCoverage(results), [results]);

  if (!docs) return null;
  if (!docs.length) return <EmptyState title="백지 복습할 자료가 없어요" action={<LinkButton to="/library">자료 올리기</LinkButton>} />;

  return (
    <div>
      <PageHeader title="백지 복습 훈련기" subtitle="원문을 덮고 기억나는 내용을 모두 써 본 뒤, 원문 개념과 비교해요." actions={<LinkButton to="/lecture" tone="ghost" small>← 마법 강의실</LinkButton>} />

      {phase === 'setup' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3">
            <label className="block">
              <span className="label">자료</span>
              <select className="input" value={activeDoc?.id} onChange={(e) => { setDocId(e.target.value); setSection(''); }}>
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">단원</span>
              <select className="input" value={section} onChange={(e) => setSection(e.target.value)}>
                <option value="">전체</option>
                {sections?.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm">
              이 범위의 확인된 개념: <b>{concepts?.length ?? 0}개</b>
            </p>
            <button className="btn-pink w-full" disabled={!concepts?.length} onClick={() => { setText(''); setStartedAt(Date.now()); setPhase('writing'); }}>
              원문 덮고 시작하기
            </button>
            {concepts?.length === 0 && <p className="text-xs text-ink-soft">확인된 개념이 없어요. 도서관에서 개념을 확인해 주세요.</p>}
          </Card>
          <Card>
            <h2 className="mb-2 font-bold">학습 타임캡슐</h2>
            {history && <TimeCapsule attempts={history} />}
            {history && history.length > 0 && <p className="mt-2 text-xs text-ink-soft">다음 추천 복습일: {formatDate(history[0].nextReviewAt)}</p>}
          </Card>
        </div>
      )}

      {phase === 'writing' && (
        <Card className="space-y-3">
          <p className="text-sm text-ink-soft">
            <b>{activeDoc?.title}</b> {section ? `· ${section}` : '· 전체'} — 용어와 정의, 개념 사이의 관계, 절차를 떠오르는 대로 모두 적어 보세요.
          </p>
          <textarea className="input min-h-[45vh] text-base leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} autoFocus aria-label="백지 복습 답안" placeholder="여기에 기억나는 내용을 자유롭게 쓰세요." />
          <div className="flex justify-between">
            <button className="btn-ghost" onClick={() => setPhase('setup')}>
              그만두기
            </button>
            <button
              className="btn-primary"
              disabled={!text.trim()}
              onClick={() => {
                setResults(compareBlankReview(text, concepts ?? []).results);
                setPhase('result');
              }}
            >
              복습 종료하고 비교
            </button>
          </div>
        </Card>
      )}

      {phase === 'result' && (
        <div className="space-y-3">
          <InfoBox>
            자동 판정은 <b>키워드 비교</b>예요: 용어가 있고 원문 핵심어를 {BLANK_RULES.correctCoverage * 100}% 이상 썼으면 ‘정확’, 용어만 있거나 핵심어를 {BLANK_RULES.partialCoverage * 100}% 이상 썼으면 ‘부분’입니다. 뜻을 잘못 기억했는지는 자동으로 알 수 없으니, 원문과 비교해 판정을 직접 바꿔 주세요.
          </InfoBox>
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-bold">회상률 {Math.round(coverage * 100)}%</span>
              <span className="text-sm text-ink-soft">추천 재복습: {recommendBlankRetryDays(coverage)}일 뒤</span>
            </div>
            <Progress value={coverage} color="bg-pink-deep" label="회상률" />
          </Card>
          <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
            <Card>
              <h3 className="mb-2 font-bold">내가 쓴 답안</h3>
              <p className="whitespace-pre-wrap text-sm">{text}</p>
            </Card>
            <div className="space-y-2">
              {results.map((r, i) => {
                const c = concepts?.find((x) => x.id === r.conceptId);
                const v = r.userVerdict ?? r.autoVerdict;
                return (
                  <Card key={r.conceptId} className="p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <b>{r.term}</b>
                      <span className={`chip ${VERDICT_COLOR[v]}`}>{VERDICT_LABEL[v]}</span>
                      {r.userVerdict && <span className="text-xs text-ink-soft">(직접 판정)</span>}
                      <div className="ml-auto flex gap-1" role="group" aria-label={`${r.term} 판정`}>
                        {(Object.keys(VERDICT_LABEL) as BlankVerdict[]).map((k) => (
                          <button key={k} className={`btn btn-sm px-2 ${v === k ? VERDICT_COLOR[k] : 'bg-white'}`} onClick={() => setResults((rs) => rs.map((x, j) => (j === i ? { ...x, userVerdict: k } : x)))} aria-pressed={v === k}>
                            {VERDICT_LABEL[k]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="mt-1 text-xs">
                      {r.matchedKeywords.length > 0 && <span className="text-mint-deep">쓴 핵심어: {r.matchedKeywords.join(', ')} </span>}
                      {r.missingKeywords.length > 0 && <span className="text-pink-deep">빠진 핵심어: {r.missingKeywords.join(', ')}</span>}
                    </p>
                    {c && <p className="mt-1 rounded bg-butter-soft p-2 text-sm">원문: {c.statement}</p>}
                  </Card>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setPhase('writing')}>
              답안 더 쓰기
            </button>
            <button
              className="btn-primary"
              onClick={async () => {
                const s = await saveBlankReview({ subjectId: activeDoc!.subjectId, documentId: activeDoc!.id, section: section || '전체', text, results, startedAt });
                setSaved(s);
                setPhase('saved');
                toast('백지 복습 결과를 저장했어요.', 'success');
              }}
            >
              결과 저장
            </button>
          </div>
        </div>
      )}

      {phase === 'saved' && saved && (
        <Card className="space-y-3">
          <h2 className="font-pixel text-xl font-bold">저장했어요!</h2>
          <p>
            회상률 {Math.round(saved.coverage * 100)}% · 다음 백지 복습 추천일: <b>{formatDate(saved.nextReviewAt)}</b>
          </p>
          <h3 className="font-bold">보완 학습</h3>
          <ul className="space-y-1 text-sm">
            {saved.results
              .filter((r) => (r.userVerdict ?? r.autoVerdict) !== 'correct')
              .map((r) => (
                <li key={r.conceptId} className="flex flex-wrap items-center gap-2">
                  <b>{r.term}</b>
                  <Link className="btn-ghost btn-sm" to={`/lecture?concept=${r.conceptId}`}>
                    개념 다시 보기
                  </Link>
                  <Link className="btn-ghost btn-sm" to={`/greenhouse?concept=${r.conceptId}`}>
                    카드 복습
                  </Link>
                </li>
              ))}
          </ul>
          <button className="btn-primary" onClick={() => setPhase('setup')}>
            처음으로
          </button>
        </Card>
      )}
    </div>
  );
}
