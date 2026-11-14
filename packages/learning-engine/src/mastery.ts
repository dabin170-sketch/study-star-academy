/**
 * 개념별 숙련도와 학습 상태 계산. 모든 기준값을 MASTERY_RULES에 모아 두었다.
 */
import type { QuestionType, RecommendWeights, SchedulingState } from '@academy/shared';
import { cardRetrievability } from './fsrs';

export const MASTERY_RULES = {
  /** 최근 기록일수록 큰 가중치(가장 최근 1, 그 이전 0.8, 0.64 …) */
  recencyDecay: 0.8,
  /** 기록 수가 적을 때 숙련도를 낮추는 정도: mastery = 정확도 × (0.6 + 0.4 × min(1, 기록수/5)) */
  minAttemptsForFullCredit: 5,
  masteredAccuracy: 0.85,
  masteredMinAttempts: 3,
  weakThreshold: 0.6,
  strongThreshold: 0.7,
};

export type ConceptState = 'new' | 'repeated-wrong' | 'recall-weak' | 'apply-weak' | 'learning' | 'mastered';

export const CONCEPT_STATE_LABEL: Record<ConceptState, string> = {
  new: '처음 보는 개념',
  'repeated-wrong': '반복해서 틀리는 개념',
  'recall-weak': '이해는 하지만 암기가 부족한 개념',
  'apply-weak': '암기는 했지만 적용에 약한 개념',
  learning: '학습 중인 개념',
  mastered: '충분히 숙달한 개념',
};

export interface AttemptLite {
  at: number;
  questionType: QuestionType | 'flashcard';
  /** 0~1 */
  ratio: number;
  responseMs?: number;
}

export interface ConceptMastery {
  state: ConceptState;
  mastery: number;
  accuracy: number;
  attempts: number;
  lastStudiedAt: number | null;
  recognition: number | null;
  recall: number | null;
  application: number | null;
  consecutiveWrong: number;
  avgResponseMs: number | null;
  retrievability: number | null;
}

function weightedAccuracy(list: AttemptLite[]): number | null {
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => b.at - a.at);
  let num = 0;
  let den = 0;
  sorted.forEach((a, i) => {
    const w = Math.pow(MASTERY_RULES.recencyDecay, i);
    num += a.ratio * w;
    den += w;
  });
  return num / den;
}

export function computeMastery(attempts: AttemptLite[], cards: SchedulingState[], now: number): ConceptMastery {
  const sorted = [...attempts].sort((a, b) => a.at - b.at);
  const recognition = weightedAccuracy(sorted.filter((a) => a.questionType === 'mcq' || a.questionType === 'ox'));
  const recall = weightedAccuracy(sorted.filter((a) => a.questionType === 'short' || a.questionType === 'blank' || a.questionType === 'flashcard'));
  const application = weightedAccuracy(sorted.filter((a) => a.questionType === 'essay'));
  const accuracy = weightedAccuracy(sorted) ?? 0;
  let consecutiveWrong = 0;
  for (let i = sorted.length - 1; i >= 0 && sorted[i].ratio < 0.5; i--) consecutiveWrong++;
  const rs = cards.map((c) => cardRetrievability(c, now)).filter((r): r is number => r !== null);
  const retr = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
  const n = sorted.length;
  let mastery = n ? accuracy * (0.6 + 0.4 * Math.min(1, n / MASTERY_RULES.minAttemptsForFullCredit)) : 0;
  if (retr !== null) mastery *= 0.5 + 0.5 * retr;
  const times = sorted.map((a) => a.responseMs).filter((t): t is number => typeof t === 'number' && t > 0);

  let state: ConceptState;
  const R = MASTERY_RULES;
  if (n === 0) state = 'new';
  else if (consecutiveWrong >= 2) state = 'repeated-wrong';
  else if (accuracy >= R.masteredAccuracy && n >= R.masteredMinAttempts && (retr === null || retr >= 0.85)) state = 'mastered';
  else if (recognition !== null && recognition >= R.strongThreshold && recall !== null && recall < R.weakThreshold) state = 'recall-weak';
  else if (recall !== null && recall >= R.strongThreshold && application !== null && application < R.weakThreshold) state = 'apply-weak';
  else state = 'learning';

  return {
    state,
    mastery: Math.round(mastery * 100) / 100,
    accuracy: Math.round(accuracy * 100) / 100,
    attempts: n,
    lastStudiedAt: n ? sorted[n - 1].at : null,
    recognition,
    recall,
    application,
    consecutiveWrong,
    avgResponseMs: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
    retrievability: retr,
  };
}

