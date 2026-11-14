/** 픽셀 건물 아이콘 — 모든 건물이 같은 격자 틀을 쓰고 색과 간판만 다르다. */
export function PixelBuilding({ roof, wall, size = 72, sign }: { roof: string; wall: string; size?: number; sign?: string }) {
  const ink = '#4a3f5c';
  return (
    <svg viewBox="0 0 20 18" width={size} height={(size * 18) / 20} className="pixelated" aria-hidden="true">
      {/* 지붕 */}
      <rect x="9" y="1" width="2" height="1" fill={ink} />
      <rect x="7" y="2" width="6" height="1" fill={ink} />
      <rect x="8" y="2" width="4" height="1" fill={roof} />
      <rect x="5" y="3" width="10" height="1" fill={ink} />
      <rect x="6" y="3" width="8" height="1" fill={roof} />
      <rect x="3" y="4" width="14" height="1" fill={ink} />
      <rect x="4" y="4" width="12" height="1" fill={roof} />
      <rect x="1" y="5" width="18" height="2" fill={ink} />
      <rect x="2" y="5" width="16" height="1" fill={roof} />
      {/* 벽 */}
      <rect x="2" y="7" width="16" height="10" fill={ink} />
      <rect x="3" y="7" width="14" height="9" fill={wall} />
      {/* 창문 */}
      <rect x="4" y="9" width="3" height="3" fill={ink} />
      <rect x="5" y="10" width="1" height="1" fill="#ffeea0" />
      <rect x="13" y="9" width="3" height="3" fill={ink} />
      <rect x="14" y="10" width="1" height="1" fill="#ffeea0" />
      {/* 문 */}
      <rect x="8" y="11" width="4" height="6" fill={ink} />
      <rect x="9" y="12" width="2" height="4" fill={roof} />
      <rect x="10" y="14" width="1" height="1" fill="#ffeea0" />
      {/* 간판 별 */}
      <rect x="9" y="8" width="2" height="2" fill="#ffd84d" />
      {sign && <title>{sign}</title>}
      <rect x="0" y="17" width="20" height="1" fill="#4fbf93" />
    </svg>
  );
}
