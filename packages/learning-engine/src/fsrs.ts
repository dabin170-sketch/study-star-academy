/**
 * FSRS-4.5 간격 반복 스케줄러(공개 알고리즘 구현).
 * 참고: open-spaced-repetition/fsrs4anki 위키의 FSRS-4.5 수식.
 *
 *  R(t,S)   = (1 + F·t/S)^D,  D = -0.5, F = 19/81           (망각 곡선)
 *  I(r,S)   = S/F · (r^(1/D) - 1)                             (목표 유지율 r 에서의 간격)
 *  S0(G)    = w[G-1]
 *  D0(G)    = w4 - (G-3)·w5
 *  D'       = w7·D0(3) + (1-w7)·(D - w6·(G-3))
 *  S'r      = S·(e^w8·(11-D)·S^-w9·(e^(w10·(1-R)) - 1)·hard·easy + 1)
 *  S'f      = w11·D^-w12·((S+1)^w13 - 1)·e^(w14·(1-R))
 *
 * 처음 보는 카드의 '다시/어려움'과 다시 배우는 카드는 분 단위 학습 단계로 처리한다.
 */
import type { CardState, Rating, SchedulingState } from '@academy/shared';

export const FSRS_VERSION = 'fsrs-4.5';
export const DEFAULT_W = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587,
  0.2272, 2.8755,
];

const DECAY = -0.5;
const FACTOR = 19 / 81;
const DAY = 86_400_000;
const MINUTE = 60_000;

export interface FsrsParams {
  w: number[];
  desiredRetention: number;
  maximumInterval: number;
  /** 학습 단계(분) */
  learningSteps: { again: number; hard: number; relearn: number };
}

export const DEFAULT_PARAMS: FsrsParams = {
  w: DEFAULT_W,
  desiredRetention: 0.9,
  maximumInterval: 36500,
  learningSteps: { again: 1, hard: 6, relearn: 10 },
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function paramsHash(p: FsrsParams): string {
  const s = JSON.stringify([p.w, p.desiredRetention, p.maximumInterval, p.learningSteps]);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

export function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY);
}

export function nextIntervalDays(stability: number, p: FsrsParams = DEFAULT_PARAMS): number {
  const raw = (stability / FACTOR) * (Math.pow(p.desiredRetention, 1 / DECAY) - 1);
  return clamp(Math.round(raw), 1, p.maximumInterval);
}

const initStability = (g: Rating, w: number[]) => Math.max(w[g - 1], 0.1);
const initDifficulty = (g: Rating, w: number[]) => clamp(w[4] - (g - 3) * w[5], 1, 10);

function nextDifficulty(d: number, g: Rating, w: number[]): number {
  const next = d - w[6] * (g - 3);
  return clamp(w[7] * initDifficulty(3, w) + (1 - w[7]) * next, 1, 10);
}

function recallStability(d: number, s: number, r: number, g: Rating, w: number[]): number {
  const hard = g === 2 ? w[15] : 1;
  const easy = g === 4 ? w[16] : 1;
  return s * (Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp(w[10] * (1 - r)) - 1) * hard * easy + 1);
}

function forgetStability(d: number, s: number, r: number, w: number[]): number {
  return Math.min(s, w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r)));
}

export function newSchedulingState(now: number): SchedulingState {
  return { due: now, stability: 0, difficulty: 0, reps: 0, lapses: 0, state: 'new' };
}

export interface ReviewOutcome {
  state: SchedulingState;
  elapsedDays: number;
  scheduledDays: number;
}

/** 카드 한 장을 복습한 결과를 계산한다(순수 함수). */
export function review(card: SchedulingState, rating: Rating, now: number, p: FsrsParams = DEFAULT_PARAMS): ReviewOutcome {
  const w = p.w;
  const elapsedDays = card.lastReview ? Math.max(0, (now - card.lastReview) / DAY) : 0;
  let { stability: s, difficulty: d, lapses } = card;
  let state: CardState;
  let dueMs: number;
  let scheduledDays = 0;

  if (card.state === 'new') {
    s = initStability(rating, w);
    d = initDifficulty(rating, w);
    if (rating === 1) {
      state = 'learning';
      dueMs = now + p.learningSteps.again * MINUTE;
    } else if (rating === 2) {
      state = 'learning';
      dueMs = now + p.learningSteps.hard * MINUTE;
    } else {
      state = 'review';
      scheduledDays = nextIntervalDays(s, p);
      if (rating === 4) scheduledDays = Math.max(scheduledDays, nextIntervalDays(initStability(3, w), p) + 1);
      dueMs = now + scheduledDays * DAY;
    }
  } else if (card.state === 'learning' || card.state === 'relearning') {
    d = nextDifficulty(d, rating, w);
    if (rating === 1) {
      state = card.state;
      dueMs = now + (card.state === 'learning' ? p.learningSteps.again : p.learningSteps.relearn) * MINUTE;
    } else if (rating === 2) {
      state = card.state;
      dueMs = now + p.learningSteps.hard * MINUTE;
    } else {
      // 같은 날 학습 단계 통과: 안정도는 유지한 채 졸업(쉬움이면 한 단계 더)
      state = 'review';
      scheduledDays = nextIntervalDays(s, p) + (rating === 4 ? 1 : 0);
      dueMs = now + scheduledDays * DAY;
    }
  } else {
    const r = retrievability(elapsedDays, s);
    d = nextDifficulty(d, rating, w);
    if (rating === 1) {
      s = forgetStability(card.difficulty, s, r, w);
      lapses += 1;
      state = 'relearning';
      dueMs = now + p.learningSteps.relearn * MINUTE;
    } else {
      const hardS = recallStability(card.difficulty, s, r, 2, w);
      const goodS = recallStability(card.difficulty, s, r, 3, w);
      const easyS = recallStability(card.difficulty, s, r, 4, w);
      let hardI = nextIntervalDays(hardS, p);
      let goodI = nextIntervalDays(goodS, p);
      let easyI = nextIntervalDays(easyS, p);
      hardI = Math.min(hardI, goodI);
      goodI = Math.max(goodI, hardI + 1);
      easyI = Math.max(easyI, goodI + 1);
      s = rating === 2 ? hardS : rating === 3 ? goodS : easyS;
      scheduledDays = rating === 2 ? hardI : rating === 3 ? goodI : easyI;
      state = 'review';
      dueMs = now + scheduledDays * DAY;
    }
  }

  return {
    state: { due: dueMs, stability: s, difficulty: d, reps: card.reps + 1, lapses, state, lastReview: now },
    elapsedDays,
    scheduledDays,
  };
}

/** 버튼 위에 보여 줄 예상 간격 미리보기 */
export function previewIntervals(card: SchedulingState, now: number, p: FsrsParams = DEFAULT_PARAMS): Record<Rating, number> {
  const out = {} as Record<Rating, number>;
  for (const g of [1, 2, 3, 4] as Rating[]) out[g] = review(card, g, now, p).state.due - now;
  return out;
}

export function formatInterval(ms: number): string {
  if (ms < 60 * MINUTE) return `${Math.max(1, Math.round(ms / MINUTE))}분`;
  if (ms < DAY) return `${Math.round(ms / (60 * MINUTE))}시간`;
  const days = Math.round(ms / DAY);
  if (days < 31) return `${days}일`;
  if (days < 365) return `${Math.round(days / 30)}개월`;
  return `${(days / 365).toFixed(1)}년`;
}

export function cardRetrievability(card: SchedulingState, now: number): number | null {
  if (card.state === 'new' || !card.lastReview) return null;
  return retrievability((now - card.lastReview) / DAY, card.stability);
}
