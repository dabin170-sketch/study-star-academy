import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CONCEPT_STATE_LABEL, PLAN_RULES, planUntilExam, type ConceptMastery, type ConceptState, type Recommendation } from '@academy/learning-engine';
import { MISTAKE_TYPE_LABEL, type MistakeType } from '@academy/shared';
import { db, touch } from '../storage/db';
import { Card, EmptyState, InfoBox, PageHeader, Tabs, formatDate } from '../components/ui';
import { PixelBuilding } from '../components/PixelBuilding';
import { SubjectPicker } from '../components/SubjectPicker';
import { masteryMap, recommendations } from '../learning/services';
import { useCurrentSubject } from '../hooks/data';

const DAY = 86_400_000;
const COLORS = ['#9b83e6', '#f08fb0', '#4fbf93', '#6fa8e8', '#e8c13d', '#c98a3a', '#7b5ea7'];
const dayStart = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const label = (t: number) => `${new Date(t).getMonth() + 1}/${new Date(t).getDate()}`;

function ChartCard({ title, children, empty }: { title: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <Card>
      <h3 className="mb-2 font-bold">{title}</h3>
      {empty ? <p className="py-8 text-center text-sm text-ink-soft">아직 기록이 없어요.</p> : <div className="h-56">{children}</div>}
    </Card>
  );
}

