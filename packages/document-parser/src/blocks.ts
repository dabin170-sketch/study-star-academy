/**
 * 줄 목록 → 제목·문단·목록·표 블록과 목차.
 */
import type { PageLines, ParsedChunk, ParsedDocument, ParsedOutlineItem, TextLine } from './types';

const SENTENCE_END = /(다|요|함|음|임|됨|니다|[.?!。])["')\]]?$/;

/** 제목 번호 패턴 → 제목 수준 */
export function headingLevelFromNumbering(text: string): number | null {
  const t = text.trim();
  if (/^제\s*\d+\s*(편|부)\b/.test(t)) return 1;
  if (/^제\s*\d+\s*장/.test(t)) return 1;
  if (/^(Chapter|CHAPTER|Part|PART)\s+\d+/.test(t)) return 1;
  if (/^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+[.\s]/.test(t) || /^(I|II|III|IV|V|VI|VII|VIII|IX|X)\.\s/.test(t)) return 1;
  if (/^제\s*\d+\s*절/.test(t)) return 2;
  if (/^\d+\.\d+\.\d+\.?\s/.test(t)) return 4;
  if (/^\d+\.\d+\.?\s/.test(t)) return 3;
  if (/^\d+\.\s/.test(t)) return 2;
  return null;
}

/** 목록 항목 패턴 */
export function isListItem(text: string): boolean {
  return /^(\d+\)|\(\d+\)|[①-⑳]|[가-하]\.|[가-하]\)|\([가-하]\)|[-•·▪◦○●■□▶▷◆◇※✓]\s?)/.test(text.trim());
}

