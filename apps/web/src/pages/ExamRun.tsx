/**
 * 실전 시험 모드: 남은 시간은 마감 시각(deadline) 기준으로 계산하고, 답안은 바뀔 때마다 자동 저장한다.
 * 새로고침·탭 종료 후에도 이어서 풀 수 있고, 시간이 끝나면 자동 제출된다. 제출 후에는 수정할 수 없다.
 */
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { AnswerValue, Question } from '@academy/shared';
import { db } from '../storage/db';
import { Card, Loading, Modal } from '../components/ui';
import { AnswerInput, QuestionPrompt } from '../features/quiz/QuestionView';
import { saveAttemptAnswers, submitAttempt } from '../learning/services';
import { useNow } from '../hooks/data';

export default function ExamRun() {
  const { attemptId = '' } = useParams();
  const navigate = useNavigate();
  const now = useNow(500);
  const attempt = useLiveQuery(() => db.attempts.get(attemptId), [attemptId]);
  const exam = useLiveQuery(async () => (attempt ? db.exams.get(attempt.examId) : undefined), [attempt?.examId]);
  const questions = useLiveQuery(async () => (exam ? ((await db.questions.bulkGet(exam.questionIds)).filter(Boolean) as Question[]) : undefined), [exam?.id]);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [flags, setFlags] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const loaded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (attempt && !loaded.current) {
      loaded.current = true;
      setAnswers(attempt.answers);
      setFlags(attempt.flags);
    }
  }, [attempt]);

  const persist = (nextAnswers: Record<string, AnswerValue>, nextFlags: string[]) => {
    setSaveState('saving');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await saveAttemptAnswers(attemptId, { answers: nextAnswers, flags: nextFlags });
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    }, 300);
  };

  const remaining = attempt ? attempt.deadline - now : 0;
  const submit = async () => {
    clearTimeout(saveTimer.current);
    await saveAttemptAnswers(attemptId, { answers, flags });
    await submitAttempt(attemptId);
    navigate(`/tower/result/${attemptId}`, { replace: true });
  };

  useEffect(() => {
    if (attempt?.status === 'in-progress' && remaining <= 0 && loaded.current) submit();
  }, [remaining <= 0, attempt?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saveState === 'saving') e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveState]);

  if (attempt === undefined || !questions) return <Loading text="시험지를 펼치는 중…" />;
  if (!attempt) return <Navigate to="/tower" replace />;
  if (attempt.status !== 'in-progress') return <Navigate to={`/tower/result/${attemptId}`} replace />;

  const q = questions[index];
  const mm = Math.max(0, Math.floor(remaining / 60000));
  const ss = Math.max(0, Math.floor((remaining % 60000) / 1000));
  const answeredCount = questions.filter((x) => answers[x.id] !== undefined && answers[x.id] !== null && answers[x.id] !== '').length;
  const total = questions.reduce((a, b) => a + b.points, 0);

  return (
    <div className="space-y-3">
      <div className="sticky top-[60px] z-30 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-ink/70 bg-white px-3 py-2 shadow-pixel sm:top-[96px]">
        <div className="text-sm">
          <b>{exam?.title}</b> · 총 {total}점
        </div>
        <div className={`font-pixel text-lg tabular-nums ${remaining < 60_000 ? 'text-pink-deep' : ''}`} role="timer" aria-label="남은 시간">
          ⏳ {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
        </div>
        <div className="text-xs text-ink-soft" aria-live="polite">
          {saveState === 'saving' ? '저장 중…' : saveState === 'error' ? '⚠ 저장 실패 — 다시 시도 중' : '✓ 자동 저장됨'}
        </div>
        <button className="btn-pink btn-sm" onClick={() => setConfirm(true)}>
          최종 제출
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
        <Card className="space-y-4">
          <QuestionPrompt q={q} index={index} />
          <AnswerInput
            q={q}
            value={answers[q.id] ?? null}
            onChange={(v) => {
              const next = { ...answers, [q.id]: v };
              setAnswers(next);
              persist(next, flags);
            }}
          />
          <div className="flex flex-wrap justify-between gap-2">
            <button className="btn-ghost btn-sm" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
              ← 이전
            </button>
            <button
              className={`btn btn-sm ${flags.includes(q.id) ? 'bg-butter' : 'bg-white'}`}
              onClick={() => {
                const next = flags.includes(q.id) ? flags.filter((f) => f !== q.id) : [...flags, q.id];
                setFlags(next);
                persist(answers, next);
              }}
              aria-pressed={flags.includes(q.id)}
            >
              {flags.includes(q.id) ? '★ 나중에 다시 보기' : '☆ 나중에 다시 보기'}
            </button>
            <button className="btn-ghost btn-sm" disabled={index === questions.length - 1} onClick={() => setIndex((i) => i + 1)}>
              {answers[q.id] === undefined || answers[q.id] === null ? '건너뛰기 →' : '다음 →'}
            </button>
          </div>
        </Card>
        <Card className="h-fit">
          <div className="mb-2 text-sm font-bold">
            답안지 ({answeredCount}/{questions.length})
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {questions.map((x, i) => {
              const answered = answers[x.id] !== undefined && answers[x.id] !== null && answers[x.id] !== '';
              return (
                <button
                  key={x.id}
                  onClick={() => setIndex(i)}
                  className={`relative rounded border-2 py-1 text-xs font-bold ${i === index ? 'border-lavender-deep' : 'border-ink/30'} ${answered ? 'bg-mint' : 'bg-white'}`}
                  aria-label={`${i + 1}번 ${answered ? '답함' : '안 답함'}${flags.includes(x.id) ? ', 다시 보기 표시' : ''}`}
                >
                  {i + 1}
                  {flags.includes(x.id) && <span className="absolute -right-1 -top-1 text-[10px]">★</span>}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-ink-soft">초록=답함, ★=다시 보기. 시간이 끝나면 자동으로 제출돼요.</p>
        </Card>
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="최종 제출할까요?">
        <p className="text-sm">
          {questions.length}문항 중 {answeredCount}문항에 답했어요.
          {flags.length > 0 && ` 다시 보기 표시 ${flags.length}개가 있어요.`}
        </p>
        <p className="mt-1 text-sm text-pink-deep">제출한 뒤에는 답안을 고칠 수 없어요.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setConfirm(false)}>
            계속 풀기
          </button>
          <button className="btn-pink" onClick={submit}>
            제출
          </button>
        </div>
      </Modal>
    </div>
  );
}
