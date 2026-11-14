import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { MISTAKE_TYPE_LABEL, QUESTION_TYPE_LABEL, type MistakeRecord, type MistakeType, type Question } from '@academy/shared';
import { db } from '../storage/db';
import { Card, EmptyState, InfoBox, LinkButton, Modal, PageHeader, formatDate } from '../components/ui';
import { PixelBuilding } from '../components/PixelBuilding';
import { InstantQuestion } from '../features/quiz/QuestionView';
import { classifyMistake, retryMistake } from '../learning/services';
import { useCurrentSubject, useNow } from '../hooks/data';
import { toast } from '../stores/ui';

function answerText(q: Question, v: unknown) {
  if (v === null || v === undefined || v === '') return '(답 없음)';
  if (q.type === 'mcq') return q.choices?.[v as number] ?? String(v);
  if (q.type === 'ox') return v ? 'O' : 'X';
  return String(v);
}

function suggestion(q: Question, m: MistakeRecord, conceptTerms: Set<string>): string | null {
  if (m.userAnswer === null || m.userAnswer === '') return '답을 쓰지 못했다면 ‘기억 실패’나 ‘시간 부족’일 수 있어요.';
  if (q.type === 'mcq') {
    const picked = q.choices?.[m.userAnswer as number];
    if (picked && conceptTerms.has(picked)) return `고른 보기 ‘${picked}’도 이 과목의 개념이에요. ‘유사 개념 혼동’일 수 있어요.`;
  }
  if (m.retryCount >= 2) return '여러 번 틀렸다면 ‘개념 부족’일 수 있어요. 원문을 다시 읽어 보세요.';
  return null;
}

