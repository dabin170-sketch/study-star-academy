import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Recommendation } from '@academy/learning-engine';
import { db } from '../../storage/db';
import { recommendations } from '../../learning/services';
import { Card, formatDuration } from '../../components/ui';

const ACTION_LINK: Record<Recommendation['action'], { label: string; to: (id: string) => string }> = {
  read: { label: '개념 읽기', to: (id) => `/lecture?concept=${id}` },
  flashcard: { label: '카드 복습', to: (id) => `/greenhouse?concept=${id}` },
  quiz: { label: '문제 풀기', to: (id) => `/lecture?concept=${id}&tab=quiz` },
  'blank-review': { label: '백지 복습', to: () => `/lecture/blank` },
};

export function useToday() {
  return useLiveQuery(async () => {
    const now = Date.now();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const due = await db.flashcards.where('sched.due').belowOrEqual(now).filter((c) => !c.suspended).count();
    const mistakesDue = await db.mistakes.filter((m) => !m.resolved && m.retryAt <= now).count();
    const mistakesOpen = await db.mistakes.filter((m) => !m.resolved).count();
    const sessions = await db.sessions.where('startedAt').aboveOrEqual(start.getTime()).toArray();
    const minutes = sessions.reduce((a, s) => a + s.durationMs, 0);
    const reviewsToday = await db.reviewLogs.where('reviewedAt').aboveOrEqual(start.getTime()).count();
    const docs = await db.documents.count();
    const blankDue = await db.blankReviews.filter((b) => b.nextReviewAt <= now).count();
    const subjects = await db.subjects.toArray();
    const exam = subjects
      .filter((s) => s.examDate)
      .map((s) => ({ name: s.name, days: Math.ceil((new Date(`${s.examDate}T23:59:59`).getTime() - now) / 86_400_000) }))
      .filter((s) => s.days >= 0)
      .sort((a, b) => a.days - b.days)[0];
    const goal = (await db.goals.filter((g) => g.active).first())?.minutesPerDay ?? 60;
    return { due, mistakesDue, mistakesOpen, studyMs: minutes, reviewsToday, docs, blankDue, exam, goal };
  }, []);
}

export function TodayCards() {
  const t = useToday();
  if (!t) return null;
  const items = [
    { label: '오늘 복습할 카드', value: `${t.due}장`, to: '/greenhouse', tone: 'bg-mint-soft' },
    { label: '다시 풀 오답', value: `${t.mistakesDue}개`, sub: `미해결 ${t.mistakesOpen}개`, to: '/detective', tone: 'bg-butter-soft' },
    { label: '오늘 공부 시간', value: formatDuration(t.studyMs), sub: `목표 ${t.goal}분`, to: '/observatory', tone: 'bg-milk-soft' },
    t.exam ? { label: `${t.exam.name} 시험`, value: t.exam.days === 0 ? 'D-DAY' : `D-${t.exam.days}`, to: '/observatory?tab=plan', tone: 'bg-pink-soft' } : { label: '백지 복습 예정', value: `${t.blankDue}건`, to: '/lecture/blank', tone: 'bg-pink-soft' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((it) => (
        <Link key={it.label} to={it.to} className={`card ${it.tone} p-3 transition hover:-translate-y-0.5`}>
          <div className="text-xs text-ink-soft">{it.label}</div>
          <div className="font-pixel text-xl font-bold">{it.value}</div>
          {it.sub && <div className="text-xs text-ink-soft">{it.sub}</div>}
        </Link>
      ))}
    </div>
  );
}

export function RecommendationList({ subjectId }: { subjectId?: string }) {
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const version = useLiveQuery(async () => (await db.answers.count()) + (await db.reviewLogs.count()) + (await db.concepts.count()), []);
  useEffect(() => {
    let alive = true;
    recommendations(subjectId, 5).then((r) => alive && setRecs(r));
    return () => {
      alive = false;
    };
  }, [subjectId, version]);
  if (!recs) return null;
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-bold">오늘의 추천 학습</h2>
        <Link to="/settings#recommend" className="text-xs underline">
          추천 기준 조정
        </Link>
      </div>
      {recs.length === 0 ? (
        <p className="text-sm text-ink-soft">추천할 개념이 없어요. 자료를 올리거나, 이미 모두 잘 숙달했어요!</p>
      ) : (
        <ul className="space-y-2">
          {recs.map((r) => (
            <li key={r.conceptId} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border-2 border-ink/20 bg-cream p-2">
              <div className="min-w-0 flex-1">
                <div className="font-bold">{r.term}</div>
                <ul className="text-xs text-ink-soft">
                  {r.reasons.slice(0, 3).map((reason) => (
                    <li key={reason}>· {reason}</li>
                  ))}
                </ul>
              </div>
              <Link to={ACTION_LINK[r.action].to(r.conceptId)} className="btn-primary btn-sm shrink-0">
                {ACTION_LINK[r.action].label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