const median = (nums: number[]) => {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** 조사·어미로 흔히 끝나는 음절 — 이 음절로 줄이 끝나면 낱말 경계로 본다. */
const WORD_END = /[은는이가을를의에로와과도만고며서다면니요한된할될인적및등께나야지게던든라여]$/;

/**
 * 줄 잇기.
 * - 영어 하이픈 줄바꿈은 붙인다.
 * - 한글로 끝나고 한글로 시작하는데 앞 줄이 단의 오른쪽 끝까지 꽉 찼다면(글자 단위 줄바꿈),
 *   낱말 중간에서 끊긴 것으로 보고 띄어쓰기 없이 붙인다(예: "가르 / 치는" → "가르치는").
 *   앞 줄이 끝보다 한 글자 이상 짧게 끝났거나 조사·어미 음절로 끝났다면 낱말 경계로 보고 띄어 쓴다.
 *   (완벽하게 구분할 수는 없으므로, 개념 추출 쪽에서도 서술어 안의 띄어쓰기 오류를 허용한다.)
 */
export function joinLines(a: string, b: string, prev?: TextLine, rightEdge = 0): string {
  if (!a) return b;
  if (/[A-Za-z]-$/.test(a) && /^[a-z]/.test(b)) return a.slice(0, -1) + b;
  if (prev && rightEdge > 0 && prev.xEnd > 0 && /[가-힣]$/.test(a) && /^[가-힣]/.test(b) && prev.xEnd >= rightEdge - prev.fontSize * 1.1 && !WORD_END.test(a)) return a + b;
  return `${a} ${b}`;
}

interface BuildOptions {
  title: string;
  pageLabel: ParsedDocument['pageLabel'];
  /** 머리글·바닥글처럼 지울 줄(숫자는 #로 바꾼 키) */
  removeKeys?: Set<string>;
  warnings?: string[];
  /** 이 글자 수보다 적으면 텍스트가 거의 없는 페이지로 표시 */
  lowTextThreshold?: number;
}

export function buildDocument(pages: PageLines[], opts: BuildOptions): ParsedDocument {
  const warnings = [...(opts.warnings ?? [])];
  const allSizes = pages.flatMap((p) => p.lines.map((l) => l.fontSize)).filter((s) => s > 0);
  const bodySize = median(allSizes) || 10;
  // 본문보다 큰 글자 크기들을 내림차순으로 정렬해 제목 수준을 정한다.
  const bigSizes = [...new Set(allSizes.filter((s) => s >= bodySize * 1.18).map((s) => Math.round(s)))].sort(
    (a, b) => b - a,
  );
  const sizeLevel = (s: number) => {
    const idx = bigSizes.indexOf(Math.round(s));
    return idx < 0 ? null : Math.min(idx + 1, 4);
  };

  const chunks: ParsedChunk[] = [];
  const outline: ParsedOutlineItem[] = [];
  const headingStack: { level: number; title: string }[] = [];
  const resultPages = [];
  const lowThreshold = opts.lowTextThreshold ?? 25;

  const pushChunk = (c: Omit<ParsedChunk, 'index' | 'headingPath'>) => {
    const text = c.kind === 'table' ? c.text.replace(/[ \t]+/g, ' ').trim() : c.text.replace(/\s+/g, ' ').trim();
    if (!text) return;
    const chunk: ParsedChunk = { ...c, text, index: chunks.length, headingPath: headingStack.map((h) => h.title) };
    if (c.kind === 'heading' && c.headingLevel) {
      while (headingStack.length && headingStack[headingStack.length - 1].level >= c.headingLevel) headingStack.pop();
      chunk.headingPath = headingStack.map((h) => h.title);
      headingStack.push({ level: c.headingLevel, title: text });
      outline.push({ level: c.headingLevel, title: text, pageNumber: c.pageNumber, chunkIndex: chunk.index });
    }
    chunks.push(chunk);
  };

  for (const page of pages) {
    // 힌트는 원래 줄 번호 기준이므로 번호를 보존한 채로 거른다.
    const kept = page.lines
      .map((line, origIndex) => ({ line, origIndex }))
      .filter(({ line }) => {
        const key = line.text.replace(/\d+/g, '#').trim();
        return line.text.trim() && !(opts.removeKeys?.has(key) ?? false);
      });
    const lines = kept.map((k) => k.line);
    const pageText = lines.map((l) => l.text).join('\n');
    const lowText = pageText.replace(/\s/g, '').length < lowThreshold;
    resultPages.push({ pageNumber: page.pageNumber, text: pageText, lowText });

    // 같은 단(시작 x가 비슷한 줄들)의 오른쪽 끝 — 글자 단위 줄바꿈 판정에 사용
    const edgeOf = (line: TextLine) => {
      let edge = 0;
      for (const l of lines) if (Math.abs(l.x - line.x) < line.fontSize * 3 && l.xEnd > edge) edge = l.xEnd;
      return edge;
    };
    let para = '';
    let paraKind: 'paragraph' | 'list' = 'paragraph';
    let tableRows: string[] = [];
    let prev: TextLine | null = null;

    const flushPara = () => {
      if (para) pushChunk({ pageNumber: page.pageNumber, kind: paraKind, text: para });
      para = '';
      paraKind = 'paragraph';
    };
    const flushTable = () => {
      if (tableRows.length) pushChunk({ pageNumber: page.pageNumber, kind: 'table', text: tableRows.join('\n') });
      tableRows = [];
    };

    lines.forEach((line, i) => {
      const hint = page.hints?.get(kept[i].origIndex);
      const text = line.text.trim();
      if (hint?.table || (line.cells && line.cells.length >= 3)) {
        flushPara();
        tableRows.push((line.cells ?? [text]).join(' | '));
        prev = line;
        return;
      }
      flushTable();

      let headingLevel: number | null = hint?.heading ?? null;
      if (headingLevel === null && !hint?.list) {
        const short = text.length <= 60 && !SENTENCE_END.test(text);
        const bySize = line.fontSize >= bodySize * 1.18 ? sizeLevel(line.fontSize) : null;
        const byNumber = text.length <= 40 && !SENTENCE_END.test(text) ? headingLevelFromNumbering(text) : null;
        if (bySize && short) headingLevel = bySize;
        else if (byNumber) headingLevel = byNumber;
        else if (/^#{1,6}\s/.test(text)) headingLevel = Math.min(text.match(/^#+/)![0].length, 4);
      }
      if (headingLevel) {
        flushPara();
        pushChunk({
          pageNumber: page.pageNumber,
          kind: 'heading',
          headingLevel,
          text: text.replace(/^#{1,6}\s+/, ''),
        });
        prev = line;
        return;
      }

      const list = hint?.list || isListItem(text);
      const bigGap =
        prev !== null && prev.y !== 0 && line.y !== 0 && Math.abs(prev.y - line.y) > Math.max(prev.fontSize, line.fontSize) * 1.9;
      if (list || bigGap || (para && SENTENCE_END.test(para) && prev && prev.xEnd < (line.xEnd ?? 0) * 0.75)) {
        flushPara();
      }
      if (list) paraKind = 'list';
      para = joinLines(para, text, prev ?? undefined, prev ? edgeOf(prev) : 0);
      prev = line;
    });
    flushPara();
    flushTable();
  }

  const lowPages = resultPages.filter((p) => p.lowText).length;
  if (resultPages.length && lowPages / resultPages.length >= 0.5) {
    warnings.push(
      `전체 ${resultPages.length}${opts.pageLabel} 중 ${lowPages}${opts.pageLabel}에서 글자를 거의 찾지 못했습니다. 스캔본이나 이미지로 된 자료일 수 있습니다. 이 부분은 자동으로 개념을 확정하지 않으며, 원문을 보며 직접 개념을 추가해 주세요.`,
    );
  } else if (lowPages > 0) {
    warnings.push(`${lowPages}${opts.pageLabel}는 글자가 거의 없어 그림·스캔 페이지일 수 있습니다.`);
  }

  return { title: opts.title, pageLabel: opts.pageLabel, pages: resultPages, chunks, outline, warnings };
}

/** 줄 텍스트 배열을 TextLine으로(글자 크기 정보가 없는 형식용) */
export function plainLines(texts: string[]): TextLine[] {
  return texts.map((t) => ({ text: t, x: 0, xEnd: 0, y: 0, fontSize: 10 }));
}
