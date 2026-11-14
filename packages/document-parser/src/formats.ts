/**
 * 형식별 파서. 압축 해제(JSZip)와 PDF.js 호출은 브라우저 쪽에서 하고,
 * 여기서는 순수 텍스트/XML만 다루므로 Node 테스트에서도 그대로 실행된다.
 */
import { buildDocument } from './blocks';
import { findRepeatedMarginLines, layoutPage } from './pdf-layout';
import type { PageLines, ParsedDocument, PositionedText, TextLine } from './types';

/* ---------------- 일반 텍스트 / 마크다운 ---------------- */

const LINES_PER_SECTION = 45;

/** 빈 줄은 문단 경계로 쓰기 위해 y 간격을 크게 준다(blocks.ts의 bigGap 규칙). */
function linesWithGaps(rawLines: string[]): TextLine[] {
  const out: TextLine[] = [];
  let y = 100000;
  let pendingGap = false;
  for (const raw of rawLines) {
    const text = raw.replace(/\t/g, ' ').trimEnd();
    if (!text.trim()) {
      pendingGap = true;
      continue;
    }
    y -= pendingGap ? 42 : 12;
    pendingGap = false;
    out.push({ text: text.trim(), x: 0, xEnd: 0, y, fontSize: 10 });
  }
  return out;
}

function sectionize(rawLines: string[], isBoundary: (line: string) => boolean): string[][] {
  const sections: string[][] = [[]];
  for (const line of rawLines) {
    const cur = sections[sections.length - 1];
    if (line.includes('\f') || (cur.length >= LINES_PER_SECTION && isBoundary(line))) {
      sections.push([line.replace(/\f/g, '')]);
    } else cur.push(line);
  }
  return sections.filter((s) => s.some((l) => l.trim()));
}

export function parsePlainText(text: string, title: string): ParsedDocument {
  const raw = text.replace(/\r\n?/g, '\n').split('\n');
  const sections = sectionize(raw, (l) => !l.trim());
  const pages: PageLines[] = sections.map((s, i) => ({ pageNumber: i + 1, lines: linesWithGaps(s) }));
  return buildDocument(pages, {
    title,
    pageLabel: '구간',
    lowTextThreshold: 0,
    warnings: sections.length > 1 ? ['텍스트 파일에는 쪽 번호가 없어 약 45줄 단위의 구간 번호로 출처를 표시합니다.'] : [],
  });
}

export function parseMarkdown(text: string, title: string): ParsedDocument {
  const raw = text.replace(/\r\n?/g, '\n').split('\n');
  // 코드 블록 안의 # 은 제목으로 보지 않는다.
  let inCode = false;
  const cleaned = raw.map((l) => {
    if (/^```/.test(l.trim())) {
      inCode = !inCode;
      return '';
    }
    if (inCode) return l.startsWith('#') ? ` ${l}` : l;
    // 강조 기호 제거(원문 의미는 유지)
    return l.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/`([^`]+)`/g, '$1');
  });
  const sections = sectionize(cleaned, (l) => /^#{1,2}\s/.test(l));
  const pages: PageLines[] = sections.map((s, i) => {
    const lines = linesWithGaps(s);
    const hints = new Map<number, { heading?: number; list?: boolean; table?: boolean }>();
    lines.forEach((l, idx) => {
      const h = l.text.match(/^(#{1,6})\s+/);
      if (h) {
        hints.set(idx, { heading: Math.min(h[1].length, 4) });
        l.text = l.text.replace(/^#{1,6}\s+/, '');
      } else if (/^\|.*\|$/.test(l.text)) {
        if (/^\|[\s:|-]+\|$/.test(l.text)) l.text = '';
        else {
          hints.set(idx, { table: true });
          l.cells = l.text.slice(1, -1).split('|').map((c) => c.trim());
        }
      } else if (/^([-*+]|\d+\.)\s+/.test(l.text)) {
        hints.set(idx, { list: true });
        l.text = l.text.replace(/^[-*+]\s+/, '• ');
      }
    });
    return { pageNumber: i + 1, lines, hints };
  });
  return buildDocument(pages, {
    title,
    pageLabel: '구간',
    lowTextThreshold: 0,
    warnings: sections.length > 1 ? ['마크다운 파일은 제목 단위의 구간 번호로 출처를 표시합니다.'] : [],
  });
}

/* ---------------- XML 도우미 ---------------- */

export function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&');
}

function textRuns(xml: string, tag: 'a:t' | 'w:t'): string {
  const re = tag === 'a:t' ? /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br\s*\/>/g : /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>/g;
  let out = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out += m[1] !== undefined ? decodeXml(m[1]) : tag === 'a:t' ? '\n' : ' ';
  return out;
}

/* ---------------- PPTX ---------------- */

export interface SlideText {
  title: string;
  body: { text: string; level: number }[];
  notes: string[];
}

function slideOrder(files: Record<string, string>): string[] {
  const slidePaths = Object.keys(files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p));
  const numeric = slidePaths.sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
  const pres = files['ppt/presentation.xml'];
  const rels = files['ppt/_rels/presentation.xml.rels'];
  if (!pres || !rels) return numeric;
  const relMap = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/Id="([^"]+)"/)?.[1];
    const target = m[0].match(/Target="([^"]+)"/)?.[1];
    if (id && target) relMap.set(id, `ppt/${target.replace(/^\.?\//, '').replace(/^\/?ppt\//, '')}`);
  }
  const ordered: string[] = [];
  for (const m of pres.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g)) {
    const path = relMap.get(m[1]);
    if (path && files[path]) ordered.push(path);
  }
  return ordered.length ? ordered : numeric;
}

