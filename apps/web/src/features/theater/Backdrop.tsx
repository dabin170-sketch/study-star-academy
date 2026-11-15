/** 배경 레이어(1600×900). 캐릭터와 분리된 별도 레이어로 그린다. 바닥선은 y=740. */
import { memo } from 'react';
import type { BackgroundId } from '@academy/shared';

const INK = '#4a3f5c';
export const FLOOR_Y = 740;

function Window({ x, y, w = 220, h = 180 }: { x: number; y: number; w?: number; h?: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill="#cfe6ff" stroke={INK} strokeWidth={5} />
      <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y + h} stroke={INK} strokeWidth={4} />
      <line x1={x} y1={y + h / 2} x2={x + w} y2={y + h / 2} stroke={INK} strokeWidth={4} />
      <circle cx={x + w * 0.75} cy={y + h * 0.28} r={18} fill="#fff8d6" />
    </g>
  );
}

function Board({ x = 470, y = 110, w = 660, h = 330, color = '#3f6b5c' }: { x?: number; y?: number; w?: number; h?: number; color?: string }) {
  return (
    <g>
      <rect x={x - 14} y={y - 14} width={w + 28} height={h + 28} rx={10} fill="#c98a3a" stroke={INK} strokeWidth={5} />
      <rect x={x} y={y} width={w} height={h} rx={4} fill={color} />
      <rect x={x + 30} y={y + h + 14} width={120} height={10} rx={3} fill="#fff" opacity={0.85} />
    </g>
  );
}

function Floor({ color }: { color: string }) {
  return (
    <g>
      <rect x={0} y={FLOOR_Y - 20} width={1600} height={200} fill={color} />
      <line x1={0} y1={FLOOR_Y - 20} x2={1600} y2={FLOOR_Y - 20} stroke={INK} strokeWidth={4} opacity={0.6} />
    </g>
  );
}

function Shelf({ x, y }: { x: number; y: number }) {
  const colors = ['#9b83e6', '#f08fb0', '#4fbf93', '#6fa8e8', '#e8c13d', '#c98a3a'];
  return (
    <g>
      <rect x={x} y={y} width={300} height={420} fill="#e7b88a" stroke={INK} strokeWidth={5} />
      {[0, 1, 2, 3].map((r) => (
        <g key={r}>
          <line x1={x} y1={y + 105 * (r + 1)} x2={x + 300} y2={y + 105 * (r + 1)} stroke={INK} strokeWidth={4} />
          {Array.from({ length: 9 }, (_, i) => (
            <rect key={i} x={x + 12 + i * 31} y={y + 105 * r + 22 + ((i * 7 + r * 3) % 14)} width={24} height={80 - ((i * 7 + r * 3) % 14)} fill={colors[(i + r) % colors.length]} stroke={INK} strokeWidth={2} />
          ))}
        </g>
      ))}
    </g>
  );
}

