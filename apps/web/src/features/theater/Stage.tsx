/**
 * 애니메이션 무대: 배경 + 캐릭터(관절 리그) + 카메라 + 말풍선 + 자막.
 * 모든 움직임은 영상이 아니라 매 프레임 실시간 계산이라, 대사·표정·장면을 고치면 바로 다시 구성된다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { RIG, SLOT_X, STAGE, blendTransition, cameraAt, forwardKinematics, samplePose, viewBoxOf, type CastProfile, type Pose } from '@academy/animation-engine';
import type { CastId, DialogueLine, Emotion, MotionId, StoryScene } from '@academy/shared';
import { MOTIONS } from '@academy/animation-engine';
import { Backdrop, FLOOR_Y } from './Backdrop';
import { CharacterRig } from './CharacterRig';

export type Quality = 'high' | 'low';

const CHAR_SCALE = 1.3;
export const rootY = (p: CastProfile) => FLOOR_Y - (RIG.standHeight + 4) * CHAR_SCALE * p.scale;

/** 화면 갱신 시계(저사양 모드는 12fps) */
export function useClock(running: boolean, quality: Quality) {
  const [t, setT] = useState(() => performance.now());
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = 0;
    const minGap = quality === 'low' ? 1000 / 12 : 0;
    const loop = (now: number) => {
      if (now - last >= minGap) {
        last = now;
        setT(now);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, quality]);
  return t;
}

export const FACT_BADGE: Record<DialogueLine['fact'], { label: string; cls: string }> = {
  source: { label: '원문', cls: 'bg-butter' },
  derived: { label: '원문 핵심어', cls: 'bg-milk' },
  fiction: { label: '이야기 설정', cls: 'bg-lavender-soft' },
};

interface StageProps {
  scene: StoryScene;
  lineIndex: number;
  /** 현재 대사 경과 시간(ms) */
  lineElapsed: number;
  /** 장면 진행률 0~1(카메라용) */
  sceneProgress: number;
  profiles: Record<CastId, CastProfile>;
  quality: Quality;
  running?: boolean;
  onEvidence?: (line: DialogueLine) => void;
  showSubtitle?: boolean;
  markers?: boolean;
  /** 대사 위 미리보기용: 특정 시점 자세 고정 */
  frozenAt?: number;
}

interface CastState {
  motion: MotionId;
  emotion: Emotion;
  switchedAt: number;
  from: Pose;
  last: Pose;
}