export function extractSlide(xml: string): Omit<SlideText, 'notes'> {
  let title = '';
  const body: { text: string; level: number }[] = [];
  for (const sp of xml.match(/<p:sp>[\s\S]*?<\/p:sp>|<p:sp\s[\s\S]*?<\/p:sp>/g) ?? []) {
    const ph = sp.match(/<p:ph\b([^>]*)\/?>/)?.[1] ?? '';
    const type = ph.match(/type="([^"]+)"/)?.[1];
    if (type === 'sldNum' || type === 'dt' || type === 'ftr') continue;
    const paras = (sp.match(/<a:p>[\s\S]*?<\/a:p>|<a:p\s[\s\S]*?<\/a:p>/g) ?? [])
      .map((p) => ({
        text: textRuns(p, 'a:t').replace(/\s+/g, ' ').trim(),
        level: Number(p.match(/<a:pPr\b[^>]*lvl="(\d)"/)?.[1] ?? 0),
      }))
      .filter((p) => p.text);
    if (!paras.length) continue;
    if ((type === 'title' || type === 'ctrTitle') && !title) title = paras.map((p) => p.text).join(' ');
    else body.push(...paras);
  }
  // 표(graphicFrame) 텍스트
  for (const tbl of xml.match(/<a:tbl>[\s\S]*?<\/a:tbl>/g) ?? []) {
    for (const tr of tbl.match(/<a:tr\b[\s\S]*?<\/a:tr>/g) ?? []) {
      const cells = (tr.match(/<a:tc\b[\s\S]*?<\/a:tc>/g) ?? []).map((tc) => textRuns(tc, 'a:t').replace(/\s+/g, ' ').trim());
      if (cells.some(Boolean)) body.push({ text: `\u0000TABLE${cells.join('\u0001')}`, level: 0 });
    }
  }
  return { title, body };
}

export function extractNotes(xml: string): string[] {
  const out: string[] = [];
  for (const sp of xml.match(/<p:sp>[\s\S]*?<\/p:sp>|<p:sp\s[\s\S]*?<\/p:sp>/g) ?? []) {
    const type = sp.match(/<p:ph\b[^>]*type="([^"]+)"/)?.[1];
    if (type && type !== 'body') continue;
    for (const p of sp.match(/<a:p>[\s\S]*?<\/a:p>|<a:p\s[\s\S]*?<\/a:p>/g) ?? []) {
      const t = textRuns(p, 'a:t').replace(/\s+/g, ' ').trim();
      if (t) out.push(t);
    }
  }
  return out;
}

/** files: zip 안의 경로 → XML 문자열 */
export function parsePptx(files: Record<string, string>, title: string): ParsedDocument {
  const order = slideOrder(files);
  const warnings = ['PPTX는 슬라이드의 글자·발표자 노트·구조만 추출합니다. 원본 레이아웃과 그림은 재현하지 않습니다.'];
  const pages: PageLines[] = order.map((path, i) => {
    const slide = extractSlide(files[path]);
    const relPath = path.replace('slides/', 'slides/_rels/') + '.rels';
    const notesTarget = files[relPath]?.match(/Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/)?.[1];
    const notes = notesTarget && files[`ppt/notesSlides/${notesTarget}`] ? extractNotes(files[`ppt/notesSlides/${notesTarget}`]) : [];
    const lines: TextLine[] = [];
    const hints = new Map<number, { heading?: number; list?: boolean; table?: boolean }>();
    let y = 100000;
    const add = (text: string, hint?: { heading?: number; list?: boolean; table?: boolean }, cells?: string[]) => {
      y -= hint?.heading ? 40 : 12;
      if (hint) hints.set(lines.length, hint);
      lines.push({ text, x: 0, xEnd: 0, y, fontSize: 10, cells });
    };
    add(slide.title || `슬라이드 ${i + 1}`, { heading: 2 });
    for (const b of slide.body) {
      if (b.text.startsWith('\u0000TABLE')) {
        const cells = b.text.slice(6).split('\u0001');
        add(cells.join(' | '), { table: true }, cells);
      } else add(b.level > 0 ? `• ${b.text}` : b.text, b.level > 0 ? { list: true } : undefined);
    }
    if (notes.length) {
      y -= 30;
      add('발표자 노트', { heading: 3 });
      notes.forEach((n) => add(n));
    }
    return { pageNumber: i + 1, lines, hints };
  });
  if (!pages.length) warnings.push('슬라이드를 찾지 못했습니다. 올바른 PPTX 파일인지 확인해 주세요.');
  return buildDocument(pages, { title, pageLabel: '슬라이드', warnings, lowTextThreshold: 8 });
}

