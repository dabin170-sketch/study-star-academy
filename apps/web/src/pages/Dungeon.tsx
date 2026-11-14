/**
 * 개념 던전: 정답이면 한 칸 전진, 처음 틀리면 힌트와 함께 한 번 더, 두 번 틀리면 하트를 잃고
 * 그 문제는 오답 노트(복습 문제)로 옮겨진다. 마지막 방은 보스 3문제.
 * 경험치는 첫 시도에 맞힌 문제만(같은 문제는 하루 1회) 준다.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { AnswerValue, Question } from '@academy/shared';
import { gradeObjective } from '@academy/learning-engine';
import { db } from '../storage/db';
import { Card, EmptyState, LinkButton, PageHeader } from '../components/ui';
import { PixelCharacter } from '../components/PixelCharacter';
import { SubjectPicker } from '../components/SubjectPicker';
import { AnswerInput, QuestionPrompt } from '../features/quiz/QuestionView';
import { logSession, recordGameAnswer } from '../learning/services';
import { useCurrentSubject, useProfile } from '../hooks/data';

const ROOMS = 8;
const BOSS = 3;

function hintFor(q: Question): string {
  if (q.type === 'mcq') {
    const wrong = q.choices!.map((_, i) => i).filter((i) => i !== q.answer);
    return `힌트: ‘${q.choices![wrong[0]]}’은(는) 정답이 아니에요.`;
  }
  if (q.type === 'blank' || q.type === 'short') return `힌트: 정답은 ‘${String(q.answer)[0]}’(으)로 시작하고 ${String(q.answer).length}글자예요.`;
  return '힌트: 원문 문장을 그대로 옮긴 문장인지, 용어만 바뀐 문장인지 살펴보세요.';
}

export default function Dungeon() {
  const { subject } = useCurrentSubject();
  const profile = useProfile();
  const pool = useLiveQuery(async () => (subject ? (await db.questions.where('subjectId').equals(subject.id).toArray()).filter((q) => q.type !== 'essay') : []), [subject?.id]);
  const [seed, setSeed] = useState(0);
  const questions = useMemo(() => (pool ? [...pool].sort(() => Math.random() - 0.5).slice(0, ROOMS + BOSS + 6) : []), [pool?.length, seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const [qi, setQi] = useState(0);
  const [pos, setPos] = useState(0);
  const [hearts, setHearts] = useState(3);
  const [bossHp, setBossHp] = useState(BOSS);
  const [value, setValue] = useState<AnswerValue>(null);
  const [tries, setTries] = useState(0);
  const [msg, setMsg] = useState<{ text: string; tone: 'good' | 'bad' | 'hint' } | null>(null);
  const [walking, setWalking] = useState(false);
  const [stats, setStats] = useState({ firstTry: 0, reviewAdded: 0 });
  const [startedAt, setStartedAt] = useState(Date.now());
  const [qStart, setQStart] = useState(Date.now());
  const [locked, setLocked] = useState(false);

  useEffect(() => () => void logSession('game', startedAt, Date.now(), subject?.id), [startedAt, subject?.id]);

  const q = questions[qi];
  const inBoss = pos >= ROOMS;
  const won = inBoss && bossHp <= 0;
  const lost = hearts <= 0;
  const outOfQuestions = !q && !won && !lost;

  const restart = () => {
    setSeed((s) => s + 1);
    setQi(0);
    setPos(0);
    setHearts(3);
    setBossHp(BOSS);
    setValue(null);
    setTries(0);
    setMsg(null);
    setStats({ firstTry: 0, reviewAdded: 0 });
    setStartedAt(Date.now());
    setQStart(Date.now());
  };

  const next = () => {
    setQi((i) => i + 1);
    setValue(null);
    setTries(0);
    setMsg(null);
    setQStart(Date.now());
    setLocked(false);
  };

  const advance = () => {
    if (inBoss) setBossHp((h) => h - 1);
    else {
      setWalking(true);
      setTimeout(() => setWalking(false), 600);
      setPos((p) => p + 1);
    }
  };

  const submit = async () => {
    if (!q || locked) return;
    const correct = gradeObjective(q, value).correct;
    if (tries === 0) await recordGameAnswer(q, value, Date.now() - qStart);
    if (correct) {
      if (tries === 0) setStats((s) => ({ ...s, firstTry: s.firstTry + 1 }));
      setMsg({ text: tries === 0 ? '정답! 앞으로 나아가요.' : '힌트를 보고 맞혔어요! (경험치는 첫 시도 정답에만)', tone: 'good' });
      advance();
      setLocked(true);
    } else if (tries === 0) {
      setTries(1);
      setMsg({ text: hintFor(q), tone: 'hint' });
      setValue(null);
    } else {
      setHearts((h) => h - 1);
      setStats((s) => ({ ...s, reviewAdded: s.reviewAdded + 1 }));
      const ans = q.type === 'mcq' ? q.choices![q.answer as number] : q.type === 'ox' ? (q.answer ? 'O' : 'X') : String(q.answer);
      setMsg({ text: `정답은 ‘${ans}’였어요. 이 문제는 오답 노트에 복습 문제로 저장했어요.`, tone: 'bad' });
      setLocked(true);
    }
  };

  if (!subject || !pool) return null;
  if (pool.length < 5) return <EmptyState title="던전에 쓸 문제가 부족해요" desc="확인된 개념에서 문제를 5개 이상 만들 수 있어야 해요." action={<LinkButton to="/library">도서관으로</LinkButton>} />;

  return (
    <div className="space-y-4">
      <PageHeader title="개념 던전" subtitle="문제를 풀어 방을 지나고, 마지막 방의 보스를 물리쳐요." actions={<><SubjectPicker /><Link className="btn-ghost btn-sm" to="/adventure">← 훈련장</Link></>} />
      <Card className="overflow-x-auto">
        <div className="flex min-w-[560px] items-end gap-1">
          {Array.from({ length: ROOMS + 1 }, (_, i) => (
            <div key={i} className={`relative flex h-20 flex-1 items-end justify-center rounded-lg border-2 ${i === ROOMS ? 'border-pink-deep bg-pink-soft' : i < pos ? 'border-mint-deep/50 bg-mint-soft' : 'border-ink/20 bg-lavender-soft/60'}`}>
              {i === ROOMS && <span className="absolute top-1 font-pixel text-xs">보스 {'♥'.repeat(Math.max(0, bossHp))}</span>}
              {i === Math.min(pos, ROOMS) && <PixelCharacter id={profile?.characterId ?? 'byeol'} size={52} walking={walking} />}
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-sm">
          <span aria-label={`남은 하트 ${hearts}개`}>{'❤️'.repeat(Math.max(0, hearts))}{'🤍'.repeat(Math.max(0, 3 - hearts))}</span>
          <span>
            {inBoss ? '보스전!' : `${pos}/${ROOMS}번째 방`} · 첫 시도 정답 {stats.firstTry}
          </span>
        </div>
      </Card>

      {won || lost || outOfQuestions ? (
        <Card className="text-center">
          <h2 className="font-pixel text-2xl font-bold">{won ? '보스를 물리쳤어요! 🎉' : lost ? '하트를 모두 잃었어요' : '준비된 문제를 모두 풀었어요'}</h2>
          <p className="mt-2 text-sm">
            첫 시도 정답 {stats.firstTry}문제 · 복습 문제로 옮긴 문제 {stats.reviewAdded}개
          </p>
          <div className="mt-3 flex justify-center gap-2">
            <button className="btn-primary" onClick={restart}>
              다시 도전
            </button>
            <LinkButton to="/detective" tone="ghost">
              오답 노트
            </LinkButton>
          </div>
        </Card>
      ) : (
        q && (
          <Card className="space-y-3">
            <QuestionPrompt q={q} />
            <AnswerInput q={q} value={value} onChange={setValue} disabled={locked} />
            {msg && <p className={`rounded-lg p-2 text-sm ${msg.tone === 'good' ? 'bg-mint-soft' : msg.tone === 'bad' ? 'bg-pink-soft' : 'bg-butter-soft'}`} role="status">{msg.text}</p>}
            {locked ? (
              <button className="btn-primary" onClick={next}>
                다음 방으로 →
              </button>
            ) : (
              <button className="btn-primary" onClick={submit} disabled={value === null || value === ''}>
                {inBoss ? '공격!' : '답하기'}
              </button>
            )}
          </Card>
        )
      )}
    </div>
  );
}
