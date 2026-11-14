import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { essayKeywordReport, gradeObjective } from '@academy/learning-engine';
import { QUESTION_TYPE_LABEL, type AnswerValue, type Question } from '@academy/shared';
import { MathText } from '../../components/MathText';

export function AnswerInput({ q, value, onChange, disabled, autoFocus }: { q: Question; value: AnswerValue; onChange: (v: AnswerValue) => void; disabled?: boolean; autoFocus?: boolean }) {
  if (q.type === 'mcq')
    return (
      <div className="grid gap-2" role="radiogroup" aria-label="보기">
        {q.choices?.map((c, i) => (
          <button
            key={i}
            role="radio"
            aria-checked={value === i}
            disabled={disabled}
            onClick={() => onChange(i)}
            className={`rounded-lg border-2 px-3 py-2 text-left text-sm transition ${value === i ? 'border-lavender-deep bg-lavender' : 'border-ink/30 bg-white hover:bg-lavender-soft'}`}
          >
            <span className="mr-2 font-pixel">{'①②③④⑤'[i]}</span>
            {c}
          </button>
        ))}
      </div>
    );
  if (q.type === 'ox')
    return (
      <div className="flex gap-3" role="radiogroup" aria-label="참 거짓">
        {[true, false].map((v) => (
          <button key={String(v)} role="radio" aria-checked={value === v} disabled={disabled} onClick={() => onChange(v)} className={`btn flex-1 py-4 text-2xl ${value === v ? 'bg-lavender' : 'bg-white'}`}>
            {v ? 'O' : 'X'}
          </button>
        ))}
      </div>
    );
  if (q.type === 'essay')
    return <textarea className="input min-h-[160px]" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder="핵심 용어와 정의, 관계를 포함해 써 보세요." aria-label="답안" autoFocus={autoFocus} />;
  return <input className="input" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder="정답 입력" aria-label="정답" autoFocus={autoFocus} />;
}

export function QuestionPrompt({ q, index }: { q: Question; index?: number }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        {index !== undefined && <span className="font-pixel font-bold">Q{index + 1}.</span>}
        <span className="chip bg-lavender-soft">{QUESTION_TYPE_LABEL[q.type]}</span>
        <span className="chip bg-white">{q.points}점</span>
        {q.origin === 'user' && <span className="chip bg-mint-soft">직접 만든 문제</span>}
      </div>
      <p className="whitespace-pre-wrap text-base leading-relaxed">
        <MathText text={q.prompt} />
      </p>
    </div>
  );
}

/** 서술형 자기채점: 루브릭 항목마다 점수를 고른다. 핵심어 포함 여부는 참고용. */
export function EssaySelfGrade({ q, answer, scores, onChange, readOnly }: { q: Question; answer: string; scores: number[] | undefined; onChange: (s: number[]) => void; readOnly?: boolean }) {
  const report = useMemo(() => (q.rubric ? essayKeywordReport(q.rubric, answer ?? '') : []), [q, answer]);
  if (!q.rubric) return null;
  const current = scores ?? report.map(() => 0);
  return (
    <div className="space-y-2 rounded-lg border-2 border-milk-deep/40 bg-milk-soft p-3 text-sm">
      <p className="font-bold">채점 기준표로 직접 채점하기</p>
      <p className="text-xs text-ink-soft">
        아래 ‘포함된 핵심어’는 단어가 들어 있는지만 확인한 <b>참고 정보</b>예요. 단어가 있어도 설명이 틀릴 수 있고, 다른 표현으로 맞게 쓸 수도 있으니 모범 답안과 비교해 직접 점수를 정해 주세요.
      </p>
      {report.map((r, i) => (
        <div key={i} className="rounded border border-ink/20 bg-white p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold">
              {r.label} ({r.points}점)
            </span>
            <select className="input w-auto py-1" disabled={readOnly} value={current[i] ?? 0} onChange={(e) => onChange(current.map((v, j) => (j === i ? Number(e.target.value) : v)))} aria-label={`${r.label} 점수`}>
              {Array.from({ length: r.points * 2 + 1 }, (_, k) => k / 2).map((v) => (
                <option key={v} value={v}>
                  {v}점
                </option>
              ))}
            </select>
          </div>
          <div className="mt-1 text-xs">
            {r.matched.length > 0 && <span className="text-mint-deep">포함된 핵심어: {r.matched.join(', ')} </span>}
            {r.missing.length > 0 && <span className="text-pink-deep">빠진 핵심어: {r.missing.join(', ')}</span>}
            <span className="ml-1 text-ink-soft">(참고 점수 {r.suggested}점)</span>
          </div>
        </div>
      ))}
      <div className="rounded bg-butter-soft p-2">
        <span className="font-bold">모범 답안(원문): </span>
        <span className="whitespace-pre-wrap">{q.rubric.modelAnswer}</span>
      </div>
    </div>
  );
}

