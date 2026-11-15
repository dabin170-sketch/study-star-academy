/**
 * 관절 리그 캐릭터 렌더러.
 * 몸의 각 부위는 부모 <g> 안에 중첩되어 고정 피벗에서 회전한다(어깨 → 팔꿈치 → 손목 → 손 → 소품).
 * 관절 위치에는 같은 색의 원(관절 캡)을 겹쳐 회전해도 이음새가 보이지 않는다.
 * data-joint 표시점은 화면에서 관절 연결을 검사하는 E2E 테스트에 쓰인다.
 */
import { memo } from 'react';
import { FACES, RIG, signedBend, type CastProfile, type FaceParams, type Pose } from '@academy/animation-engine';
import type { Emotion, PropId } from '@academy/shared';

interface Props {
  profile: CastProfile;
  pose: Pose;
  emotion: Emotion;
  /** 0~1, 1이면 눈을 감음(깜빡임) */
  blink?: number;
  prop?: PropId;
  propHand?: 'l' | 'r';
  /** 말하는 중이면 입을 여닫음 */
  talking?: boolean;
  talkPhase?: number;
  markers?: boolean;
}

const shade = (hex: string, amt: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt)));
  return `#${((c(n >> 16) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, '0')}`;
};

const INK = '#4a3f5c';

function Prop({ id }: { id: PropId }) {
  switch (id) {
    case 'book':
      return (
        <g transform="translate(-4 4) rotate(-10)">
          <rect x={-22} y={-4} width={44} height={30} rx={3} fill="#9b83e6" stroke={INK} strokeWidth={2.5} />
          <line x1={0} y1={-4} x2={0} y2={26} stroke={INK} strokeWidth={2} />
        </g>
      );
    case 'pencil':
      return (
        <g transform="rotate(-35)">
          <rect x={-3} y={-2} width={6} height={30} fill="#ffd84d" stroke={INK} strokeWidth={2} />
          <path d="M-3 28 L0 36 L3 28 Z" fill={INK} />
        </g>
      );
    case 'magnifier':
      return (
        <g transform="rotate(-25)">
          <line x1={0} y1={0} x2={0} y2={18} stroke={INK} strokeWidth={5} strokeLinecap="round" />
          <circle cx={0} cy={30} r={13} fill="#eaf5ff" stroke={INK} strokeWidth={3.5} />
        </g>
      );
    case 'flask':
      return (
        <g>
          <rect x={-5} y={-2} width={10} height={12} fill="#fff" stroke={INK} strokeWidth={2} />
          <path d="M-5 10 L-16 34 Q0 40 16 34 L5 10 Z" fill="#c4f0dc" stroke={INK} strokeWidth={2.5} />
        </g>
      );
    case 'gavel':
      return (
        <g transform="rotate(-30)">
          <rect x={-3} y={-2} width={6} height={30} fill="#c98a3a" stroke={INK} strokeWidth={2} />
          <rect x={-14} y={26} width={28} height={12} rx={3} fill="#8a6240" stroke={INK} strokeWidth={2} />
        </g>
      );
    case 'paper':
      return <rect x={-14} y={2} width={28} height={34} fill="#fff" stroke={INK} strokeWidth={2} transform="rotate(8)" />;
    default:
      return null;
  }
}

