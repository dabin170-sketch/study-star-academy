/**
 * 2D 관절 리그.
 *
 * 몸 전체가 하나의 계층 구조로 연결된다.
 *   root(골반) → torso → neck → head
 *                      → shoulder → upperArm → elbow → forearm → wrist → hand → prop
 *   root       → hip → thigh → knee → shin → ankle → foot
 *
 * - 모든 관절은 고정된 피벗 좌표(RIG)에서 회전하고, 자식은 부모 좌표계 안에 그려진다.
 *   그래서 어떤 자세에서도 팔이 몸통에서 떨어지거나 손이 팔에서 끊기지 않는다.
 * - 뼈 길이는 상수이므로 움직여도 신체 비율이 변하지 않는다.
 * - 관절마다 회전 범위(JOINT_LIMITS)를 두어 팔꿈치·무릎이 반대로 꺾이지 않는다.
 * - 소매·바지 같은 옷은 해당 뼈 그룹 안에 그려져 몸과 함께 움직인다.
 *
 * 각도 단위는 도(°), SVG rotate와 같은 방향(시계 방향 +). 팔다리의 0°는 아래를 향한다.
 * 'l'은 화면 왼쪽, 'r'은 화면 오른쪽 팔다리다.
 */

export const RIG = {
  /** 골반(root) 기준 좌표 */
  neck: { x: 0, y: -96 },
  shoulderL: { x: -31, y: -88 },
  shoulderR: { x: 31, y: -88 },
  hipL: { x: -15, y: 0 },
  hipR: { x: 15, y: 0 },
  headCenter: { x: 0, y: -44 }, // neck 기준
  headRadius: 46,
  upperArm: 40,
  forearm: 36,
  hand: 9,
  thigh: 44,
  shin: 42,
  foot: 12,
  /** 서 있을 때 골반에서 발바닥까지 */
  standHeight: 44 + 42 + 8,
} as const;

export type JointName = 'torso' | 'head' | 'lShoulder' | 'lElbow' | 'rShoulder' | 'rElbow' | 'lHip' | 'lKnee' | 'rHip' | 'rKnee';

export interface Pose {
  /** 골반 위치 오프셋(px) — 걷기 흔들림·앉기 등 */
  x: number;
  y: number;
  torso: number;
  head: number;
  /** 고개 끄덕임용 머리 세로 이동(px, 0~8) */
  headY: number;
  lShoulder: number;
  lElbow: number;
  rShoulder: number;
  rElbow: number;
  lHip: number;
  lKnee: number;
  rHip: number;
  rKnee: number;
}

/** 관절 회전 범위. 팔꿈치·무릎은 한쪽으로만 굽는다(양수 = 굽힘). */
export const JOINT_LIMITS: Record<JointName, [number, number]> = {
  torso: [-22, 22],
  head: [-30, 30],
  // 화면 왼쪽 팔은 + 방향(바깥·위), 오른쪽 팔은 − 방향으로 들어 올린다
  lShoulder: [-60, 185],
  rShoulder: [-185, 60],
  lElbow: [0, 150],
  rElbow: [0, 150],
  lHip: [-60, 45],
  rHip: [-45, 60],
  lKnee: [0, 130],
  rKnee: [0, 130],
};

export const NEUTRAL: Pose = { x: 0, y: 0, torso: 0, head: 0, headY: 0, lShoulder: 8, lElbow: 10, rShoulder: -8, rElbow: 10, lHip: 2, lKnee: 0, rHip: -2, rKnee: 0 };

export const JOINTS = Object.keys(JOINT_LIMITS) as JointName[];

export function clampPose(p: Pose): Pose {
  const out = { ...p, headY: Math.min(8, Math.max(0, p.headY)) };
  for (const j of JOINTS) {
    const [lo, hi] = JOINT_LIMITS[j];
    out[j] = Math.min(hi, Math.max(lo, p[j]));
  }
  return out;
}

/**
 * 팔꿈치·무릎의 실제 회전 방향.
 * 화면 왼쪽 팔은 반시계(−), 오른쪽 팔은 시계(+) 방향으로 굽어 몸 안쪽으로 접힌다.
 * 무릎은 모두 뒤로 굽는 것처럼 보이도록 바깥쪽으로 접는다.
 */
export function signedBend(j: 'lElbow' | 'rElbow' | 'lKnee' | 'rKnee', v: number): number {
  if (j === 'lElbow') return -v;
  if (j === 'rElbow') return v;
  if (j === 'lKnee') return v;
  return -v;
}

const rad = (d: number) => (d * Math.PI) / 180;

function rotate(p: { x: number; y: number }, deg: number) {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

const add = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: a.x + b.x, y: a.y + b.y });

export interface WorldJoints {
  root: { x: number; y: number };
  neck: { x: number; y: number };
  headCenter: { x: number; y: number };
  shoulderL: { x: number; y: number };
  elbowL: { x: number; y: number };
  wristL: { x: number; y: number };
  shoulderR: { x: number; y: number };
  elbowR: { x: number; y: number };
  wristR: { x: number; y: number };
  hipL: { x: number; y: number };
  kneeL: { x: number; y: number };
  ankleL: { x: number; y: number };
  hipR: { x: number; y: number };
  kneeR: { x: number; y: number };
  ankleR: { x: number; y: number };
}

/** 순방향 운동학 — 렌더러와 똑같은 계층 규칙으로 관절의 실제 위치를 계산한다(테스트·소품 부착용). */
export function forwardKinematics(p: Pose): WorldJoints {
  const root = { x: p.x, y: p.y };
  const T = p.torso;
  const inTorso = (pt: { x: number; y: number }) => add(root, rotate(pt, T));
  const neck = inTorso(RIG.neck);
  const headCenter = add(neck, rotate({ x: RIG.headCenter.x, y: RIG.headCenter.y + p.headY }, T + p.head));
  const arm = (shoulder: { x: number; y: number }, sh: number, el: number) => {
    const s = inTorso(shoulder);
    const e = add(s, rotate({ x: 0, y: RIG.upperArm }, T + sh));
    const w = add(e, rotate({ x: 0, y: RIG.forearm }, T + sh + el));
    return [s, e, w] as const;
  };
  const [shoulderL, elbowL, wristL] = arm(RIG.shoulderL, p.lShoulder, signedBend('lElbow', p.lElbow));
  const [shoulderR, elbowR, wristR] = arm(RIG.shoulderR, p.rShoulder, signedBend('rElbow', p.rElbow));
  const leg = (hip: { x: number; y: number }, h: number, k: number) => {
    const s = add(root, hip);
    const kn = add(s, rotate({ x: 0, y: RIG.thigh }, h));
    const an = add(kn, rotate({ x: 0, y: RIG.shin }, h + k));
    return [s, kn, an] as const;
  };
  const [hipL, kneeL, ankleL] = leg(RIG.hipL, p.lHip, signedBend('lKnee', p.lKnee));
  const [hipR, kneeR, ankleR] = leg(RIG.hipR, p.rHip, signedBend('rKnee', p.rKnee));
  return { root, neck, headCenter, shoulderL, elbowL, wristL, shoulderR, elbowR, wristR, hipL, kneeL, ankleL, hipR, kneeR, ankleR };
}

export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** 부드러운 보간(사인 가감속) */
export function ease(t: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)));
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const k = ease(t);
  const out = { ...a };
  for (const key of Object.keys(a) as (keyof Pose)[]) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
}