function Dashboard() {
  const data = useLiveQuery(async () => {
    const now = Date.now();
    const today = dayStart(now);
    const sessions = await db.sessions.toArray();
    const answers = await db.answers.toArray();
    const logs = await db.reviewLogs.toArray();
    const mistakes = await db.mistakes.toArray();
    const attempts = (await db.attempts.toArray()).filter((a) => a.status === 'graded').sort((a, b) => a.startedAt - b.startedAt);
    const subjects = await db.subjects.toArray();
    const goal = (await db.goals.filter((g) => g.active).first())?.minutesPerDay ?? 60;

    const days = Array.from({ length: 14 }, (_, i) => today - (13 - i) * DAY);
    const daily = days.map((d) => {
      const mins = sessions.filter((s) => s.startedAt >= d && s.startedAt < d + DAY).reduce((a, s) => a + s.durationMs, 0) / 60000;
      const ans = answers.filter((a) => a.answeredAt >= d && a.answeredAt < d + DAY);
      const acc = ans.length ? Math.round((ans.reduce((a, b) => a + b.scoreRatio, 0) / ans.length) * 100) : null;
      const reviews = logs.filter((l) => l.reviewedAt >= d && l.reviewedAt < d + DAY).length;
      return { day: label(d), minutes: Math.round(mins), accuracy: acc, reviews, goal };
    });
    const weeks = Array.from({ length: 8 }, (_, i) => today - (7 - i) * 7 * DAY - 6 * DAY);
    const weekly = weeks.map((w) => ({ week: `${label(w)}~`, minutes: Math.round(sessions.filter((s) => s.startedAt >= w && s.startedAt < w + 7 * DAY).reduce((a, s) => a + s.durationMs, 0) / 60000) }));
    const bySubject = new Map<string, number>();
    for (const s of sessions) bySubject.set(s.subjectId ?? 'none', (bySubject.get(s.subjectId ?? 'none') ?? 0) + s.durationMs);
    const subjectShare = [...bySubject.entries()].map(([id, ms]) => ({ name: subjects.find((x) => x.id === id)?.name ?? '과목 미지정', value: Math.round(ms / 60000) })).filter((x) => x.value > 0);
    const mistakeTypes = (Object.keys(MISTAKE_TYPE_LABEL) as MistakeType[]).map((t) => ({ name: MISTAKE_TYPE_LABEL[t], count: mistakes.filter((m) => m.errorType === t).length }));
    const unclassified = mistakes.filter((m) => !m.errorType).length;
    const exams = attempts.map((a) => ({ day: label(a.startedAt), score: a.maxScore ? Math.round(((a.score ?? 0) / a.maxScore) * 100) : 0 }));
    const dueToday = (await db.flashcards.where('sched.due').belowOrEqual(today + DAY).filter((c) => !c.suspended && c.sched.state !== 'new').count()) + logs.filter((l) => l.reviewedAt >= today).length;
    const doneToday = logs.filter((l) => l.reviewedAt >= today).length;
    const metDays = daily.filter((d) => d.minutes >= goal).length;
    return { daily, weekly, subjectShare, mistakeTypes, unclassified, exams, dueToday, doneToday, goal, metDays };
  }, []);
  if (!data) return null;
  const hasTime = data.daily.some((d) => d.minutes > 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="bg-mint-soft">
          <div className="text-xs">오늘 복습 완료율</div>
          <div className="font-pixel text-xl font-bold">{data.dueToday ? Math.round((data.doneToday / data.dueToday) * 100) : 100}%</div>
          <div className="text-xs text-ink-soft">
            {data.doneToday}/{data.dueToday}장
          </div>
        </Card>
        <Card className="bg-milk-soft">
          <div className="text-xs">최근 14일 목표 달성</div>
          <div className="font-pixel text-xl font-bold">{data.metDays}/14일</div>
          <div className="text-xs text-ink-soft">하루 {data.goal}분 목표</div>
        </Card>
        <Card className="bg-butter-soft">
          <div className="text-xs">최근 14일 공부</div>
          <div className="font-pixel text-xl font-bold">{Math.round(data.daily.reduce((a, d) => a + d.minutes, 0) / 60)}시간</div>
        </Card>
        <Card className="bg-pink-soft">
          <div className="text-xs">원인 미분류 오답</div>
          <div className="font-pixel text-xl font-bold">{data.unclassified}개</div>
          <Link to="/detective" className="text-xs underline">
            분류하러 가기
          </Link>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="일별 공부 시간(분)" empty={!hasTime}>
          <ResponsiveContainer>
            <ComposedChart data={data.daily}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Bar dataKey="minutes" name="공부(분)" fill="#9b83e6" radius={[4, 4, 0, 0]} />
              <Line dataKey="goal" name="목표" stroke="#f08fb0" dot={false} strokeDasharray="4 4" />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="주별 공부 시간(분)" empty={!hasTime}>
          <ResponsiveContainer>
            <BarChart data={data.weekly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Bar dataKey="minutes" name="공부(분)" fill="#6fa8e8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="정답률 변화(%)" empty={!data.daily.some((d) => d.accuracy !== null)}>
          <ResponsiveContainer>
            <LineChart data={data.daily}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" fontSize={11} />
              <YAxis domain={[0, 100]} fontSize={11} />
              <Tooltip />
              <Line dataKey="accuracy" name="정답률" stroke="#4fbf93" strokeWidth={3} connectNulls dot />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="일별 카드 복습 수" empty={!data.daily.some((d) => d.reviews > 0)}>
          <ResponsiveContainer>
            <BarChart data={data.daily}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="reviews" name="복습(장)" fill="#4fbf93" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="과목별 공부 비중(분)" empty={!data.subjectShare.length}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data.subjectShare} dataKey="value" nameKey="name" outerRadius={80} label>
                {data.subjectShare.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="오답 유형 분포" empty={!data.mistakeTypes.some((m) => m.count > 0)}>
          <ResponsiveContainer>
            <BarChart data={data.mistakeTypes} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} fontSize={11} />
              <YAxis type="category" dataKey="name" width={90} fontSize={11} />
              <Tooltip />
              <Bar dataKey="count" name="개수" fill="#f08fb0" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="시험 성적 변화(%)" empty={!data.exams.length}>
          <ResponsiveContainer>
            <LineChart data={data.exams}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" fontSize={11} />
              <YAxis domain={[0, 100]} fontSize={11} />
              <Tooltip />
              <Line dataKey="score" name="점수(%)" stroke="#6fa8e8" strokeWidth={3} dot />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

const STATE_COLOR: Record<ConceptState, string> = { new: '#e9e4ef', 'repeated-wrong': '#f08fb0', 'recall-weak': '#ffc9da', 'apply-weak': '#ffeea0', learning: '#cfe6ff', mastered: '#4fbf93' };

function WeaknessMap({ subjectId }: { subjectId: string }) {
  const concepts = useLiveQuery(async () => (await db.concepts.where('subjectId').equals(subjectId).toArray()).filter((c) => c.status !== 'rejected'), [subjectId]);
  const [mm, setMm] = useState<Map<string, ConceptMastery>>(new Map());
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    masteryMap(subjectId).then(setMm);
    recommendations(subjectId, 100).then(setRecs);
  }, [subjectId, concepts?.length]);
  const detail = useLiveQuery(async () => {
    if (!sel) return null;
    const answers = await db.answers.where('conceptId').equals(sel).toArray();
    const mistakes = await db.mistakes.where('conceptId').equals(sel).toArray();
    const logs = await db.reviewLogs.where('conceptId').equals(sel).toArray();
    const last = Math.max(0, ...answers.map((a) => a.answeredAt), ...logs.map((l) => l.reviewedAt));
    return { answers: answers.length, mistakes, last: last || null };
  }, [sel]);
  if (!concepts) return null;
  if (!concepts.length) return <EmptyState title="개념이 없어요" />;
  const sections = new Map<string, typeof concepts>();
  for (const c of concepts) {
    const k = c.section || '기타';
    if (!sections.has(k)) sections.set(k, []);
    sections.get(k)!.push(c);
  }
  const current = concepts.find((c) => c.id === sel);
  const m = sel ? mm.get(sel) : undefined;
  const rec = recs.find((r) => r.conceptId === sel);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          {(Object.keys(STATE_COLOR) as ConceptState[]).map((s) => (
            <span key={s} className="chip" style={{ background: STATE_COLOR[s] }}>
              {CONCEPT_STATE_LABEL[s]}
            </span>
          ))}
        </div>
        {[...sections.entries()].map(([sec, list]) => (
          <div key={sec} className="mb-3">
            <h4 className="mb-1 font-pixel text-sm font-bold">{sec}</h4>
            <div className="flex flex-wrap gap-1.5">
              {list.map((c) => {
                const cm = mm.get(c.id);
                return (
                  <button key={c.id} onClick={() => setSel(c.id)} className={`rounded-lg border-2 px-2 py-1 text-xs ${sel === c.id ? 'border-ink' : 'border-ink/20'}`} style={{ background: STATE_COLOR[cm?.state ?? 'new'] }} aria-label={`${c.term}: ${CONCEPT_STATE_LABEL[cm?.state ?? 'new']}, 숙련도 ${Math.round((cm?.mastery ?? 0) * 100)}%`}>
                    {c.term} <span className="opacity-70">{Math.round((cm?.mastery ?? 0) * 100)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </Card>
      <Card className="h-fit space-y-2 text-sm">
        {!current ? (
          <p className="text-ink-soft">개념을 누르면 자세한 정보를 보여 드려요.</p>
        ) : (
          <>
            <h3 className="font-pixel text-lg font-bold">{current.term}</h3>
            <p>상태: {CONCEPT_STATE_LABEL[m?.state ?? 'new']}</p>
            <p>숙련도 {Math.round((m?.mastery ?? 0) * 100)}% · 정답률 {Math.round((m?.accuracy ?? 0) * 100)}%</p>
            <p>마지막 학습: {detail?.last ? formatDate(detail.last) : '없음'}</p>
            <p>누적 문제 풀이: {detail?.answers ?? 0}회</p>
            <p>
              관련 오답: {detail?.mistakes.length ?? 0}개 (미해결 {detail?.mistakes.filter((x) => !x.resolved).length ?? 0})
            </p>
            <p>
              원본 출처:{' '}
              <Link className="underline" to={`/library/${current.documentId}?page=${current.pageNumber}`}>
                {current.pageNumber}쪽(구간)
              </Link>
            </p>
            {rec && (
              <div className="rounded bg-lavender-soft p-2">
                <p className="font-bold">다음 추천 활동</p>
                <ul className="text-xs">
                  {rec.reasons.map((r) => (
                    <li key={r}>· {r}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              <Link className="btn-primary btn-sm" to={`/lecture?concept=${current.id}`}>
                개념 학습
              </Link>
              <Link className="btn-mint btn-sm" to={`/greenhouse?concept=${current.id}`}>
                카드
              </Link>
              <Link className="btn-ghost btn-sm" to={`/lecture?concept=${current.id}&tab=quiz`}>
                문제
              </Link>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function ExamPlan({ subjectId }: { subjectId: string }) {
  const subject = useLiveQuery(() => db.subjects.get(subjectId), [subjectId]);
  const concepts = useLiveQuery(async () => {
    const docs = new Set((await db.documents.where('subjectId').equals(subjectId).toArray()).filter((d) => d.inExamScope).map((d) => d.id));
    return (await db.concepts.where('subjectId').equals(subjectId).toArray()).filter((c) => c.status !== 'rejected' && docs.has(c.documentId));
  }, [subjectId]);
  const [mm, setMm] = useState<Map<string, ConceptMastery>>(new Map());
  const [recs, setRecs] = useState<Recommendation[]>([]);
  useEffect(() => {
    masteryMap(subjectId).then(setMm);
    recommendations(subjectId, 10).then(setRecs);
  }, [subjectId, subject?.examDate]);
  const counts = useMemo(() => {
    const c = { new: 0, weak: 0, learning: 0, mastered: 0 };
    for (const k of concepts ?? []) {
      const s = mm.get(k.id)?.state ?? 'new';
      if (s === 'new') c.new++;
      else if (s === 'mastered') c.mastered++;
      else if (s === 'learning') c.learning++;
      else c.weak++;
    }
    return c;
  }, [concepts, mm]);
  if (!subject || !concepts) return null;
  const plan = subject.examDate ? planUntilExam({ examDate: subject.examDate, now: Date.now(), newCount: counts.new, weakCount: counts.weak, learningCount: counts.learning }) : null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-3">
        <label className="block">
          <span className="label">{subject.name} 시험 날짜</span>
          <input type="date" className="input" value={subject.examDate ?? ''} onChange={(e) => db.subjects.put(touch(subject, { examDate: e.target.value || undefined }))} />
        </label>
        <p className="text-xs text-ink-soft">시험 범위는 도서관에서 자료별 ‘시험 범위’ 체크로 정해요. 현재 범위의 개념 {concepts.length}개.</p>
        <div className="grid grid-cols-2 gap-2 text-center text-sm">
          <div className="rounded bg-ink-faint/20 p-2">미학습 <b>{counts.new}</b></div>
          <div className="rounded bg-pink-soft p-2">취약 <b>{counts.weak}</b></div>
          <div className="rounded bg-milk-soft p-2">학습 중 <b>{counts.learning}</b></div>
          <div className="rounded bg-mint-soft p-2">숙달 <b>{counts.mastered}</b></div>
        </div>
        {plan ? (
          <div className="space-y-1 rounded-lg bg-lavender-soft p-3 text-sm">
            <p>
              남은 학습 가능일: <b>{plan.daysLeft}일</b>
            </p>
            <p>
              예상 학습 소요량: <b>약 {Math.round(plan.estimatedMinutes / 60)}시간 {plan.estimatedMinutes % 60}분</b> <span className="text-xs">(추정치)</span>
            </p>
            <p>
              매일 추천 학습량: <b>약 {plan.dailyMinutes}분</b>, 개념 {plan.dailyConcepts}개
            </p>
          </div>
        ) : (
          <InfoBox tone="butter">시험 날짜를 입력하면 남은 기간에 맞춘 하루 학습량을 계산해 드려요.</InfoBox>
        )}
        <p className="text-xs text-ink-soft">
          추정 기준: 미학습 개념 {PLAN_RULES.minutesPerNew}분, 취약 개념 {PLAN_RULES.minutesPerWeak}분, 학습 중 개념 {PLAN_RULES.minutesPerLearning}분. 실제 성적이나 합격 가능성을 예측하지 않아요.
        </p>
      </Card>
      <Card>
        <h3 className="mb-2 font-bold">복습 우선순위</h3>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          {recs.map((r) => (
            <li key={r.conceptId}>
              <Link to={`/lecture?concept=${r.conceptId}`} className="font-bold underline">
                {r.term}
              </Link>
              <div className="text-xs text-ink-soft">{r.reasons.join(' ')}</div>
            </li>
          ))}
        </ol>
        {recs.length === 0 && <p className="text-sm text-ink-soft">우선 복습할 개념이 없어요.</p>}
      </Card>
    </div>
  );
}

export default function Observatory() {
  const [params] = useSearchParams();
  const { subject } = useCurrentSubject();
  const [tab, setTab] = useState<'dash' | 'map' | 'plan'>((params.get('tab') as 'plan') || 'dash');
  return (
    <div>
      <PageHeader title="학습 관측소" subtitle="공부 시간, 정답률, 취약 개념, 시험 대비 계획을 한눈에 봐요." icon={<PixelBuilding roof="#7b5ea7" wall="#f0eaff" size={56} />} actions={<SubjectPicker />} />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'dash', label: '개인 대시보드' }, { value: 'map', label: '취약점 지도' }, { value: 'plan', label: '시험 대비' }]} />
      {tab === 'dash' && <Dashboard />}
      {tab === 'map' && subject && <WeaknessMap subjectId={subject.id} />}
      {tab === 'plan' && subject && <ExamPlan subjectId={subject.id} />}
    </div>
  );
}