function Hair({ p, front }: { p: CastProfile; front: boolean }) {
  const r = RIG.headRadius;
  const c = p.hair;
  const stroke = { stroke: INK, strokeWidth: 3, strokeLinejoin: 'round' as const };
  switch (p.hairStyle) {
    case 'bob':
      return front ? <path d={`M${-r} -6 Q${-r} ${-r - 8} 0 ${-r - 6} Q${r} ${-r - 8} ${r} -6 Q${r * 0.5} ${-r * 0.45} 4 ${-r * 0.55} Q${-r * 0.5} ${-r * 0.4} ${-r} -6 Z`} fill={c} {...stroke} /> : <path d={`M${-r - 4} -10 Q${-r - 8} ${r * 0.9} ${-r * 0.6} ${r * 0.8} L${r * 0.6} ${r * 0.8} Q${r + 8} ${r * 0.9} ${r + 4} -10 Z`} fill={c} {...stroke} />;
    case 'spiky':
      return front ? <path d={`M${-r} -4 L${-r + 6} ${-r - 14} L${-r * 0.4} ${-r + 2} L${-r * 0.2} ${-r - 20} L${r * 0.15} ${-r + 2} L${r * 0.45} ${-r - 18} L${r * 0.6} ${-r + 4} L${r - 2} ${-r - 10} L${r} -4 Q0 ${-r * 0.5} ${-r} -4 Z`} fill={c} {...stroke} /> : null;
    case 'curly':
      return front ? (
        <g>
          {[-36, -18, 0, 18, 36].map((x, i) => (
            <circle key={i} cx={x} cy={-r + 6 + Math.abs(x) * 0.25} r={15} fill={c} {...stroke} />
          ))}
        </g>
      ) : (
        <ellipse cx={0} cy={-6} rx={r + 6} ry={r + 2} fill={c} {...stroke} />
      );
    case 'ponytail':
      return front ? <path d={`M${-r} -2 Q${-r + 4} ${-r - 10} 0 ${-r - 6} Q${r - 4} ${-r - 10} ${r} -2 Q${r * 0.3} ${-r * 0.55} ${-r * 0.2} ${-r * 0.5} Q${-r * 0.7} ${-r * 0.4} ${-r} -2 Z`} fill={c} {...stroke} /> : <path d={`M${r * 0.6} ${-r * 0.6} Q${r + 30} ${-r * 0.4} ${r + 14} ${r * 0.7} Q${r + 4} ${r * 0.2} ${r * 0.5} ${-r * 0.2} Z`} fill={c} {...stroke} />;
    case 'short':
      return front ? <path d={`M${-r} -8 Q${-r} ${-r - 12} 0 ${-r - 8} Q${r} ${-r - 12} ${r} -8 Q${r * 0.2} ${-r * 0.7} ${-r} -8 Z`} fill={c} {...stroke} /> : null;
    case 'sidepart':
      return front ? <path d={`M${-r - 2} 4 Q${-r - 4} ${-r - 10} ${-r * 0.1} ${-r - 8} Q${r + 4} ${-r - 6} ${r + 2} 8 Q${r * 0.6} ${-r * 0.5} ${-r * 0.3} ${-r * 0.55} Q${-r * 0.6} ${-r * 0.2} ${-r - 2} 4 Z`} fill={c} {...stroke} /> : <path d={`M${-r - 4} 0 Q${-r - 6} ${r * 0.8} ${-r * 0.4} ${r * 0.6} L${r * 0.4} ${r * 0.6} Q${r + 6} ${r * 0.8} ${r + 4} 0 Z`} fill={c} {...stroke} />;
  }
}

function Accessory({ p }: { p: CastProfile }) {
  const r = RIG.headRadius;
  switch (p.accessory) {
    case 'star-pin':
      return <path d={`M${r * 0.55} ${-r * 0.62} l4 8 9 1 -7 6 2 9 -8 -5 -8 5 2 -9 -7 -6 9 -1z`} fill="#ffd84d" stroke={INK} strokeWidth={2} />;
    case 'cap':
      return (
        <g>
          <path d={`M${-r - 2} ${-r * 0.45} Q0 ${-r - 26} ${r + 2} ${-r * 0.45} Z`} fill={p.accent} stroke={INK} strokeWidth={3} />
          <path d={`M${r * 0.2} ${-r * 0.45} L${r + 26} ${-r * 0.4} L${r + 22} ${-r * 0.28} L${r * 0.2} ${-r * 0.3} Z`} fill={shade(p.accent, -30)} stroke={INK} strokeWidth={2.5} />
        </g>
      );
    case 'glasses':
      return (
        <g fill="none" stroke={INK} strokeWidth={3}>
          <circle cx={-16} cy={0} r={11} fill="rgba(255,255,255,0.25)" />
          <circle cx={16} cy={0} r={11} fill="rgba(255,255,255,0.25)" />
          <line x1={-5} y1={0} x2={5} y2={0} />
        </g>
      );
    case 'goggles':
      return (
        <g>
          <rect x={-r} y={-r * 0.62} width={r * 2} height={8} fill={INK} />
          <rect x={-30} y={-r * 0.8} width={24} height={16} rx={7} fill="#cfe6ff" stroke={INK} strokeWidth={3} />
          <rect x={6} y={-r * 0.8} width={24} height={16} rx={7} fill="#cfe6ff" stroke={INK} strokeWidth={3} />
        </g>
      );
    case 'headband':
      return <path d={`M${-r + 2} ${-r * 0.5} Q0 ${-r * 0.95} ${r - 2} ${-r * 0.5}`} fill="none" stroke={p.accent} strokeWidth={8} strokeLinecap="round" />;
    default:
      return null;
  }
}