export function Stage({ scene, lineIndex, lineElapsed, sceneProgress, profiles, quality, running = true, onEvidence, showSubtitle = true, markers = false, frozenAt }: StageProps) {
  const now = useClock(running && frozenAt === undefined, quality);
  const t = frozenAt ?? now;
  const line: DialogueLine | undefined = scene.lines[Math.min(lineIndex, scene.lines.length - 1)];
  const speaker = line?.speaker !== 'narrator' ? (line?.speaker as CastId) : undefined;
  const states = useRef(new Map<CastId, CastState>());
  const reduced = quality === 'low';

  const focusX = useMemo(() => {
    const slot = scene.cast.find((c) => c.id === speaker)?.slot;
    return slot ? SLOT_X[slot] : 800;
  }, [scene.cast, speaker]);
  const cam = cameraAt(scene.camera.kind, sceneProgress, focusX, scene.camera.shake, t, reduced);

  const actors = scene.cast.map((c, i) => {
    const profile = profiles[c.id];
    const speaking = c.id === speaker;
    let motion: MotionId = speaking ? line!.motion : i % 2 ? 'breathe' : 'idle';
    let emotion: Emotion = speaking ? line!.emotion : line?.kind === 'concept-box' ? 'focused' : line?.misconception ? 'doubt' : profile.habitEmotion;
    if (!MOTIONS[motion]) motion = 'idle';
    let st = states.current.get(c.id);
    if (!st || st.motion !== motion || st.emotion !== emotion) {
      const from = st?.last ?? samplePose(motion, 0, emotion);
      st = { motion, emotion, switchedAt: t, from, last: from };
      states.current.set(c.id, st);
    }
    const since = Math.max(0, t - st.switchedAt);
    const target = samplePose(motion, since, emotion);
    const pose = blendTransition(st.from, target, since);
    st.last = pose;
    const blinkCycle = (t + i * 1300) % 4100;
    const blink = !reduced && blinkCycle < 130 ? 1 : 0;
    const prop = speaking ? line?.prop ?? MOTIONS[motion].prop : MOTIONS[motion].prop;
    const hand = MOTIONS[motion].hand ?? 'r';
    const x = SLOT_X[c.slot];
    const y = rootY(profile);
    const s = CHAR_SCALE * profile.scale;
    const head = forwardKinematics(pose).headCenter;
    const headWorld = { x: x + head.x * s * c.facing, y: y + head.y * s };
    return { c, profile, pose, emotion, blink, prop, hand, x, y, s, speaking, headWorld };
  });

  // 무대 좌표 → 화면 비율(말풍선 위치)
  const vbW = STAGE.width / cam.scale;
  const vbH = STAGE.height / cam.scale;
  const toScreen = (pt: { x: number; y: number }) => ({ left: ((pt.x - (cam.cx - vbW / 2)) / vbW) * 100, top: ((pt.y - (cam.cy - vbH / 2)) / vbH) * 100 });
  const sp = actors.find((a) => a.speaking);
  const bubblePos = sp ? toScreen({ x: sp.headWorld.x, y: sp.headWorld.y - RIG.headRadius * sp.s - 20 }) : null;

  return (
    <div className="w-full">
      <div className="relative w-full overflow-hidden rounded-xl border-2 border-ink/70 bg-ink/10" style={{ aspectRatio: '16 / 9' }} data-testid="stage">
        <svg viewBox={viewBoxOf(cam)} className="absolute inset-0 h-full w-full" role="img" aria-label={`${scene.title} 장면`}>
          <Backdrop id={scene.background} />
          {actors.map((a) => (
            <g key={a.c.id} transform={`translate(${a.x} ${a.y}) scale(${a.s * a.c.facing} ${a.s})`}>
              <ellipse cx={0} cy={(FLOOR_Y - a.y) / a.s - 2} rx={44} ry={9} fill="#4a3f5c" opacity={0.15} />
              <CharacterRig profile={a.profile} pose={a.pose} emotion={a.emotion} blink={a.blink} prop={a.prop} propHand={a.hand} talking={a.speaking && line?.kind === 'speech'} talkPhase={t / 90} markers={markers} />
            </g>
          ))}
        </svg>

        {/* 효과(깜빡임 없이 부드럽게) */}
        {scene.effect === 'sparkle' && !reduced && <div className="pointer-events-none absolute right-[8%] top-[10%] font-pixel text-3xl text-butter-deep anim-twinkle">✦ ✧</div>}
        {scene.effect === 'question' && <div className="pointer-events-none absolute left-[46%] top-[6%] font-pixel text-4xl text-lavender-deep">?</div>}

        {line?.kind === 'narration' && (
          <div className="absolute left-[3%] top-[4%] max-w-[60%] rounded-lg border-2 border-ink bg-white/95 px-3 py-2 text-sm shadow-pixel sm:text-base">
            <span className="mr-1 chip bg-lavender-soft text-[10px]">이야기 설정</span>
            {line.text}
          </div>
        )}

        {line?.kind === 'concept-box' && (
          <div className="absolute left-1/2 top-[7%] w-[64%] -translate-x-1/2 rounded-xl border-[3px] border-ink bg-[#fffdf3] p-3 shadow-pixel-lg sm:p-4" data-testid="concept-box">
            <div className="mb-1 flex items-center gap-2 text-[11px]">
              <span className={`chip ${FACT_BADGE[line.fact].cls}`}>{FACT_BADGE[line.fact].label}</span>
              {line.edited && <span className="chip bg-pink">검증 안 됨</span>}
              {line.evidence && onEvidence && (
                <button className="underline" onClick={() => onEvidence(line)}>
                  출처 {line.evidence.pageNumber}쪽(구간)
                </button>
              )}
            </div>
            <p className="text-sm leading-relaxed sm:text-lg">{line.text}</p>
          </div>
        )}

        {line && (line.kind === 'speech' || line.kind === 'thought') && bubblePos && (
          <button
            type="button"
            onClick={() => line.evidence && onEvidence?.(line)}
            className={`absolute max-w-[42%] -translate-x-1/2 -translate-y-full border-[3px] border-ink bg-white px-3 py-2 text-left text-xs shadow-pixel sm:text-base ${line.kind === 'thought' ? 'rounded-[999px] italic' : 'rounded-2xl'} ${line.evidence ? 'cursor-pointer' : 'cursor-default'}`}
            style={{ left: `${Math.min(80, Math.max(20, bubblePos.left))}%`, top: `${Math.max(18, bubblePos.top)}%` }}
            aria-label={`${profiles[line.speaker as CastId]?.name ?? ''}: ${line.text}`}
          >
            {line.text}
            {line.fact !== 'fiction' && <span className={`ml-1 chip ${FACT_BADGE[line.fact].cls} align-middle text-[9px]`}>{FACT_BADGE[line.fact].label}</span>}
          </button>
        )}
      </div>

      {showSubtitle && line && (
        <div className="mt-2 flex min-h-[3.5rem] items-start gap-2 rounded-lg border-2 border-ink/50 bg-white px-3 py-2" aria-live="polite" data-testid="subtitle">
          <span className="shrink-0 font-pixel text-sm font-bold">{line.speaker === 'narrator' ? '해설' : profiles[line.speaker as CastId]?.name}</span>
          <span className="flex-1 text-sm sm:text-base">{line.text}</span>
          <span className={`chip shrink-0 ${FACT_BADGE[line.fact].cls}`}>{FACT_BADGE[line.fact].label}</span>
          {line.evidence && onEvidence && (
            <button className="btn-ghost btn-sm shrink-0" onClick={() => onEvidence(line)}>
              원문 보기
            </button>
          )}
        </div>
      )}
    </div>
  );
}
