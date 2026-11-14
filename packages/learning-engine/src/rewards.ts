/**
 * 성장 보상 계산. 경험치는 실제 학습 결과에만 지급한다.
 *  - 같은 카드는 하루에 한 번만 복습 경험치를 받는다(sourceKey로 중복 방지).
 *  - 시험 경험치는 정답률에 비례한다(0점이면 0).
 *  - 게임 경험치는 정답 개수 기준이며, 같은 문항은 하루 한 번만 인정한다.
 */
import type { Rating } from '@academy/shared';

export const XP_RULES = {
  review: { 1: 1, 2: 3, 3: 4, 4: 4 } as Record<Rating, number>,
  examPerQuestion: 3,
  examExcellentBonus: 10,
  examExcellentRatio: 0.9,
  blankReviewMax: 20,
  mistakeResolved: 8,
  gamePerCorrect: 3,
};

export interface Reward {
  sourceKey: string;
  xp: number;
  coins: number;
  reason: string;
}

const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
const coinsOf = (xp: number) => Math.floor(xp / 2);

export function rewardForReview(cardId: string, rating: Rating, at: number): Reward {
  const xp = XP_RULES.review[rating];
  return { sourceKey: `review:${cardId}:${dayKey(at)}`, xp, coins: coinsOf(xp), reason: '플래시카드 복습' };
}

export function rewardForExam(attemptId: string, scoreRatio: number, questionCount: number): Reward {
  const ratio = Math.max(0, Math.min(1, scoreRatio));
  let xp = Math.round(questionCount * XP_RULES.examPerQuestion * ratio);
  if (ratio >= XP_RULES.examExcellentRatio && questionCount >= 5) xp += XP_RULES.examExcellentBonus;
  return { sourceKey: `exam:${attemptId}`, xp, coins: coinsOf(xp), reason: `시험 정답률 ${Math.round(ratio * 100)}%` };
}

export function rewardForBlankReview(attemptId: string, coverage: number): Reward {
  const xp = Math.round(Math.max(0, Math.min(1, coverage)) * XP_RULES.blankReviewMax);
  return { sourceKey: `blank:${attemptId}`, xp, coins: coinsOf(xp), reason: `백지 복습 회상률 ${Math.round(coverage * 100)}%` };
}

export function rewardForMistakeResolved(mistakeId: string): Reward {
  return { sourceKey: `mistake:${mistakeId}`, xp: XP_RULES.mistakeResolved, coins: coinsOf(XP_RULES.mistakeResolved), reason: '오답 극복' };
}

export function rewardForGameAnswer(questionId: string, correct: boolean, at: number): Reward | null {
  if (!correct) return null;
  return { sourceKey: `game:${questionId}:${dayKey(at)}`, xp: XP_RULES.gamePerCorrect, coins: 1, reason: '던전 정답' };
}

/** 레벨 L에 도달하는 데 필요한 누적 경험치 = 50 × L × (L − 1) / 2 */
export function levelFromXp(totalXp: number): { level: number; current: number; needed: number } {
  let level = 1;
  while (50 * ((level + 1) * level) / 2 <= totalXp) level++;
  const base = (50 * level * (level - 1)) / 2;
  return { level, current: totalXp - base, needed: 50 * level };
}

/** 정원 식물 성장 단계(0~4) — 복습 누적량 기준, 쉬어도 줄어들지 않는다 */
export function plantStage(totalReviews: number): number {
  if (totalReviews >= 200) return 4;
  if (totalReviews >= 80) return 3;
  if (totalReviews >= 25) return 2;
  if (totalReviews >= 5) return 1;
  return 0;
}

/* ---------------- 업적 ---------------- */

export interface AchievementStats {
  studyDays: number;
  totalAnswers: number;
  totalReviews: number;
  blankReviews: number;
  mistakesResolved: number;
  bestDocumentAccuracy: { accuracy: number; answers: number } | null;
  roomSessions: number;
}

export const ACHIEVEMENTS = [
  { key: 'first-study', title: '첫 학습 완료', desc: '문제를 풀거나 카드를 한 장 이상 복습했어요.', test: (s: AchievementStats) => s.totalAnswers + s.totalReviews > 0 },
  { key: 'days-7', title: '7일 누적 학습', desc: '서로 다른 7일 동안 공부했어요(연속이 아니어도 돼요).', test: (s: AchievementStats) => s.studyDays >= 7 },
  { key: 'blank-10', title: '백지 복습 10회', desc: '백지 복습을 10번 완료했어요.', test: (s: AchievementStats) => s.blankReviews >= 10 },
  { key: 'mistake-20', title: '오답 20개 해결', desc: '오답 노트의 문제 20개를 다시 맞혔어요.', test: (s: AchievementStats) => s.mistakesResolved >= 20 },
  {
    key: 'unit-90',
    title: '단원 정답률 90%',
    desc: '한 자료에서 20문항 이상 풀고 정답률 90%를 넘겼어요.',
    test: (s: AchievementStats) => !!s.bestDocumentAccuracy && s.bestDocumentAccuracy.answers >= 20 && s.bestDocumentAccuracy.accuracy >= 0.9,
  },
  { key: 'friends', title: '친구와 공동 학습', desc: '친구 광장에서 함께 공부했어요.', test: (s: AchievementStats) => s.roomSessions >= 1 },
] as const;

export function evaluateAchievements(stats: AchievementStats): string[] {
  return ACHIEVEMENTS.filter((a) => a.test(stats)).map((a) => a.key);
}

/* ---------------- 시험 대비 계획 ---------------- */

export const PLAN_RULES = {
  /** 개념 1개당 예상 소요 시간(분) — 추정치 */
  minutesPerNew: 8,
  minutesPerWeak: 5,
  minutesPerLearning: 3,
};

export function planUntilExam(input: { examDate: string; now: number; newCount: number; weakCount: number; learningCount: number }) {
  const daysLeft = Math.max(0, Math.ceil((new Date(`${input.examDate}T23:59:59`).getTime() - input.now) / 86_400_000));
  const minutes = input.newCount * PLAN_RULES.minutesPerNew + input.weakCount * PLAN_RULES.minutesPerWeak + input.learningCount * PLAN_RULES.minutesPerLearning;
  return {
    daysLeft,
    estimatedMinutes: minutes,
    dailyMinutes: daysLeft > 0 ? Math.ceil(minutes / daysLeft) : minutes,
    dailyConcepts: daysLeft > 0 ? Math.ceil((input.newCount + input.weakCount + input.learningCount) / daysLeft) : input.newCount + input.weakCount + input.learningCount,
  };
}