export default function Detective() {
  const { subject } = useCurrentSubject();
  const now = useNow(60_000);
  const [filter, setFilter] = useState<'due' | 'open' | 'resolved'>('open');
  const [typeFilter, setTypeFilter] = useState<MistakeType | 'all' | 'none'>('all');
  const [retry, setRetry] = useState<{ m: MistakeRecord; q: Question } | null>(null);

  const data = useLiveQuery(async () => {
    if (!subject) return null;
    const ms = await db.mistakes.where('subjectId').equals(subject.id).toArray();
    const qs = await db.questions.bulkGet(ms.map((m) => m.questionId));
    const concepts = await db.concepts.where('subjectId').equals(subject.id).toArray();
    return { items: ms.map((m, i) => ({ m, q: qs[i] })).filter((x): x is { m: MistakeRecord; q: Question } => !!x.q), terms: new Set(concepts.map((c) => c.term)), conceptById: new Map(concepts.map((c) => [c.id, c])) };
  }, [subject?.id]);

  if (!subject || !data) return null;
  const items = data.items
    .filter(({ m }) => (filter === 'resolved' ? m.resolved : !m.resolved && (filter === 'open' || m.retryAt <= now)))
    .filter(({ m }) => (typeFilter === 'all' ? true : typeFilter === 'none' ? !m.errorType : m.errorType === typeFilter))
    .sort((a, b) => a.m.retryAt - b.m.retryAt);
  const open = data.items.filter((x) => !x.m.resolved);
  const typeCounts = new Map<string, number>();
  for (const { m } of open) typeCounts.set(m.errorType ?? 'none', (typeCounts.get(m.errorType ?? 'none') ?? 0) + 1);

  return (
    <div>
      <PageHeader title="탐정 연구소" subtitle="틀린 문제의 원인을 찾고, 예약된 날에 다시 도전해요." icon={<PixelBuilding roof="#c98a3a" wall="#fff8d6" size={56} />} />
      {data.items.length === 0 ? (
        <EmptyState title="오답이 아직 없어요" desc="퀴즈나 모의고사에서 틀린 문제가 자동으로 여기에 모여요." action={<LinkButton to="/lecture?tab=quiz">퀴즈 풀기</LinkButton>} />
      ) : (
        <div className="space-y-4">
          <InfoBox>AI 분석 없이 동작해요. 각 오답의 원인을 직접 골라 두면 관측소에서 오답 유형 분포를 볼 수 있어요. 아래 ‘힌트’는 간단한 규칙으로 만든 참고 의견이에요.</InfoBox>
          <div className="flex flex-wrap gap-2">
            {(['open', 'due', 'resolved'] as const).map((f) => (
              <button key={f} className={`btn btn-sm ${filter === f ? 'bg-lavender' : 'bg-white'}`} onClick={() => setFilter(f)}>
                {{ open: `미해결 (${open.length})`, due: `오늘 다시 풀기 (${open.filter((x) => x.m.retryAt <= now).length})`, resolved: `해결됨 (${data.items.length - open.length})` }[f]}
              </button>
            ))}
            <select className="input ml-auto w-auto py-1 text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as MistakeType | 'all' | 'none')} aria-label="오답 유형 필터">
              <option value="all">모든 유형</option>
              <option value="none">원인 미분류 ({typeCounts.get('none') ?? 0})</option>
              {(Object.keys(MISTAKE_TYPE_LABEL) as MistakeType[]).map((t) => (
                <option key={t} value={t}>
                  {MISTAKE_TYPE_LABEL[t]} ({typeCounts.get(t) ?? 0})
                </option>
              ))}
            </select>
          </div>
          {items.length === 0 && <p className="text-sm text-ink-soft">조건에 맞는 오답이 없어요.</p>}
          {items.map(({ m, q }) => {
            const concept = q.conceptId ? data.conceptById.get(q.conceptId) : undefined;
            const hint = suggestion(q, m, data.terms);
            return (
              <Card key={m.id} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="chip bg-lavender-soft">{QUESTION_TYPE_LABEL[q.type]}</span>
                  {concept && <span className="chip bg-white">개념: {concept.term}</span>}
                  <span className={`chip ${m.resolved ? 'bg-mint' : m.retryAt <= now ? 'bg-pink' : 'bg-white'}`}>{m.resolved ? `해결 (${formatDate(m.resolvedAt!)})` : m.retryAt <= now ? '오늘 다시 풀기' : `재도전 ${formatDate(m.retryAt)}`}</span>
                  <span className="text-ink-soft">도전 {m.retryCount}회</span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{q.prompt}</p>
                <p className="text-sm">
                  <span className="text-pink-deep">내 답: {answerText(q, m.userAnswer)}</span>
                  {q.type !== 'essay' && <span className="ml-3 text-mint-deep">정답: {answerText(q, q.answer)}</span>}
                </p>
                {hint && !m.resolved && <p className="text-xs text-ink-soft">💡 힌트: {hint}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <select className="input w-auto py-1 text-sm" value={m.errorType ?? ''} onChange={(e) => classifyMistake(m.id, (e.target.value || undefined) as MistakeType | undefined)} aria-label="오답 원인">
                    <option value="">원인 고르기…</option>
                    {(Object.keys(MISTAKE_TYPE_LABEL) as MistakeType[]).map((t) => (
                      <option key={t} value={t}>
                        {MISTAKE_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                  <input className="input w-auto flex-1 py-1 text-sm" defaultValue={m.note} placeholder="메모(왜 틀렸는지)" onBlur={(e) => e.target.value !== m.note && classifyMistake(m.id, m.errorType, e.target.value)} aria-label="오답 메모" />
                  {!m.resolved && (
                    <button className="btn-primary btn-sm" onClick={() => setRetry({ m, q })}>
                      다시 풀기
                    </button>
                  )}
                  {concept && (
                    <Link className="btn-ghost btn-sm" to={`/lecture?concept=${concept.id}`}>
                      개념 복습
                    </Link>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Modal open={!!retry} onClose={() => setRetry(null)} title="오답 다시 풀기" wide>
        {retry && (
          <InstantQuestion
            q={retry.q}
            onAnswered={async (v, ms, ratio) => {
              const ok = await retryMistake(retry.m.id, v, ms, ratio);
              toast(ok ? '해결했어요! 오답 극복 경험치를 받았어요.' : '아직 어려워요. 개념을 다시 보고 내일 또 도전해요.', ok ? 'success' : 'info');
            }}
          />
        )}
      </Modal>
    </div>
  );
}
