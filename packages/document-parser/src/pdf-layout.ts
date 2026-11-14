/**
 * PDF 텍스트 항목 → 읽기 순서의 줄 목록.
 * 두 단(2-column) 문서에서 왼쪽 단과 오른쪽 단 문장이 같은 줄로 섞이는 문제를 막기 위해
 * 줄을 만들기 전에 항목을 단별로 먼저 나눈다.
 */
import type { PositionedText, TextLine } from './types';

export interface LayoutResult {
  lines: TextLine[];
  twoColumn: boolean;
}

const median = (nums: number[]) => {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** 같은 기준선 근처의 항목을 하나의 줄로 묶는다. */
export function groupIntoLines(items: PositionedText[]): TextLine[] {
  const usable = items.filter((i) => i.str.trim().length > 0);
  if (!usable.length) return [];
  const sorted = [...usable].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: PositionedText[][] = [];
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    if (row) {
      const refY = row[0].y;
      const tol = Math.max(2, Math.min(row[0].fontSize, it.fontSize) * 0.5);
      if (Math.abs(refY - it.y) <= tol) {
        row.push(it);
        continue;
      }
    }
    rows.push([it]);
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    const fontSize = median(row.map((r) => r.fontSize)) || 10;
    let text = '';
    const cells: string[] = [];
    let cell = '';
    let bigGaps = 0;
    let prevEnd: number | null = null;
    for (const it of row) {
      if (prevEnd !== null) {
        const gap = it.x - prevEnd;
        if (gap > fontSize * 2.2) {
          bigGaps++;
          cells.push(cell.trim());
          cell = '';
          text += ' ';
        } else if (gap > fontSize * 0.22 && !text.endsWith(' ') && !it.str.startsWith(' ')) {
          text += ' ';
          cell += ' ';
        }
      }
      text += it.str;
      cell += it.str;
      prevEnd = it.x + it.width;
    }
    cells.push(cell.trim());
    const line: TextLine = {
      text: text.replace(/\s+/g, ' ').trim(),
      x: row[0].x,
      xEnd: Math.max(...row.map((r) => r.x + r.width)),
      y: row[0].y,
      fontSize,
    };
    if (bigGaps >= 2) line.cells = cells.filter(Boolean);
    return line;
  });
}

/**
 * 페이지의 텍스트 항목을 읽기 순서로 정렬한다.
 * 판정 기준(코드에 명시):
 *  - 페이지 중앙선을 기준으로 왼쪽에만 있는 항목, 오른쪽에만 있는 항목, 걸친 항목으로 나눈다.
 *  - 왼쪽·오른쪽 항목이 각각 전체의 25% 이상이고, 걸친 항목이 15% 미만이며,
 *    같은 높이에 왼쪽·오른쪽 항목이 함께 있는 줄이 3줄 이상이고 그 사이 간격(가운데 여백)의
 *    중앙값이 글자 크기의 1.2배 이상이면 두 단으로 본다.
 *    (단어마다 항목이 나뉜 한 단 문서는 가운데 간격이 띄어쓰기 정도라 두 단으로 오인하지 않는다.)
 *  - 두 단이면: 첫 단 내용보다 위에 있는 걸친 항목(제목) → 왼쪽 단 → 오른쪽 단 → 나머지 걸친 항목.
 */
export function layoutPage(items: PositionedText[], pageWidth: number): LayoutResult {
  const usable = items.filter((i) => i.str.trim().length > 0);
  if (!usable.length) return { lines: [], twoColumn: false };
  const mid = pageWidth / 2;
  const tol = pageWidth * 0.02;
  const left: PositionedText[] = [];
  const right: PositionedText[] = [];
  const span: PositionedText[] = [];
  for (const it of usable) {
    const end = it.x + it.width;
    if (end <= mid + tol) left.push(it);
    else if (it.x >= mid - tol) right.push(it);
    else span.push(it);
  }
  const n = usable.length;
  let twoColumn = left.length / n >= 0.25 && right.length / n >= 0.25 && span.length / n < 0.15;
  if (twoColumn) {
    const gaps: number[] = [];
    const sizes: number[] = [];
    for (const l of left) {
      const tolY = l.fontSize * 0.5;
      const lEnd = Math.max(...left.filter((o) => Math.abs(o.y - l.y) <= tolY).map((o) => o.x + o.width));
      const rs = right.filter((r) => Math.abs(r.y - l.y) <= tolY);
      if (!rs.length || l.x + l.width < lEnd) continue; // 줄마다 가장 오른쪽 왼쪽-항목 하나만 계산
      gaps.push(Math.min(...rs.map((r) => r.x)) - lEnd);
      sizes.push(l.fontSize);
    }
    twoColumn = gaps.length >= 3 && median(gaps) >= median(sizes) * 1.2;
  }
  if (!twoColumn) return { lines: groupIntoLines(usable), twoColumn: false };

  const leftLines = groupIntoLines(left);
  const rightLines = groupIntoLines(right);
  const spanLines = groupIntoLines(span);
  const columnTop = Math.max(leftLines[0]?.y ?? -Infinity, rightLines[0]?.y ?? -Infinity);
  const above = spanLines.filter((l) => l.y > columnTop);
  const below = spanLines.filter((l) => l.y <= columnTop);
  return { lines: [...above, ...leftLines, ...rightLines, ...below], twoColumn: true };
}

/** 페이지 위·아래 여백에 반복되는 머리글·바닥글·쪽번호 줄을 찾는다. */
export function findRepeatedMarginLines(pages: TextLine[][]): Set<string> {
  if (pages.length < 3) return new Set();
  const counts = new Map<string, number>();
  for (const lines of pages) {
    const seen = new Set<string>();
    const candidates = [...lines.slice(0, 2), ...lines.slice(-2)];
    for (const l of candidates) {
      const key = l.text.replace(/\d+/g, '#').trim();
      if (!key || key.length > 80 || seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const out = new Set<string>();
  for (const [k, c] of counts) if (c >= Math.max(3, pages.length * 0.6)) out.add(k);
  // 숫자만 있는 쪽번호 줄
  out.add('#');
  out.add('- # -');
  out.add('# / #');
  return out;
}
