/**
 * 모션 = 관절 각도 키프레임 목록. 키프레임 사이는 사인 가감속으로 보간한다.
 * 부분 자세(Partial<Pose>)는 기본 자세(감정이 반영된 서 있는 자세) 위에 덮어쓴다.
 * 모든 모션은 실제로 구현되어 있으며 MOTIONS에 없는 모션은 편집 메뉴에 나오지 않는다.
 */
import type { Emotion, MotionId, PropId } from '@academy/shared';
import { NEUTRAL, clampPose, lerpPose, type Pose } from './rig';

export interface MotionKey {
  t: number; // 0~1
  pose: Partial<Pose>;
}

export interface MotionDef {
  id: MotionId;
  durationMs: number;
  loop: boolean;
  keys: MotionKey[];
  /** 이 모션에서 손에 드는 기본 소품 */
  prop?: PropId;
  /** 소품을 드는 손 */
  hand?: 'l' | 'r';
}

const k = (t: number, pose: Partial<Pose>): MotionKey => ({ t, pose });

export const MOTIONS: Record<MotionId, MotionDef> = {
  idle: { id: 'idle', durationMs: 3200, loop: true, keys: [k(0, { y: 0 }), k(0.5, { y: 1.2, lShoulder: 9, rShoulder: -9 }), k(1, { y: 0 })] },
  breathe: { id: 'breathe', durationMs: 2400, loop: true, keys: [k(0, { y: 0, torso: 0 }), k(0.5, { y: 2.2, lShoulder: 11, rShoulder: -11, headY: 1 }), k(1, { y: 0, torso: 0 })] },
  walk: {
    id: 'walk',
    durationMs: 900,
    loop: true,
    keys: [
      k(0, { lHip: 18, lKnee: 0, rHip: 14, rKnee: 22, lShoulder: -10, rShoulder: -14, y: 0 }),
      k(0.25, { lHip: 0, rHip: 0, lKnee: 12, rKnee: 0, y: -3 }),
      k(0.5, { lHip: -14, lKnee: 22, rHip: -18, rKnee: 0, lShoulder: 14, rShoulder: 10, y: 0 }),
      k(0.75, { lHip: 0, rHip: 0, lKnee: 0, rKnee: 12, y: -3 }),
      k(1, { lHip: 18, lKnee: 0, rHip: 14, rKnee: 22, lShoulder: -10, rShoulder: -14, y: 0 }),
    ],
  },
  run: {
    id: 'run',
    durationMs: 520,
    loop: true,
    keys: [
      k(0, { lHip: 34, lKnee: 10, rHip: 28, rKnee: 70, lShoulder: -30, lElbow: 85, rShoulder: -40, rElbow: 85, torso: 5, y: 0 }),
      k(0.5, { lHip: -28, lKnee: 70, rHip: -34, rKnee: 10, lShoulder: 40, lElbow: 85, rShoulder: 30, rElbow: 85, torso: 5, y: -7 }),
      k(1, { lHip: 34, lKnee: 10, rHip: 28, rKnee: 70, lShoulder: -30, lElbow: 85, rShoulder: -40, rElbow: 85, torso: 5, y: 0 }),
    ],
  },
  sit: { id: 'sit', durationMs: 700, loop: false, keys: [k(0, {}), k(1, { y: 34, lHip: 32, lKnee: 64, rHip: -32, rKnee: 64, lShoulder: -12, lElbow: 40, rShoulder: 12, rElbow: 40 })] },
  'stand-up': {
    id: 'stand-up',
    durationMs: 800,
    loop: false,
    keys: [k(0, { y: 34, lHip: 32, lKnee: 64, rHip: -32, rKnee: 64, torso: 8 }), k(0.6, { y: 8, lHip: 8, lKnee: 14, rHip: -8, rKnee: 14, torso: 4 }), k(1, {})],
  },
  'raise-hand': { id: 'raise-hand', durationMs: 1400, loop: true, keys: [k(0, { rShoulder: -160, rElbow: 12 }), k(0.5, { rShoulder: -168, rElbow: 4, torso: -3 }), k(1, { rShoulder: -160, rElbow: 12 })] },
  nod: { id: 'nod', durationMs: 900, loop: true, keys: [k(0, { headY: 0 }), k(0.3, { headY: 6, head: 2 }), k(0.6, { headY: 0 }), k(1, { headY: 0 })] },
  'shake-head': { id: 'shake-head', durationMs: 900, loop: true, keys: [k(0, { head: 0 }), k(0.25, { head: -12 }), k(0.5, { head: 0 }), k(0.75, { head: 12 }), k(1, { head: 0 })] },
  explain: {
    id: 'explain',
    durationMs: 1600,
    loop: true,
    keys: [k(0, { lShoulder: 40, lElbow: 75, rShoulder: -20, rElbow: 30 }), k(0.5, { lShoulder: 58, lElbow: 55, rShoulder: -32, rElbow: 50, torso: -2 }), k(1, { lShoulder: 40, lElbow: 75, rShoulder: -20, rElbow: 30 })],
  },
  'point-board': { id: 'point-board', durationMs: 1800, loop: true, keys: [k(0, { rShoulder: -105, rElbow: 6, torso: -4, head: -6 }), k(0.5, { rShoulder: -112, rElbow: 2, torso: -5, head: -8 }), k(1, { rShoulder: -105, rElbow: 6, torso: -4, head: -6 })] },
  'read-book': { id: 'read-book', durationMs: 2600, loop: true, keys: [k(0, { lShoulder: -18, lElbow: 105, rShoulder: 18, rElbow: 105, headY: 3 }), k(0.5, { lShoulder: -20, lElbow: 108, rShoulder: 20, rElbow: 108, headY: 4, head: 3 }), k(1, { lShoulder: -18, lElbow: 105, rShoulder: 18, rElbow: 105, headY: 3 })], prop: 'book', hand: 'r' },
  write: { id: 'write', durationMs: 700, loop: true, keys: [k(0, { rShoulder: 22, rElbow: 95, lShoulder: -18, lElbow: 100, headY: 3 }), k(0.5, { rShoulder: 18, rElbow: 100, lShoulder: -18, lElbow: 100, headY: 3 }), k(1, { rShoulder: 22, rElbow: 95, lShoulder: -18, lElbow: 100, headY: 3 })], prop: 'pencil', hand: 'r' },
  surprised: { id: 'surprised', durationMs: 900, loop: false, keys: [k(0, {}), k(0.3, { y: -8, lShoulder: 115, lElbow: 55, rShoulder: -115, rElbow: 55 }), k(1, { y: 0, lShoulder: 100, lElbow: 70, rShoulder: -100, rElbow: 70 })] },
  laugh: { id: 'laugh', durationMs: 700, loop: true, keys: [k(0, { y: 0, torso: 0, lShoulder: -25, lElbow: 110, rShoulder: 25, rElbow: 110 }), k(0.5, { y: -4, torso: 3, headY: 2, lShoulder: -25, lElbow: 110, rShoulder: 25, rElbow: 110 }), k(1, { y: 0, torso: 0, lShoulder: -25, lElbow: 110, rShoulder: 25, rElbow: 110 })] },
  angry: { id: 'angry', durationMs: 1000, loop: true, keys: [k(0, { lShoulder: 42, lElbow: 100, rShoulder: -42, rElbow: 100, torso: 0 }), k(0.5, { lShoulder: 44, lElbow: 102, rShoulder: -44, rElbow: 102, y: 1, torso: 2 }), k(1, { lShoulder: 42, lElbow: 100, rShoulder: -42, rElbow: 100, torso: 0 })] },
  sad: { id: 'sad', durationMs: 3000, loop: true, keys: [k(0, { y: 3, head: 9, headY: 4, lShoulder: 1, rShoulder: -1, lElbow: 4, rElbow: 4 }), k(0.5, { y: 4, head: 10, headY: 5, lShoulder: 1, rShoulder: -1 }), k(1, { y: 3, head: 9, headY: 4, lShoulder: 1, rShoulder: -1, lElbow: 4, rElbow: 4 })] },
  flustered: { id: 'flustered', durationMs: 1100, loop: true, keys: [k(0, { rShoulder: -150, rElbow: 125, head: 8 }), k(0.5, { rShoulder: -155, rElbow: 130, head: 11, y: 1 }), k(1, { rShoulder: -150, rElbow: 125, head: 8 })] },
  think: { id: 'think', durationMs: 2400, loop: true, keys: [k(0, { rShoulder: 34, rElbow: 140, lShoulder: -22, lElbow: 95, head: 7 }), k(0.5, { rShoulder: 36, rElbow: 142, lShoulder: -22, lElbow: 95, head: 10 }), k(1, { rShoulder: 34, rElbow: 140, lShoulder: -22, lElbow: 95, head: 7 })] },
  'pick-up': { id: 'pick-up', durationMs: 1200, loop: false, keys: [k(0, {}), k(0.45, { torso: 14, y: 12, rShoulder: -20, rElbow: 0, lKnee: 20, rKnee: 20 }), k(1, { torso: 0, y: 0, rShoulder: -60, rElbow: 70 })], prop: 'paper', hand: 'r' },
};