function Face({ f, blink, talking, talkPhase = 0 }: { f: FaceParams; blink: number; talking: boolean; talkPhase?: number }) {
  const eyeY = 0;
  const eyes = blink > 0.6 || f.eyes === 'closed' ? 'closed' : f.eyes;
  const eye = (x: number) => {
    switch (eyes) {
      case 'happy':
        return <path key={x} d={`M${x - 7} ${eyeY + 2} Q${x} ${eyeY - 7} ${x + 7} ${eyeY + 2}`} fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />;
      case 'wide':
        return (
          <g key={x}>
            <circle cx={x} cy={eyeY} r={8} fill="#fff" stroke={INK} strokeWidth={2.5} />
            <circle cx={x} cy={eyeY + 1} r={4} fill={INK} />
          </g>
        );
      case 'narrow':
        return <ellipse key={x} cx={x} cy={eyeY + 1} rx={6} ry={3} fill={INK} />;
      case 'closed':
        return <path key={x} d={`M${x - 7} ${eyeY} Q${x} ${eyeY + 6} ${x + 7} ${eyeY}`} fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />;
      case 'swirl':
        return <path key={x} d={`M${x} ${eyeY} m-1 0 a2 2 0 1 1 3 0 a4 4 0 1 1 -6 0 a6 6 0 1 1 9 0`} fill="none" stroke={INK} strokeWidth={2.2} />;
      case 'look-up':
        return (
          <g key={x}>
            <ellipse cx={x} cy={eyeY} rx={6} ry={8} fill="#fff" stroke={INK} strokeWidth={2.5} />
            <circle cx={x + 1} cy={eyeY - 3} r={3.5} fill={INK} />
          </g>
        );
      default:
        return (
          <g key={x}>
            <ellipse cx={x} cy={eyeY} rx={5} ry={7} fill={INK} />
            <circle cx={x + 2} cy={eyeY - 3} r={1.8} fill="#fff" />
          </g>
        );
    }
  };
  const brow = (x: number, side: -1 | 1) => (
    <line key={`b${x}`} x1={x - 8} y1={-16 + f.browY} x2={x + 8} y2={-16 + f.browY} stroke={INK} strokeWidth={3.5} strokeLinecap="round" transform={`rotate(${side * -f.browAngle} ${x} ${-16 + f.browY})`} />
  );
  const mouthShape = talking && f.mouth !== 'o' ? (Math.sin(talkPhase) > 0 ? 'open' : f.mouth) : f.mouth;
  const mouth = (() => {
    switch (mouthShape) {
      case 'smile':
        return <path d="M-9 18 Q0 26 9 18" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />;
      case 'grin':
        return <path d="M-11 16 Q0 30 11 16 Z" fill="#c75b78" stroke={INK} strokeWidth={3} strokeLinejoin="round" />;
      case 'open':
        return <ellipse cx={0} cy={21} rx={7} ry={6} fill="#c75b78" stroke={INK} strokeWidth={3} />;
      case 'o':
        return <ellipse cx={0} cy={21} rx={5} ry={7} fill="#c75b78" stroke={INK} strokeWidth={3} />;
      case 'frown':
        return <path d="M-9 24 Q0 16 9 24" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />;
      case 'wavy':
        return <path d="M-11 20 q3.6 -4 7.3 0 t7.3 0 t7.3 0" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />;
      case 'smirk':
        return <path d="M-8 20 Q3 24 10 15" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />;
      case 'shout':
        return <path d="M-10 15 L10 15 L6 27 L-6 27 Z" fill="#c75b78" stroke={INK} strokeWidth={3} strokeLinejoin="round" />;
      default:
        return <line x1={-8} y1={20} x2={8} y2={20} stroke={INK} strokeWidth={3.5} strokeLinecap="round" />;
    }
  })();
  return (
    <g>
      {f.blush && (
        <g fill="#ff9fb8" opacity={0.6}>
          <ellipse cx={-26} cy={12} rx={8} ry={5} />
          <ellipse cx={26} cy={12} rx={8} ry={5} />
        </g>
      )}
      {brow(-16, -1)}
      {brow(16, 1)}
      {eye(-16)}
      {eye(16)}
      {mouth}
      {f.sweat && <path d="M34 -22 q6 10 0 14 q-6 -4 0 -14 Z" fill="#9fd3ff" stroke={INK} strokeWidth={2} />}
      {f.tear && <path d="M-18 8 q5 9 0 13 q-5 -4 0 -13 Z" fill="#9fd3ff" stroke={INK} strokeWidth={2} />}
      {f.anger && <path d="M26 -34 l6 6 m0 -6 l-6 6 M34 -30 l4 4" stroke="#e0485f" strokeWidth={3.5} strokeLinecap="round" />}
    </g>
  );
}