/* ---------------- DOCX ---------------- */

const DOCX_PARAS_PER_SECTION = 30;

function docxHeadingStyles(stylesXml: string | undefined): Map<string, number> {
  const map = new Map<string, number>();
  if (!stylesXml) return map;
  for (const m of stylesXml.matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g)) {
    const name = m[2].match(/<w:name\s+w:val="([^"]+)"/)?.[1]?.toLowerCase() ?? '';
    const lvl = name.match(/^(heading|제목)\s*(\d)/)?.[2];
    if (lvl) map.set(m[1], Math.min(Number(lvl), 4));
    else if (name === 'title') map.set(m[1], 1);
  }
  return map;
}

export function parseDocx(files: Record<string, string>, title: string): ParsedDocument {
  const doc = files['word/document.xml'];
  const warnings = ['DOCX는 텍스트 중심으로 추출하며, 실제 쪽 번호 대신 쪽 나누기와 약 30문단 단위의 구간 번호를 사용합니다.'];
  if (!doc) {
    warnings.push('문서 본문(word/document.xml)을 찾지 못했습니다.');
    return buildDocument([], { title, pageLabel: '구간', warnings });
  }
  const styles = docxHeadingStyles(files['word/styles.xml']);
  const body = doc.match(/<w:body>([\s\S]*)<\/w:body>/)?.[1] ?? doc;
  const pages: PageLines[] = [];
  let cur: PageLines = { pageNumber: 1, lines: [], hints: new Map() };
  let paraCount = 0;
  let y = 100000;
  const newPage = () => {
    if (cur.lines.length) pages.push(cur);
    cur = { pageNumber: pages.length + 1, lines: [], hints: new Map() };
    paraCount = 0;
  };
  for (const m of body.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g)) {
    const block = m[0];
    if (block.startsWith('<w:tbl>')) {
      for (const tr of block.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) ?? []) {
        const cells = (tr.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) ?? []).map((tc) => textRuns(tc, 'w:t').replace(/\s+/g, ' ').trim());
        if (!cells.some(Boolean)) continue;
        y -= 12;
        cur.hints!.set(cur.lines.length, { table: true });
        cur.lines.push({ text: cells.join(' | '), cells, x: 0, xEnd: 0, y, fontSize: 10 });
      }
      paraCount++;
      continue;
    }
    if (/<w:br\b[^>]*w:type="page"/.test(block) || (paraCount >= DOCX_PARAS_PER_SECTION && /<w:pStyle\b[^>]*w:val="[^"]+"/.test(block) && styles.has(block.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/)![1]))) {
      newPage();
    }
    const text = textRuns(block, 'w:t').replace(/\s+/g, ' ').trim();
    if (!text) {
      y -= 30; // 빈 문단 = 문단 경계
      continue;
    }
    const styleId = block.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/)?.[1];
    const heading = styleId ? styles.get(styleId) : undefined;
    const list = /<w:numPr\b/.test(block);
    y -= 42; // DOCX 문단은 각각 독립된 문단
    if (heading) cur.hints!.set(cur.lines.length, { heading });
    else if (list) cur.hints!.set(cur.lines.length, { list: true });
    cur.lines.push({ text: list && !heading ? `• ${text}` : text, x: 0, xEnd: 0, y, fontSize: 10 });
    paraCount++;
    if (paraCount >= DOCX_PARAS_PER_SECTION * 1.5) newPage();
  }
  newPage();
  return buildDocument(pages, { title, pageLabel: '구간', warnings, lowTextThreshold: 0 });
}

/* ---------------- PDF ---------------- */

export interface PdfPageInput {
  pageNumber: number;
  width: number;
  items: PositionedText[];
}

export function parsePdfPages(input: PdfPageInput[], title: string): ParsedDocument {
  const warnings: string[] = [];
  const twoColumnPages: number[] = [];
  const laidOut = input.map((p) => {
    const r = layoutPage(p.items, p.width);
    if (r.twoColumn) twoColumnPages.push(p.pageNumber);
    return { pageNumber: p.pageNumber, lines: r.lines };
  });
  if (twoColumnPages.length) {
    const list = twoColumnPages.length > 8 ? `${twoColumnPages.slice(0, 8).join(', ')}쪽 등 ${twoColumnPages.length}개 쪽` : `${twoColumnPages.join(', ')}쪽`;
    warnings.push(`${list}을 두 단 구성으로 판단해 왼쪽 단 → 오른쪽 단 순서로 읽었습니다. 원문 보기에서 순서를 확인해 주세요.`);
  }
  const removeKeys = findRepeatedMarginLines(laidOut.map((p) => p.lines));
  return buildDocument(laidOut, { title, pageLabel: '쪽', removeKeys, warnings });
}
