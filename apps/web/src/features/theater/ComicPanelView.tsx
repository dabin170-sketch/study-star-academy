import { RIG, SLOT_X, forwardKinematics, samplePose, MOTIONS, type CastProfile } from '@academy/animation-engine';
import type { ComicPanel, Framing } from '@academy/learning-engine';
import type { CastId, DialogueLine } from '@academy/shared';
import { Backdrop, BOARD_RECT } from './Backdrop';
import { CharacterRig } from './CharacterRig';
import { FACT_BADGE, rootY } from './Stage';

const CHAR_SCALE = 1.3;

function viewBoxFor(framing: Framing, focusX: number, headY: number, aspect: number): [number, number, number, number] {
  const fit = (w: number, cx: number, cy: number): [number, number, number, number] => {
    const h = w / aspect;
    const x = Math.min(1600 - w, Math.max(0, cx - w / 2));
    const y = Math.min(900 - h, Math.max(0, cy - h / 2));
    return [x, y, w, h];
  };
  switch (framing) {
    case 'wide':
      return fit(Math.min(1600, 900 * aspect), 800, 450);
    case 'full':
      return fit(Math.min(1250, 900 * aspect), focusX * 0.5 + 400, 480);
    case 'medium':
      return fit(860, focusX, headY + 150);
    case 'closeup':
      return fit(480, focusX, headY + 40);
    case 'over-shoulder':
      return fit(780, focusX, headY + 120);
    case 'object':
      return fit(Math.max(BOARD_RECT.w + 160, 700), BOARD_RECT.x + BOARD_RECT.w / 2, BOARD_RECT.y + BOARD_RECT.h / 2 + 60);
  }
}

export function ComicPanelView({ panel, profiles, aspect = 4 / 3, onEvidence, index }: { panel: ComicPanel; profiles: Record<CastId, CastProfile>; aspect?: number; onEvidence?: (l: DialogueLine) => void; index: number }) {
  const speechLines = panel.lines.filter((l) => l.kind === 'speech' || l.kind === 'thought');
  const box = panel.lines.find((l) => l.kind === 'concept-box');
  const narration = panel.lines.find((l) => l.kind === 'narration');
  const focusSlot = panel.cast.find((c) => c.id === panel.focus)?.slot;
  const focusX = focusSlot ? SLOT_X[focusSlot] : 800;
  const actors = panel.cast.map((c, i) => {
    const profile = profiles[c.id];
    const myLine = panel.lines.find((l) => l.speaker === c.id);
    const motion = myLine?.motion && MOTIONS[myLine.motion] ? myLine.motion : (['idle', 'breathe'] as const)[i % 2];
    const emotion = myLine?.emotion ?? (box ? 'focused' : profile.habitEmotion);
    // 동작이 가장 잘 드러나는 순간(모션의 40% 지점)으로 고정
    const pose = samplePose(motion, MOTIONS[motion].durationMs * 0.4, emotion);
    const s = CHAR_SCALE * profile.scale;
    const x = SLOT_X[c.slot];
    const y = rootY(profile);
    const head = forwardKinematics(pose).headCenter;
    return { c, profile, pose, emotion, s, x, y, prop: myLine?.prop ?? MOTIONS[motion].prop, hand: MOTIONS[motion].hand ?? 'r', headWorld: { x: x + head.x * s * c.facing, y: y + head.y * s } };
  });

  const focusActor = actors.find((a) => a.c.id === panel.focus) ?? actors[0];
  const [vx, vy, vw, vh] = viewBoxFor(panel.framing, focusActor ? focusActor.headWorld.x : focusX, focusActor ? focusActor.headWorld.y : 430, aspect);

  // 어깨너머 구도: 초점 인물이 아닌 사람을 앞쪽 가장자리에 크게(뒷모습처럼 잘리게) 배치
  const fg = panel.framing === 'over-shoulder' ? actors.find((a) => a.c.id !== panel.focus) : undefined;
  const toPct = (pt: { x: number; y: number }) => ({ left: ((pt.x - vx) / vw) * 100, top: ((pt.y - vy) / vh) * 100 });

  return (
    <figure className="relative overflow-hidden rounded-lg border-[3px] border-ink bg-white" style={{ aspectRatio: String(aspect) }} data-testid="comic-panel" aria-label={`${index + 1}번째 컷`}>
      <svg viewBox={`${vx} ${vy} ${vw} ${vh}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
        <Backdrop id={panel.background} />
        {actors
          .filter((a) => a !== fg)
          .map((a) => (
            <g key={a.c.id} transform={`translate(${a.x} ${a.y}) scale(${a.s * a.c.facing} ${a.s})`}>
              <CharacterRig profile={a.profile} pose={a.pose} emotion={a.emotion} prop={a.prop} propHand={a.hand} />
            </g>
          ))}
        {fg && (
          <g transform={`translate(${focusX < 800 ? vx + vw * 0.92 : vx + vw * 0.08} ${vy + vh * 0.78}) scale(${fg.s * 1.6 * (focusX < 800 ? -1 : 1)} ${fg.s * 1.6})`} opacity={0.95}>
            <CharacterRig profile={fg.profile} pose={fg.pose} emotion={fg.emotion} />
          </g>
        )}
      </svg>

      {narration && (
        <div className="absolute left-2 top-2 max-w-[75%] border-2 border-ink bg-[#fff8d6] px-2 py-1 text-[11px] sm:text-xs">
          {narration.text}
        </div>
      )}
      {panel.sfx && <div className="absolute right-3 top-2 rotate-6 font-pixel text-lg font-bold text-pink-deep drop-shadow sm:text-2xl">{panel.sfx}</div>}

      {box && (
        <button type="button" onClick={() => onEvidence?.(box)} className="absolute inset-x-[8%] top-[12%] rounded-lg border-[3px] border-ink bg-[#fffdf3] p-2 text-left text-xs shadow-pixel sm:text-sm" data-testid="comic-concept-box">
          <span className={`chip mb-1 ${FACT_BADGE[box.fact].cls} text-[10px]`}>{FACT_BADGE[box.fact].label} · 개념 정리</span>
          <span className="block leading-snug">{box.text}</span>
        </button>
      )}

      {speechLines.map((l, i) => {
        const a = actors.find((x) => x.c.id === l.speaker);
        if (!a) return null;
        const pos = toPct({ x: a.headWorld.x, y: a.headWorld.y - RIG.headRadius * a.s - 10 });
        return (
          <button
            key={l.id}
            type="button"
            onClick={() => l.evidence && onEvidence?.(l)}
            className={`absolute max-w-[58%] -translate-x-1/2 -translate-y-full border-2 border-ink bg-white px-2 py-1 text-left text-[11px] leading-snug shadow-pixel sm:text-sm ${l.kind === 'thought' ? 'rounded-[999px] italic' : 'rounded-xl'}`}
            style={{ left: `${Math.min(76, Math.max(24, pos.left + (i ? 8 : 0)))}%`, top: `${Math.min(70, Math.max(22 + i * 22, pos.top))}%` }}
          >
            {l.misconception && <span className="mr-1 chip bg-pink text-[9px]">오개념</span>}
            {l.text}
            {l.fact !== 'fiction' && <span className={`ml-1 chip ${FACT_BADGE[l.fact].cls} text-[9px]`}>{FACT_BADGE[l.fact].label}</span>}
          </button>
        );
      })}
      <figcaption className="sr-only">{panel.lines.map((l) => l.text).join(' ')}</figcaption>
    </figure>
  );
}