function BackdropBase({ id }: { id: BackgroundId }) {
  switch (id) {
    case 'classroom':
      return (
        <g>
          <rect width={1600} height={900} fill="#fff4e0" />
          <rect y={560} width={1600} height={160} fill="#f3e2c8" />
          <Board />
          <Window x={90} y={150} />
          <Window x={1290} y={150} />
          <rect x={1220} y={470} width={260} height={60} rx={6} fill="#c98a3a" stroke={INK} strokeWidth={4} />
          <Floor color="#e8c9a0" />
        </g>
      );
    case 'library':
      return (
        <g>
          <rect width={1600} height={900} fill="#f0eaff" />
          <Shelf x={60} y={190} />
          <Shelf x={1240} y={190} />
          <Board x={520} y={150} w={560} h={260} color="#fdfbf5" />
          <Floor color="#d9c5f0" />
        </g>
      );
    case 'lab':
      return (
        <g>
          <rect width={1600} height={900} fill="#e6faf1" />
          <Board x={480} y={120} w={640} h={300} color="#ffffff" />
          <rect x={60} y={480} width={360} height={30} fill="#7a6f8c" stroke={INK} strokeWidth={4} />
          {[100, 190, 290].map((x, i) => (
            <path key={x} d={`M${x} 480 l-24 -60 h48 z`} fill={['#9fd3ff', '#ffc9da', '#ffeea0'][i]} stroke={INK} strokeWidth={4} />
          ))}
          <rect x={1180} y={480} width={360} height={30} fill="#7a6f8c" stroke={INK} strokeWidth={4} />
          <circle cx={1300} cy={440} r={36} fill="#c4f0dc" stroke={INK} strokeWidth={4} />
          <Floor color="#c8e8d8" />
        </g>
      );
    case 'courtroom':
      return (
        <g>
          <rect width={1600} height={900} fill="#f6efe2" />
          <rect x={560} y={80} width={480} height={60} rx={8} fill="#8a6240" stroke={INK} strokeWidth={5} />
          <circle cx={800} cy={110} r={22} fill="#ffd84d" stroke={INK} strokeWidth={4} />
          <Board x={520} y={170} w={560} h={250} color="#fdfbf5" />
          <rect x={430} y={500} width={740} height={120} fill="#a6713f" stroke={INK} strokeWidth={5} />
          {[120, 1380].map((x) => (
            <rect key={x} x={x} y={120} width={100} height={460} fill="#e7d3b6" stroke={INK} strokeWidth={5} />
          ))}
          <Floor color="#c9a77c" />
        </g>
      );
    case 'office':
      return (
        <g>
          <rect width={1600} height={900} fill="#f3ead9" />
          <Window x={100} y={140} w={260} h={220} />
          <rect x={500} y={120} width={600} height={320} fill="#d9a066" stroke={INK} strokeWidth={5} />
          {[[560, 160, '#fff8d6'], [760, 190, '#ffe3ec'], [930, 150, '#eaf5ff'], [650, 300, '#fff'], [880, 310, '#e6faf1']].map(([x, y, c], i) => (
            <g key={i}>
              <rect x={x as number} y={y as number} width={110} height={90} fill={c as string} stroke={INK} strokeWidth={3} transform={`rotate(${(i % 2 ? 4 : -5)} ${x} ${y})`} />
              <circle cx={(x as number) + 55} cy={(y as number) + 6} r={6} fill="#e0485f" />
            </g>
          ))}
          <path d="M615 205 L815 235 L985 195 M705 345 L935 355" stroke="#e0485f" strokeWidth={3} fill="none" />
          <rect x={1180} y={470} width={340} height={70} fill="#8a6240" stroke={INK} strokeWidth={4} />
          <Floor color="#b8946a" />
        </g>
      );
    case 'village':
      return (
        <g>
          <rect width={1600} height={900} fill="#fde9d0" />
          <circle cx={1350} cy={150} r={70} fill="#ffd84d" opacity={0.8} />
          {[[80, 300], [560, 260], [1040, 300]].map(([x, y], i) => (
            <g key={i}>
              <rect x={x + 40} y={y + 90} width={320} height={210} fill="#fff8ec" stroke={INK} strokeWidth={5} />
              <path d={`M${x} ${y + 100} Q${x + 200} ${y - 40} ${x + 400} ${y + 100} Z`} fill="#4a4a5c" stroke={INK} strokeWidth={5} />
              <rect x={x + 170} y={y + 180} width={60} height={120} fill="#c98a3a" stroke={INK} strokeWidth={4} />
            </g>
          ))}
          <Floor color="#e2c493" />
        </g>
      );
    case 'park':
    default:
      return (
        <g>
          <rect width={1600} height={900} fill="#dff3ff" />
          {[[120, 260], [1350, 240], [1500, 320]].map(([x, y], i) => (
            <g key={i}>
              <rect x={x - 18} y={y + 120} width={36} height={340} fill="#a6713f" stroke={INK} strokeWidth={4} />
              <circle cx={x} cy={y + 80} r={120} fill="#7fd1a8" stroke={INK} strokeWidth={5} />
            </g>
          ))}
          <Board x={520} y={150} w={560} h={260} color="#fdfbf5" />
          <Floor color="#a8e0b8" />
        </g>
      );
  }
}

export const Backdrop = memo(BackdropBase);

/** 칠판(자료) 영역 — 개념 상자를 띄울 위치 */
export const BOARD_RECT = { x: 470, y: 110, w: 660, h: 330 };
