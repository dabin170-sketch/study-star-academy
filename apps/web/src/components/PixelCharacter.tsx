/**
 * 픽셀아트 캐릭터 — 한 장의 16×16 격자(하나의 좌표계)로 몸 전체를 그린다.
 * 팔·다리·옷을 따로 움직이지 않고 프레임 단위로 통째로 바꾸므로 관절이 분리되거나 옷이 몸과 겹치는 일이 없다.
 * 모든 캐릭터는 같은 몸 격자를 공유하고, 색과 머리 장식만 다르다(디자인 일관성).
 */
import type { CharacterId } from '@academy/shared';

type Palette = Record<string, string>;

const BODY = [
  '................',
  '................',
  '................',
  '.....OOOOOO.....',
  '....OHHHHHHO....',
  '...OHHHHHHHHO...',
  '...OHSSSSSSHO...',
  '...OSSSSSSSSO...',
  '...OSBSSSSBSO...',
  '....OSSSSSSO....',
  '.....OCCCCO.....',
  '....OCCWWCCO....',
  '...OSOCCCCOSO...',
  '....OCCCCCCO....',
  '.....OLOOLO.....',
  '.....OO..OO.....',
];

const WALK = [
  '.....OCCCCO.....',
  '....OCCWWCCO....',
  '...OSOCCCCOSO...',
  '....OCCCCCCO....',
  '....OLO..OLO....',
  '....OO....OO....',
];

/** 머리 장식(0~4행을 덮어씀) */
const HEAD: Record<CharacterId, string[]> = {
  byeol: ['.......AO.......', '......AYAO......', '.....AAAAAO.....', '...OAAAAAAAAO...', '....OHHHHHHO....'],
  mochi: ['....OO....OO....', '....OPO..OPO....', '....OPO..OPO....', '.....OOOOOO.....', '....OHHHHHHO....'],
  dubu: ['................', '................', '...OO......OO...', '...OPOOOOOOPO...', '....OHHHHHHO....'],
  kongi: ['................', '................', '....OO....OO....', '....OPOOOOPO....', '....OHHHHHHO....'],
};

export const PALETTES: Record<CharacterId, Palette> = {
  byeol: { O: '#4a3f5c', H: '#7b5ea7', S: '#ffe4d1', B: '#ffb3c7', C: '#c7b5ff', W: '#ffffff', L: '#6b5a86', A: '#9b83e6', Y: '#ffd84d', P: '#ffb3c7' },
  mochi: { O: '#4a3f5c', H: '#fff6f9', S: '#fff6f9', B: '#ffb3c7', C: '#ffc9da', W: '#ffffff', L: '#d88aa6', A: '#ffc9da', Y: '#ffd84d', P: '#ffb3c7' },
  dubu: { O: '#4a3f5c', H: '#c08d5e', S: '#f6dcb8', B: '#f2a7a7', C: '#a9e3cc', W: '#ffffff', L: '#8a6240', A: '#e7b88a', Y: '#ffd84d', P: '#e7b88a' },
  kongi: { O: '#4a3f5c', H: '#f6c06a', S: '#fff3dc', B: '#f6a3a3', C: '#b8dafb', W: '#ffffff', L: '#c98a3a', A: '#f6c06a', Y: '#ffd84d', P: '#f6a3a3' },
};

export const CHARACTERS: { id: CharacterId; name: string; desc: string }[] = [
  { id: 'byeol', name: '별이', desc: '별 모자를 쓴 꼬마 마법사' },
  { id: 'mochi', name: '모찌', desc: '귀가 긴 말랑 토끼' },
  { id: 'dubu', name: '두부', desc: '든든한 곰돌이' },
  { id: 'kongi', name: '콩이', desc: '부지런한 햄스터' },
];

function grid(id: CharacterId, walking: boolean): string[] {
  const rows = [...BODY];
  HEAD[id].forEach((r, i) => {
    rows[i] = r;
  });
  if (walking) WALK.forEach((r, i) => (rows[10 + i] = r));
  return rows;
}

interface Props {
  id: CharacterId;
  size?: number;
  walking?: boolean;
  animate?: boolean;
  className?: string;
  label?: string;
}

export function PixelCharacter({ id, size = 64, walking = false, animate = true, className = '', label }: Props) {
  const pal = PALETTES[id];
  const rows = grid(id, walking);
  const rects: JSX.Element[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const k = row[x];
      if (k === '.' || !pal[k]) continue;
      rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={pal[k]} />);
    }
  });
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className={`pixelated ${className}`}
      role="img"
      aria-label={label ?? `${CHARACTERS.find((c) => c.id === id)?.name ?? '캐릭터'} 캐릭터`}
    >
      <g className={animate ? 'anim-bob' : undefined}>
        {rects}
        {/* 눈: 깜빡임은 눈 픽셀만 세로로 접는다(얼굴 영역 안에서만 변함) */}
        <g className={animate ? 'anim-blink' : undefined} fill={pal.O}>
          <rect x={6} y={7} width={1.02} height={1.02} />
          <rect x={9} y={7} width={1.02} height={1.02} />
        </g>
      </g>
    </svg>
  );
}
