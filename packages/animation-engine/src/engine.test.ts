import { describe, expect, it } from 'vitest';
import type { Emotion } from '@academy/shared';
import { EMOTION_LABEL } from '@academy/shared';
import { JOINTS, JOINT_LIMITS, NEUTRAL, RIG, dist, forwardKinematics, type Pose } from './rig';
import { MOTIONS, IMPLEMENTED_MOTIONS, blendTransition, samplePose } from './motions';
import { FACES, suggestEmotion, suggestMotion } from './face';
import { CAST, CAST_IDS } from './cast';
import { MAX_SHAKE_PX, STAGE, cameraAt } from './camera';

const EMOTIONS = Object.keys(EMOTION_LABEL) as Emotion[];

function bones(p: Pose) {
  const j = forwardKinematics(p);
  return {
    upperL: dist(j.shoulderL, j.elbowL),
    foreL: dist(j.elbowL, j.wristL),
    upperR: dist(j.shoulderR, j.elbowR),
    foreR: dist(j.elbowR, j.wristR),
    thighL: dist(j.hipL, j.kneeL),
    shinL: dist(j.kneeL, j.ankleL),
    thighR: dist(j.hipR, j.kneeR),
    shinR: dist(j.kneeR, j.ankleR),
    shoulderSpan: dist(j.shoulderL, j.shoulderR),
    neckToShoulderL: dist(j.neck, j.shoulderL),
  };
}

describe('관절 리그 — 신체 연결과 비율(시각적 회귀의 수치 기준)', () => {
  const ref = bones(NEUTRAL);

  it('모든 모션·모든 시점에서 뼈 길이와 어깨 폭이 변하지 않는다(팔이 몸통에서 떨어지지 않음)', () => {
    for (const id of IMPLEMENTED_MOTIONS) {
      const m = MOTIONS[id];
      for (let i = 0; i <= 20; i++) {
        for (const emo of EMOTIONS) {
          const b = bones(samplePose(id, (m.durationMs * i) / 20, emo));
          for (const key of Object.keys(ref) as (keyof typeof ref)[]) expect(b[key]).toBeCloseTo(ref[key], 6);
        }
      }
    }
    expect(ref.upperL).toBeCloseTo(RIG.upperArm, 6);
    expect(ref.foreL).toBeCloseTo(RIG.forearm, 6);
  });

  it('모션 키프레임은 관절 회전 범위를 벗어나지 않게 작성되어 있다(팔꿈치·무릎 역방향 굽힘 없음)', () => {
    for (const id of IMPLEMENTED_MOTIONS) {
      for (const key of MOTIONS[id].keys) {
        for (const j of JOINTS) {
          const v = key.pose[j];
          if (v === undefined) continue;
          const [lo, hi] = JOINT_LIMITS[j];
          expect(v, `${id} ${j}`).toBeGreaterThanOrEqual(lo);
          expect(v, `${id} ${j}`).toBeLessThanOrEqual(hi);
        }
      }
    }
  });

  it('반복 모션은 끝과 처음 자세가 같아 끊김 없이 이어진다', () => {
    for (const id of IMPLEMENTED_MOTIONS) {
      const m = MOTIONS[id];
      if (!m.loop) continue;
      const a = samplePose(id, 0);
      const b = samplePose(id, m.durationMs - 0.001);
      for (const j of JOINTS) expect(Math.abs(a[j] - b[j]), `${id} ${j}`).toBeLessThan(0.5);
    }
  });

  it('모션 전환은 보간되어 한 번에 튀지 않는다', () => {
    const from = samplePose('idle', 0);
    const to = samplePose('raise-hand', 0);
    const mid = blendTransition(from, to, 150);
    expect(mid.rShoulder).toBeLessThan(from.rShoulder);
    expect(mid.rShoulder).toBeGreaterThan(to.rShoulder);
    expect(blendTransition(from, to, 400)).toEqual(to);
  });

  it('손들기에서는 손목이 머리보다 위, 칠판 가리키기에서는 손목이 몸 오른쪽에 있다', () => {
    const up = forwardKinematics(samplePose('raise-hand', 0));
    expect(up.wristR.y).toBeLessThan(up.headCenter.y);
    const point = forwardKinematics(samplePose('point-board', 0));
    expect(point.wristR.x).toBeGreaterThan(point.shoulderR.x + 40);
  });
});

describe('표정·감정 추천', () => {
  it('11가지 감정 모두 표정이 정의되어 있고 서로 다르다', () => {
    expect(EMOTIONS).toHaveLength(11);
    const keys = new Set(EMOTIONS.map((e) => JSON.stringify(FACES[e])));
    expect(keys.size).toBe(11);
  });

  it('대사로 감정과 모션을 추천한다', () => {
    expect(suggestEmotion('헉, 정말이야?!')).toBe('surprised');
    expect(suggestEmotion('근거를 살펴보자.')).toBe('focused');
    expect(suggestEmotion('그렇구나, 이제 알겠어!')).toBe('joy');
    expect(suggestMotion('칠판을 보면 이렇게 적혀 있어요.', 'focused')).toBe('point-board');
    expect(suggestMotion('아니야, 그건 아니야.', 'doubt')).toBe('shake-head');
  });
});

describe('캐릭터·카메라', () => {
  it('캐릭터 6명은 역할·머리 모양·색이 모두 다르다', () => {
    expect(CAST_IDS).toHaveLength(6);
    expect(new Set(CAST_IDS.map((id) => CAST[id].role)).size).toBe(6);
    expect(new Set(CAST_IDS.map((id) => CAST[id].hairStyle)).size).toBe(6);
    expect(new Set(CAST_IDS.map((id) => CAST[id].outfit)).size).toBe(6);
  });

  it('카메라 흔들림은 3px 이하이고 화면이 무대 밖으로 나가지 않는다', () => {
    for (let t = 0; t < 2000; t += 37) {
      const still = cameraAt('static', 0.5, 800, 0, t);
      const shaken = cameraAt('static', 0.5, 800, 1, t);
      expect(Math.abs(shaken.cx - still.cx)).toBeLessThanOrEqual(MAX_SHAKE_PX);
      for (const kind of ['zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'focus-speaker', 'board'] as const) {
        const c = cameraAt(kind, t / 2000, 1300, 1, t);
        const halfW = STAGE.width / 2 / c.scale;
        expect(c.cx - halfW).toBeGreaterThanOrEqual(-0.001);
        expect(c.cx + halfW).toBeLessThanOrEqual(STAGE.width + 0.001);
      }
    }
  });
});
