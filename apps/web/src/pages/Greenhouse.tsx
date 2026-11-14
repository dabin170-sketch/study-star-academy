import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { DEFAULT_PARAMS, formatInterval, keywordsOf, compact, previewIntervals } from '@academy/learning-engine';
import { RATING_LABEL, type Flashcard, type Question, type Rating } from '@academy/shared';
import { db } from '../storage/db';
import { Card, EmptyState, LinkButton, PageHeader, Tabs } from '../components/ui';
import { PixelBuilding } from '../components/PixelBuilding';
import { SubjectPicker } from '../components/SubjectPicker';
import { InstantQuestion } from '../features/quiz/QuestionView';
import { logSession, recordAnswer, reviewFlashcard } from '../learning/services';
import { useCurrentSubject, useProfile } from '../hooks/data';

const NEW_PER_SESSION = 20;
const TYPE_LABEL: Record<Flashcard['type'], string> = { qa: '질문', term: '용어 → 정의', cloze: '빈칸', compare: '비교', case: '사례', order: '순서', image: '이미지' };

function Review({ subjectId, conceptId, docId }: { subjectId: string; conceptId: string | null; docId: string | null }) {
  const profile = useProfile();
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [sessionStart] = useState(Date.now());
  const [cramAll, setCramAll] = useState(false);
  const queue = useLiveQuery(async () => {
    const now = Date.now();
    let cards = await db.flashcards.where('subjectId').equals(subjectId).filter((c) => !c.suspended).toArray();
    if (conceptId) cards = cards.filter((c) => c.conceptId === conceptId);
    if (docId) cards = cards.filter((c) => c.documentId === docId);
    if (conceptId || cramAll) return cards.sort((a, b) => a.sched.due - b.sched.due);
    const due = cards.filter((c) => c.sched.state !== 'new' && c.sched.due <= now).sort((a, b) => a.sched.due - b.sched.due);
    const fresh = cards.filter((c) => c.sched.state === 'new').slice(0, Math.max(0, NEW_PER_SESSION - done));
    return [...due, ...fresh];
  }, [subjectId, conceptId, docId, cramAll]);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const card = queue?.find((c) => !skipped.has(c.id));
  const params = { ...DEFAULT_PARAMS, desiredRetention: profile?.settings.desiredRetention ?? 0.9 };
  const preview = useMemo(() => (card ? previewIntervals(card.sched, Date.now(), params) : null), [card?.id, card?.sched.due]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      logSession('flashcard', sessionStart, Date.now(), subjectId);
    },
    [sessionStart, subjectId],
  );

  const rate = useCallback(
    async (r: Rating) => {
      if (!card) return;
      await reviewFlashcard(card.id, r);
      // 몰아보기 모드에서는 같은 카드를 다시 보지 않도록 건너뜀 목록에 넣는다
      if (cramAll || conceptId) setSkipped((s) => new Set(s).add(card.id));
      setFlipped(false);
      setDone((d) => d + 1);
    },
    [card, cramAll, conceptId],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && ['1', '2', '3', '4'].includes(e.key)) rate(Number(e.key) as Rating);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped, rate]);

  if (!queue) return null;
  if (!card)
    return (
      <EmptyState
        title={done > 0 ? `오늘 복습 완료! (${done}장)` : '지금 복습할 카드가 없어요'}
        desc="간격 반복 일정에 따라 다음 복습 때 다시 알려 드려요. 더 공부하고 싶다면 모든 카드를 몰아서 볼 수 있어요."
        action={
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => { setCramAll(true); setSkipped(new Set()); }}>
              모든 카드 몰아보기
            </button>
            <LinkButton to="/library" tone="ghost">
              자료 더 올리기
            </LinkButton>
          </div>
        }
      />
    );

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <div className="flex items-center justify-between text-sm text-ink-soft">
        <span>남은 카드 {queue.filter((c) => !skipped.has(c.id)).length}장 · 오늘 {done}장 복습</span>
        <span className="chip bg-white">{TYPE_LABEL[card.type]}</span>
      </div>
      <div className="flip-card">
        <button className={`flip-inner relative block h-72 w-full ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped((f) => !f)} aria-label={flipped ? '앞면 보기' : '정답 보기(스페이스)'}>
          <div className="flip-face card absolute inset-0 flex items-center justify-center overflow-y-auto bg-white p-6">
            <p className="whitespace-pre-wrap text-center font-pixel text-xl leading-relaxed">{card.front}</p>
          </div>
          <div className="flip-face flip-back card absolute inset-0 flex items-center justify-center overflow-y-auto bg-mint-soft p-6">
            <p className="whitespace-pre-wrap text-center text-base leading-relaxed">{card.back}</p>
          </div>
        </button>
      </div>
      {!flipped ? (
        <button className="btn-primary w-full py-3" onClick={() => setFlipped(true)}>
          정답 보기 <span className="text-xs opacity-70">(스페이스)</span>
        </button>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {([1, 2, 3, 4] as Rating[]).map((r) => (
            <button key={r} className={`btn flex-col py-2 ${['bg-pink', 'bg-butter', 'bg-mint', 'bg-milk'][r - 1]}`} onClick={() => rate(r)}>
              <span>{RATING_LABEL[r]}</span>
              <span className="text-[11px] font-normal">{preview ? formatInterval(preview[r]) : ''} · {r}</span>
            </button>
          ))}
        </div>
      )}
      <p className="text-center text-xs text-ink-soft">FSRS-4.5 간격 반복 · 목표 기억 유지율 {Math.round(params.desiredRetention * 100)}% (설정에서 조절)</p>
    </div>
  );
}

type LabMode = 'cloze' | 'def-to-term' | 'find-wrong' | 'similar' | 'timed' | 'keywords' | 'cumulative';
const LAB_MODES: { value: LabMode; label: string; desc: string }[] = [
  { value: 'cloze', label: '빈칸 채우기', desc: '원문 문장의 빈칸에 들어갈 용어를 직접 써요.' },
  { value: 'keywords', label: '키워드만 보고 설명', desc: '핵심어만 보고 개념을 설명해 봐요.' },
  { value: 'def-to-term', label: '정의 보고 개념 맞히기', desc: '설명을 읽고 해당 개념을 골라요.' },
  { value: 'find-wrong', label: '틀린 설명 찾기', desc: '용어를 바꿔 넣은 문장이 맞는지 판단해요.' },
  { value: 'similar', label: '비슷한 개념 구별', desc: '같은 종류의 개념 중에서 골라요.' },
  { value: 'timed', label: '시간제한 회상(20초)', desc: '20초 안에 답해요.' },
  { value: 'cumulative', label: '누적 복습', desc: '지금까지 푼 문제를 섞어서 다시 풀어요.' },
];

function KeywordExplain({ subjectId }: { subjectId: string }) {
  const concepts = useLiveQuery(async () => (await db.concepts.where('subjectId').equals(subjectId).toArray()).filter((c) => c.status === 'auto' || c.status === 'verified'), [subjectId]);
  const [i, setI] = useState(0);
  const [text, setText] = useState('');
  const [shown, setShown] = useState(false);
  if (!concepts?.length) return <p className="text-sm">확인된 개념이 없어요.</p>;
  const c = concepts[i % concepts.length];
  const kws = keywordsOf(c.statement, c.term, 6);
  const hit = kws.filter((k) => compact(text).includes(compact(k)));
  return (
    <Card className="space-y-3">
      <p className="text-sm">다음 핵심어로 설명되는 개념은 무엇이고, 어떤 뜻인가요?</p>
      <div className="flex flex-wrap gap-1">
        {kws.map((k) => (
          <span key={k} className="chip bg-butter">
            {k}
          </span>
        ))}
      </div>
      <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="개념 이름과 설명을 써 보세요." aria-label="설명" />
      {!shown ? (
        <button className="btn-primary btn-sm" onClick={() => setShown(true)} disabled={!text.trim()}>
          확인
        </button>
      ) : (
        <div className="space-y-1 text-sm">
          <p>
            개념: <b>{c.term}</b> {compact(text).includes(compact(c.term)) ? '✔ 맞혔어요' : '— 다시 확인해 보세요'}
          </p>
          <p>핵심어 {kws.length}개 중 {hit.length}개 사용(단어 비교, 참고용)</p>
          <p className="rounded bg-butter-soft p-2">원문: {c.statement}</p>
          <button className="btn-ghost btn-sm" onClick={() => { setI((x) => x + 1); setText(''); setShown(false); }}>
            다음 개념 →
          </button>
        </div>
      )}
    </Card>
  );
}

function MemoryLab({ subjectId }: { subjectId: string }) {
  const [mode, setMode] = useState<LabMode | null>(null);
  const [idx, setIdx] = useState(0);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(Date.now());
  const qs = useLiveQuery(async () => {
    if (!mode || mode === 'keywords') return [];
    let all = await db.questions.where('subjectId').equals(subjectId).toArray();
    if (mode === 'cloze') all = all.filter((q) => q.generator === 'cloze');
    if (mode === 'def-to-term' || mode === 'similar') all = all.filter((q) => q.generator === 'def-to-term' || (q.origin === 'user' && q.type === 'mcq'));
    if (mode === 'find-wrong') all = all.filter((q) => q.type === 'ox');
    if (mode === 'timed') all = all.filter((q) => q.type !== 'essay');
    if (mode === 'cumulative') {
      const answered = new Set((await db.answers.where('subjectId').equals(subjectId).toArray()).map((a) => a.questionId));
      all = all.filter((q) => answered.has(q.id));
    }
    return all.sort(() => Math.random() - 0.5).slice(0, 10) as Question[];
  }, [mode, subjectId]);
  useEffect(() => {
    if (mode !== 'timed') return;
    setDeadline(Date.now() + 20_000);
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [mode, idx]);

  if (!mode)
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LAB_MODES.map((m) => (
          <button key={m.value} className="card p-4 text-left hover:bg-lavender-soft" onClick={() => { setMode(m.value); setIdx(0); }}>
            <div className="font-pixel font-bold">{m.label}</div>
            <div className="text-xs text-ink-soft">{m.desc}</div>
          </button>
        ))}
      </div>
    );
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <button className="btn-ghost btn-sm" onClick={() => setMode(null)}>
        ← 실험 고르기
      </button>
      {mode === 'keywords' ? (
        <KeywordExplain subjectId={subjectId} />
      ) : !qs ? null : qs.length === 0 ? (
        <EmptyState title="이 실험에 쓸 문제가 없어요" desc="확인된 개념이 더 있어야 하거나, 누적 복습은 먼저 문제를 풀어야 해요." />
      ) : idx >= qs.length ? (
        <Card className="text-center">
          <p className="font-pixel text-lg font-bold">실험 완료!</p>
          <button className="btn-primary mt-2" onClick={() => setIdx(0)}>
            다시 하기
          </button>
        </Card>
      ) : (
        <Card>
          {mode === 'timed' && (
            <p className={`mb-2 font-pixel text-sm ${deadline - now < 5000 ? 'text-pink-deep' : ''}`} aria-live="polite">
              남은 시간 {Math.max(0, Math.ceil((deadline - now) / 1000))}초 {deadline - now <= 0 && '— 시간 초과! 답을 확인하고 다음으로 넘어가세요.'}
            </p>
          )}
          <InstantQuestion key={qs[idx].id} q={qs[idx]} index={idx} onAnswered={async (v, ms, ratio) => { await recordAnswer({ question: qs[idx], value: mode === 'timed' && Date.now() > deadline ? null : v, source: 'quiz', responseMs: ms, essayRatio: ratio }); }} />
          <div className="mt-3 flex justify-end">
            <button className="btn-ghost btn-sm" onClick={() => setIdx((i) => i + 1)}>
              다음 →
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}

export default function Greenhouse() {
  const [params] = useSearchParams();
  const { subject } = useCurrentSubject();
  const [tab, setTab] = useState<'review' | 'lab'>('review');
  const conceptId = params.get('concept');
  const docId = params.get('doc');
  const conceptSubject = useLiveQuery(async () => (conceptId ? (await db.concepts.get(conceptId))?.subjectId : undefined), [conceptId]);
  const subjectId = conceptSubject ?? subject?.id;
  return (
    <div>
      <PageHeader title="기억 온실" subtitle="간격 반복으로 잊어버리기 직전에 다시 떠올려요. 키보드: 스페이스=뒤집기, 1~4=평가" icon={<PixelBuilding roof="#4fbf93" wall="#e6faf1" size={56} />} actions={<SubjectPicker />} />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'review', label: '오늘의 복습' }, { value: 'lab', label: '암기 실험실' }]} />
      {!subjectId ? <EmptyState title="과목이 없어요" action={<LinkButton to="/library">도서관으로</LinkButton>} /> : tab === 'review' ? <Review subjectId={subjectId} conceptId={conceptId} docId={docId} /> : <MemoryLab subjectId={subjectId} />}
    </div>
  );
}