export function Feedback({ q, value }: { q: Question; value: AnswerValue }) {
  const correct = q.type === 'essay' ? null : gradeObjective(q, value).correct;
  const answerText = q.type === 'mcq' ? q.choices?.[q.answer as number] : q.type === 'ox' ? (q.answer ? 'O' : 'X') : String(q.answer);
  return (
    <div className={`rounded-lg border-2 p-3 text-sm ${correct === null ? 'border-milk-deep/40 bg-milk-soft' : correct ? 'border-mint-deep bg-mint-soft' : 'border-pink-deep bg-pink-soft'}`} role="status">
      {correct !== null && <p className="font-pixel text-base font-bold">{correct ? '정답이에요!' : `아쉬워요. 정답: ${answerText}`}</p>}
      <p className="mt-1 whitespace-pre-wrap">{q.explanation}</p>
      {q.evidence && (
        <Link className="mt-1 inline-block text-xs underline" to={`/library/${q.evidence.documentId}?page=${q.evidence.pageNumber}&chunk=${q.evidence.chunkId}`}>
          원문 {q.evidence.pageNumber}쪽(구간)에서 확인하기
        </Link>
      )}
    </div>
  );
}

/** 한 문항을 풀고 즉시 피드백을 받는 카드(빠른 퀴즈·오답 재도전에서 사용) */
export function InstantQuestion({ q, onAnswered, index }: { q: Question; index?: number; onAnswered: (value: AnswerValue, responseMs: number, essayRatio?: number) => void | Promise<void> }) {
  const [value, setValue] = useState<AnswerValue>(null);
  const [submitted, setSubmitted] = useState(false);
  const [startedAt] = useState(Date.now());
  const [scores, setScores] = useState<number[] | undefined>();
  const [done, setDone] = useState(false);
  const rubricMax = q.rubric?.items.reduce((a, b) => a + b.points, 0) ?? 1;

  return (
    <div className="space-y-3">
      <QuestionPrompt q={q} index={index} />
      <AnswerInput q={q} value={value} onChange={setValue} disabled={submitted} autoFocus />
      {!submitted ? (
        <button
          className="btn-primary"
          disabled={value === null || value === ''}
          onClick={async () => {
            setSubmitted(true);
            if (q.type !== 'essay') {
              await onAnswered(value, Date.now() - startedAt);
              setDone(true);
            }
          }}
        >
          {q.type === 'essay' ? '모범 답안과 비교하기' : '정답 확인'}
        </button>
      ) : q.type === 'essay' ? (
        <>
          <EssaySelfGrade q={q} answer={(value as string) ?? ''} scores={scores} onChange={setScores} readOnly={done} />
          {!done && (
            <button
              className="btn-primary"
              onClick={async () => {
                const total = (scores ?? []).reduce((a, b) => a + b, 0);
                await onAnswered(value, Date.now() - startedAt, total / rubricMax);
                setDone(true);
              }}
            >
              채점 저장
            </button>
          )}
        </>
      ) : (
        <Feedback q={q} value={value} />
      )}
    </div>
  );
}