/* ---------------- 추천 ---------------- */

export const DEFAULT_WEIGHTS: RecommendWeights = { weakness: 1, overdue: 0.8, importance: 0.5, examUrgency: 0.6 };

export interface RecommendInput {
  id: string;
  term: string;
  importance: 1 | 2 | 3;
  mastery: ConceptMastery;
  /** 이 개념 카드 중 가장 이른 복습 예정일 */
  nextDue: number | null;
}

export interface Recommendation {
  conceptId: string;
  term: string;
  score: number;
  reasons: string[];
  action: 'flashcard' | 'quiz' | 'blank-review' | 'read';
}

const DAY = 86_400_000;

/**
 * 추천 점수 =
 *   w.weakness   × (1 − 숙련도)
 * + w.overdue    × min(1, 복습 예정일 초과 일수 / 7)
 * + w.importance × (중요도 − 1) / 2
 * + w.examUrgency× 시험 임박도(30일 전부터 0→1)
 * 충분히 숙달했고 복습 기한이 남은 개념은 제외한다.
 */
export function recommend(items: RecommendInput[], weights: RecommendWeights, now: number, examDate?: string, limit = 10): Recommendation[] {
  let urgency = 0;
  let daysLeft: number | null = null;
  if (examDate) {
    daysLeft = Math.ceil((new Date(`${examDate}T23:59:59`).getTime() - now) / DAY);
    urgency = daysLeft < 0 ? 0 : Math.min(1, Math.max(0, 1 - daysLeft / 30));
  }
  const recs: Recommendation[] = [];
  for (const it of items) {
    const m = it.mastery;
    const overdueDays = it.nextDue !== null && it.nextDue < now ? (now - it.nextDue) / DAY : 0;
    if (m.state === 'mastered' && overdueDays <= 0) continue;
    const reasons: string[] = [];
    if (m.state === 'new') reasons.push('아직 학습 기록이 없습니다.');
    if (m.consecutiveWrong >= 2) reasons.push(`최근 ${m.consecutiveWrong}번 연속 틀렸습니다.`);
    if (m.state === 'recall-weak') reasons.push('보기를 고르는 문제는 맞히지만 직접 떠올리는 문제에서 자주 틀립니다.');
    if (m.state === 'apply-weak') reasons.push('용어는 기억하지만 서술형에서 점수가 낮습니다.');
    if (m.lastStudiedAt) {
      const since = Math.floor((now - m.lastStudiedAt) / DAY);
      if (since >= 3) reasons.push(`마지막 학습 후 ${since}일이 지났습니다.`);
    }
    if (overdueDays >= 1) reasons.push(`복습 예정일이 ${Math.floor(overdueDays)}일 지났습니다.`);
    else if (overdueDays > 0) reasons.push('오늘 복습할 차례입니다.');
    if (it.importance === 3) reasons.push('자료에서 자주 나오거나 제목에 있는 중요한 개념입니다.');
    if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 30) reasons.push(`시험까지 ${daysLeft}일 남았습니다.`);
    const score =
      weights.weakness * (1 - m.mastery) +
      weights.overdue * Math.min(1, overdueDays / 7) +
      weights.importance * ((it.importance - 1) / 2) +
      weights.examUrgency * urgency;
    const action: Recommendation['action'] =
      m.state === 'new' ? 'read' : m.state === 'repeated-wrong' ? 'quiz' : m.state === 'apply-weak' ? 'blank-review' : 'flashcard';
    recs.push({ conceptId: it.id, term: it.term, score: Math.round(score * 100) / 100, reasons, action });
  }
  return recs.sort((a, b) => b.score - a.score).slice(0, limit);
}
