import { useMemo } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { gradeExam } from '@academy/learning-engine';
import type { Question } from '@academy/shared';
import { db } from '../storage/db';
import { Card, InfoBox, Loading, PageHeader } from '../components/ui';
import { EssaySelfGrade, Feedback, QuestionPrompt } from '../features/quiz/QuestionView';
import { finalizeAttempt, saveEssayScores } from '../learning/services';
import { toast } from '../stores/ui';

export default function ExamResult() {
  const { attemptId = '' } = useParams();
  const attempt = useLiveQuery(() => db.attempts.get(attemptId), [attemptId]);
  const exam = useLiveQuery(async () => (attempt ? db.exams.get(attempt.examId) : undefined), [attempt?.examId]);
  const questions = useLiveQuery(async () => (exam ? ((await db.questions.bulkGet(exam.questionIds)).filter(Boolean) as Question[]) : undefined), [exam?.id]);
  const grade = useMemo(() => (attempt && questions ? gradeExam({ questions, answers: attempt.answers, essayScores: attempt.essayScores }) : null), [attempt, questions]);

  if (attempt === undefined || !questions || !grade) return <Loading />;
  if (!attempt) return <Navigate to="/tower" replace />;
  if (attempt.status === 'in-progress') return <Navigate to={`/tower/exam/${attemptId}`} replace />;

  const pending = questions.filter((q) => q.type === 'essay' && grade.perQuestion[q.id].pendingSelfGrade);
  const graded = attempt.status === 'graded';

  return (
    <div className="space-y-4">
      <PageHeader title="시험 결과" subtitle={exam?.title} actions={<Link className="btn-ghost btn-sm" to="/tower">← 시험의 탑</Link>} />
      <Card className="flex flex-wrap items-center gap-4">
        <div className="font-pixel text-3xl font-bold">
          {graded ? attempt.score : grade.score} / {grade.maxScore}
        </div>
        <div className="text-sm text-ink-soft">
          소요 시간 {Math.round(((attempt.submittedAt ?? attempt.deadline) - attempt.startedAt) / 60000)}분 · 정답{' '}
          {questions.filter((q) => grade.perQuestion[q.id].correct).length}/{questions.length}
        </div>
        {!graded && (
          <button
            className="btn-primary ml-auto"
            disabled={pending.length > 0}
            onClick={async () => {
              await finalizeAttempt(attemptId);
              toast('채점을 확정했어요. 틀린 문제는 오답 노트에 저장됐어요.', 'success');
            }}
          >
            {pending.length > 0 ? `서술형 ${pending.length}문항 채점 필요` : '채점 확정'}
          </button>
        )}
        {graded && (
          <Link className="btn-pink ml-auto" to="/detective">
            오답 분석하러 가기
          </Link>
        )}
      </Card>
      {!graded && <InfoBox>객관식·참거짓·빈칸·단답은 자동 채점했어요. 서술형은 채점 기준표에 따라 직접 점수를 정한 뒤 ‘채점 확정’을 눌러 주세요. 확정하면 오답 노트와 숙련도에 반영돼요.</InfoBox>}
      {questions.map((q, i) => {
        const r = grade.perQuestion[q.id];
        const ans = attempt.answers[q.id] ?? null;
        return (
          <Card key={q.id} className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={`chip ${q.type === 'essay' ? 'bg-milk' : r.correct ? 'bg-mint' : 'bg-pink'}`}>
                {q.type === 'essay' ? (r.pendingSelfGrade ? '채점 필요' : `${r.score}/${r.max}점`) : r.correct ? '정답' : '오답'}
              </span>
              {attempt.flags.includes(q.id) && <span className="chip bg-butter">★ 다시 보기 표시</span>}
            </div>
            <QuestionPrompt q={q} index={i} />
            <div className="rounded bg-lavender-soft p-2 text-sm">
              <span className="font-bold">내 답: </span>
              {ans === null || ans === '' ? '(답 없음)' : q.type === 'mcq' ? q.choices?.[ans as number] : q.type === 'ox' ? (ans ? 'O' : 'X') : <span className="whitespace-pre-wrap">{String(ans)}</span>}
            </div>
            {q.type === 'essay' ? (
              <EssaySelfGrade q={q} answer={(ans as string) ?? ''} scores={attempt.essayScores[q.id]} readOnly={graded} onChange={(s) => saveEssayScores(attemptId, q.id, s)} />
            ) : (
              <Feedback q={q} value={ans} />
            )}
          </Card>
        );
      })}
    </div>
  );
}