function CharacterRigBase({ profile, pose, emotion, blink = 0, prop, propHand = 'r', talking = false, talkPhase = 0, markers = false }: Props) {
  const p = profile;
  const f = FACES[emotion];
  const outfitDark = shade(p.outfit, -28);
  const pants = shade(p.accent, -20);
  const sk = { stroke: INK, strokeWidth: 3, strokeLinejoin: 'round' as const };

  const arm = (side: 'l' | 'r') => {
    const sh = side === 'l' ? RIG.shoulderL : RIG.shoulderR;
    const shoulderAngle = side === 'l' ? pose.lShoulder : pose.rShoulder;
    const elbow = signedBend(side === 'l' ? 'lElbow' : 'rElbow', side === 'l' ? pose.lElbow : pose.rElbow);
    return (
      <g transform={`translate(${sh.x} ${sh.y}) rotate(${shoulderAngle})`} data-part={`upperArm${side}`}>
        {/* 위팔(소매 포함): 관절 캡과 겹치도록 위아래로 조금 길게 */}
        <rect x={-9} y={-8} width={18} height={RIG.upperArm + 14} rx={9} fill={p.outfit} {...sk} />
        {markers && <circle data-joint={`elbow${side}-parent`} cx={0} cy={RIG.upperArm} r={0.5} fill="none" />}
        <g transform={`translate(0 ${RIG.upperArm}) rotate(${elbow})`} data-part={`forearm${side}`}>
          {markers && <circle data-joint={`elbow${side}-child`} cx={0} cy={0} r={0.5} fill="none" />}
          <rect x={-7} y={-7} width={14} height={RIG.forearm + 10} rx={7} fill={p.skin} {...sk} />
          <circle cx={0} cy={0} r={7.5} fill={p.skin} />
          {markers && <circle data-joint={`wrist${side}-parent`} cx={0} cy={RIG.forearm} r={0.5} fill="none" />}
          <g transform={`translate(0 ${RIG.forearm})`} data-part={`hand${side}`}>
            {markers && <circle data-joint={`wrist${side}-child`} cx={0} cy={0} r={0.5} fill="none" />}
            <circle cx={0} cy={2} r={RIG.hand} fill={p.skin} {...sk} />
            {prop && prop !== 'none' && propHand === side && <Prop id={prop} />}
          </g>
        </g>
        {/* 어깨 관절 캡(소매색) */}
        <circle cx={0} cy={0} r={10} fill={p.outfit} />
      </g>
    );
  };

  const leg = (side: 'l' | 'r') => {
    const hip = side === 'l' ? RIG.hipL : RIG.hipR;
    const h = side === 'l' ? pose.lHip : pose.rHip;
    const k = signedBend(side === 'l' ? 'lKnee' : 'rKnee', side === 'l' ? pose.lKnee : pose.rKnee);
    return (
      <g transform={`translate(${hip.x} ${hip.y}) rotate(${h})`}>
        <rect x={-10} y={-8} width={20} height={RIG.thigh + 14} rx={9} fill={pants} {...sk} />
        <g transform={`translate(0 ${RIG.thigh}) rotate(${k})`}>
          <rect x={-8} y={-8} width={16} height={RIG.shin + 10} rx={8} fill={pants} {...sk} />
          <circle cx={0} cy={0} r={8.5} fill={pants} />
          <ellipse cx={side === 'l' ? -5 : 5} cy={RIG.shin + 4} rx={14} ry={8} fill={INK} />
        </g>
      </g>
    );
  };

  return (
    <g data-cast={p.id}>
      <g transform={`translate(${pose.x} ${pose.y})`}>
        {leg('l')}
        {leg('r')}
        <g transform={`rotate(${pose.torso})`}>
          {/* 뒷머리(포니테일·단발 뒤쪽) */}
          <g transform={`translate(${RIG.neck.x} ${RIG.neck.y}) rotate(${pose.head}) translate(${RIG.headCenter.x} ${RIG.headCenter.y + pose.headY})`}>
            <Hair p={p} front={false} />
          </g>
          {/* 몸통 */}
          <path d="M-33 -100 Q-38 -40 -30 6 L30 6 Q38 -40 33 -100 Q0 -112 -33 -100 Z" fill={p.outfit} {...sk} />
          <path d="M-14 -101 L0 -84 L14 -101" fill="none" stroke={outfitDark} strokeWidth={4} strokeLinecap="round" />
          <rect x={-30} y={-6} width={60} height={12} rx={4} fill={outfitDark} />
          <rect x={-7} y={-112} width={14} height={16} fill={p.skin} {...sk} />
          {/* 머리 */}
          <g transform={`translate(${RIG.neck.x} ${RIG.neck.y}) rotate(${pose.head}) translate(${RIG.headCenter.x} ${RIG.headCenter.y + pose.headY})`} data-part="head">
            <circle cx={0} cy={0} r={RIG.headRadius} fill={p.skin} {...sk} />
            <Face f={f} blink={blink} talking={talking} talkPhase={talkPhase} />
            <Hair p={p} front />
            <Accessory p={p} />
          </g>
          {arm('l')}
          {arm('r')}
        </g>
      </g>
    </g>
  );
}

export const CharacterRig = memo(CharacterRigBase);