/** 감정에 따른 기본 자세(대기 계열 모션일 때만 적용) */
export const EMOTION_BASE: Partial<Record<Emotion, Partial<Pose>>> = {
  sad: { y: 3, head: 8, headY: 3 },
  shy: { head: -9, lShoulder: -14, lElbow: 60, rShoulder: 14, rElbow: 60 },
  confident: { lShoulder: 42, lElbow: 100, rShoulder: -42, rElbow: 100 },
  doubt: { head: -6 },
  confused: { head: 10 },
  curious: { head: -5, torso: -2 },
  focused: { headY: 2 },
};

const IDLE_LIKE = new Set<MotionId>(['idle', 'breathe']);

/** 시각 t(ms)에서의 자세 */
export function samplePose(motionId: MotionId, tMs: number, emotion: Emotion = 'joy'): Pose {
  const m = MOTIONS[motionId] ?? MOTIONS.idle;
  const base: Pose = { ...NEUTRAL, ...(IDLE_LIKE.has(motionId) ? EMOTION_BASE[emotion] : {}) };
  const raw = m.loop ? (tMs % m.durationMs) / m.durationMs : Math.min(1, tMs / m.durationMs);
  const keys = m.keys;
  let i = 0;
  while (i < keys.length - 2 && raw > keys[i + 1].t) i++;
  const a = keys[i];
  const b = keys[Math.min(i + 1, keys.length - 1)];
  const span = b.t - a.t || 1;
  const local = (raw - a.t) / span;
  const pa: Pose = { ...base, ...a.pose };
  const pb: Pose = { ...base, ...b.pose };
  return clampPose(lerpPose(pa, pb, local));
}

/** 모션 사이를 부드럽게 바꾸기 위해 이전 자세와 섞는다(전환 시간 300ms) */
export function blendTransition(from: Pose, to: Pose, sinceSwitchMs: number, transitionMs = 300): Pose {
  if (sinceSwitchMs >= transitionMs) return to;
  return lerpPose(from, to, sinceSwitchMs / transitionMs);
}

export const IMPLEMENTED_MOTIONS = Object.keys(MOTIONS) as MotionId[];
