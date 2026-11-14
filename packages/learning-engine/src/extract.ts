/**
 * 근거 기반 개념 추출기.
 *
 * 원칙
 *  1. 원문 문단(chunk)에 실제로 있는 문장만 개념의 근거(statement)로 쓴다. 새 문장을 만들지 않는다.
 *  2. 모든 개념은 하나 이상의 근거(chunkIndex + start + quote)를 가진다.
 *     quote는 항상 chunk.text.slice(start, start + quote.length)와 정확히 같다(테스트로 보장).
 *  3. 패턴이 약하거나 판독이 불확실한 페이지에서 나온 개념은 'needs-check'로 둔다.
 */
import type { ConceptKind, ConceptStatus } from '@academy/shared';
import { compact, escapeRegExp, normalizeSpaces, splitSentences } from './text';

export interface ChunkInput {
  index: number;
  pageNumber: number;
  kind: 'heading' | 'paragraph' | 'list' | 'table';
  headingLevel?: number;
  text: string;
  headingPath: string[];
  /** 텍스트가 거의 없는(스캔 가능) 페이지 */
  lowText?: boolean;
}

export interface EvidenceDraft {
  chunkIndex: number;
  pageNumber: number;
  start: number;
  quote: string;
}

export interface ConceptDraft {
  term: string;
  aliases: string[];
  kind: ConceptKind;
  /** 원문 근거 문장(여러 근거로 된 절차는 근거 quote들을 줄바꿈으로 이은 것) */
  statement: string;
  evidence: EvidenceDraft[];
  section: string;
  pageNumber: number;
  confidence: number;
  status: ConceptStatus;
  importance: 1 | 2 | 3;
  /** 어떤 규칙으로 찾았는지(사용자에게 보여줌) */
  rule: string;
}

const DEMONSTRATIVE = /^(이|그|저|이러한|그러한|이런|그런|이것|그것|이는|여기|우리|본|해당|다음|위|아래|앞|뒤|또한|특히|즉|따라서|하지만|그러나|예를\s*들어|예컨대|첫째|둘째|셋째|이와|이때|최근|오늘날)(\s|$)/;
// 의존명사로 끝나는 구('할 수', '그럴 때')와 동사형('강화하')은 용어가 아니다. '교수', '관점', '평등'처럼 붙어 있는 낱말은 허용.
const BAD_TERM = /\s(것|때|경우|점|바|데|수|등)$|^(것|때|경우|수|점|등)$|[^\s]{2,}(하|되|했|됐)$|(있|없)$|[.?!]/;

const DEF_VERB = '(?:말한다|말함|의미한다|의미함|뜻한다|뜻함|가리킨다|일컫는다|지칭한다|정의된다|정의한다|정의할\\s*수\\s*있다|이라고\\s*한다|라고\\s*한다|이라\\s*한다|라\\s*한다|이라고\\s*부른다|라고\\s*부른다)';
const NOUN_PREDICATE =
  '(?:것|현상|과정|방법|기법|전략|이론|교육|원리|원칙|법칙|능력|상태|행동|절차|활동|체계|제도|계획|프로그램|모형|모델|단계|개념|접근|접근법|장애|기능|특성|요인|도구|검사|평가|서비스|지원|중재|목표|문서|권리|의무|기준|형태|유형|조건|자극|반응|결과|기술|학습|관계|구조|영역|방식|시스템|태도|과제|환경)';

/** 용어 정리: 앞의 번호·기호, 따옴표 제거, 괄호 안 영문은 별칭으로 */
export function cleanTerm(raw: string): { term: string; aliases: string[] } | null {
  let t = normalizeSpaces(raw)
    .replace(/^(\d+(\.\d+)*[.)]?|\(\d+\)|[①-⑳]|[가-하][.)]|[-•·▪◦○●■□▶▷◆◇※✓])\s*/, '')
    .replace(/^["'“”‘’「『《〈]+|["'“”‘’」』》〉]+$/g, '')
    .trim();
  const aliases: string[] = [];
  const paren = t.match(/^(.+?)\s*[(（]([^)）]{1,60})[)）]\s*$/);
  if (paren) {
    t = paren[1].trim();
    for (const part of paren[2].split(/[,:;]|\s*,\s*/)) {
      const a = part.trim();
      if (a && a.length <= 50) aliases.push(a);
    }
  }
  t = t.replace(/["'“”‘’「」『』]/g, '').trim();
  if (t.length > 25 || t.length < 1 || (t.length === 1 && !/[가-힣]/.test(t))) return null;
  if (t.split(/\s+/).length > 5) return null;
  if (DEMONSTRATIVE.test(t) || BAD_TERM.test(t)) return null;
  if (/^[\d\s.]+$/.test(t)) return null;
  return { term: t, aliases };
}

interface Match {
  term: string;
  kind: ConceptKind;
  confidence: number;
  rule: string;
}

function kindForTerm(term: string, fallback: ConceptKind): ConceptKind {
  if (/(원리|원칙|법칙)$/.test(term)) return 'principle';
  if (/(이론|모형|모델|가설)$/.test(term)) return 'person-theory';
  if (/(절차|단계|과정|순서)$/.test(term)) return 'procedure';
  return fallback;
}

const hasBatchim = (ch: string) => {
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code < 11172 && code % 28 !== 0;
};

/** "벌이" → "벌"(받침 뒤 조사 '이'), "놀이" → "놀이". 괄호로 끝나면 괄호 앞 글자로 판단한다. */
export function splitIParticle(raw: string): string {
  if (!raw.endsWith('이') || raw.length < 2) return raw;
  const base = raw.slice(0, -1);
  const probe = base.replace(/\s*[(（][^)）]*[)）]\s*$/, '');
  const last = probe[probe.length - 1] ?? '';
  return hasBatchim(last) || /[A-Za-z0-9)）]$/.test(base) ? base : raw;
}

/** 한 문장에 대해 정의·분류·비교 패턴을 시험한다. 일치하면 용어 원문 문자열을 돌려준다. */
export function matchSentence(sentence: string): Match | null {
  // PDF 줄바꿈 때문에 서술어 안에 생긴 띄어쓰기(예: "의 미한다", "말 한다")를 판정할 때만 붙여서 본다.
  // (근거 문장 자체는 원문 그대로 저장한다.)
  const s = sentence.trim().replace(/\s+(?=[가-힣]{0,2}(?:한다|된다|함|이다|부른다)[.。]?$)/, '');
  let m: RegExpMatchArray | null;

  // 1) "X(이)란 ~" / "X(이)라 함은 ~" — 받침 유무로 '이'가 조사인지 용어의 일부인지 가린다(벌이란 → 벌, 놀이란 → 놀이)
  if ((m = s.match(/^(.{1,60}?)란\s+.{4,}/)) || (m = s.match(/^(.{1,60}?)라\s*함은\s+.{4,}/))) {
    const term = splitIParticle(m[1]);
    return { term, kind: kindForTerm(term, 'definition'), confidence: 0.92, rule: '“~(이)란” 정의 문장' };
  }
  // 3) "~을 X(이)라고 한다" (용어가 뒤에 오는 형태)
  if ((m = s.match(/^.{4,}(?:을|를)\s+["'“‘「]?([^"'”’」\s][^"'”’」]{0,30}?)["'”’」]?(?:이)?라고\s*(?:한다|부른다|정의한다)[.。]?$/))) {
    return { term: m[1], kind: kindForTerm(m[1], 'definition'), confidence: 0.85, rule: '“~을 X라고 한다” 정의 문장' };
  }
  // 2) "X은/는 ~ 말한다/의미한다/정의된다/~라고 한다"
  if ((m = s.match(new RegExp(`^(.{2,40}?)(?:은|는|이라\\s*함은)\\s+.{3,}${DEF_VERB}[.。]?$`)))) {
    return { term: m[1], kind: kindForTerm(m[1], 'definition'), confidence: 0.9, rule: '“~을 말한다/의미한다” 정의 문장' };
  }
  // 4) 분류: "X의 유형/종류에는 A, B, C가 있다"
  if ((m = s.match(/^(.{2,30}?)(?:의|에는|은|는)\s*(?:주요\s*)?(?:유형|종류|분류|하위\s*유형|구성\s*요소|요소|하위\s*영역|영역|단계)(?:에는|은|는|으로는|로는)?\s+.{2,}(?:있다|있음|나뉜다|구분된다|분류된다|나눌\s*수\s*있다|구분할\s*수\s*있다)[.。]?$/))) {
    return { term: m[1], kind: 'classification', confidence: 0.82, rule: '“~의 유형에는 ~이 있다” 분류 문장' };
  }
  // 5) "X은/는 ~하는 [명사]이다" (명사형 술어로 끝나는 정의)
  if ((m = s.match(new RegExp(`^(.{2,30}?)(?:은|는)\\s+.{4,}${NOUN_PREDICATE}(?:이다|다|임)[.。]?$`)))) {
    return { term: m[1], kind: kindForTerm(m[1], 'definition'), confidence: 0.68, rule: '“~은 ~하는 것이다” 정의 문장(확인 권장)' };
  }
  // 6) 비교: "A와 B의 차이는 ~" / "A는 B와 달리 ~"
  if ((m = s.match(/^(.{2,20}?)(?:와|과)\s+(.{2,20}?)의\s*(?:차이|공통점|차이점)/))) {
    return { term: `${m[1]}와(과) ${m[2]}`, kind: 'comparison', confidence: 0.6, rule: '“A와 B의 차이” 비교 문장' };
  }
  if ((m = s.match(/^(.{2,20}?)(?:은|는)\s+(.{2,20}?)(?:와|과)\s*(?:달리|다르게|비교하여|비교해)/))) {
    return { term: m[1], kind: 'comparison', confidence: 0.6, rule: '“A는 B와 달리” 비교 문장' };
  }
  // 7) 영어 정의
  if ((m = s.match(/^(.{2,40}?)\s+(?:is|are)\s+(?:defined\s+as|referred\s+to\s+as)\s+.{4,}/i)) || (m = s.match(/^(.{2,40}?)\s+refers?\s+to\s+.{4,}/i))) {
    return { term: m[1], kind: 'definition', confidence: 0.85, rule: '영문 정의 문장' };
  }
  return null;
}

/** "용어: 설명" / "용어 - 설명" 형식(용어집·슬라이드에서 흔함) */
function matchColonDefinition(text: string): { term: string; start: number; quote: string } | null {
  const m = text.match(/^((?:[-•·▪◦○●■□▶▷◆◇※✓]|\d+[.)]|[①-⑳])?\s*)([^:：\-–]{2,30}?)\s*[:：]\s*(.{6,})$/) ?? text.match(/^((?:[-•·▪◦○●■□▶▷◆◇※✓]|\d+[.)]|[①-⑳])?\s*)([^:：\-–]{2,25}?)\s+[-–]\s+(.{6,})$/);
  if (!m) return null;
  return { term: m[2], start: m[1].length, quote: text.slice(m[1].length) };
}

const stripNumbering = (t: string) =>
  normalizeSpaces(t.replace(/^(제\s*\d+\s*[장절편부]|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+[.\s]|\d+(\.\d+)*\.?|Chapter\s+\d+|Part\s+\d+)\s*/i, ''));

export interface ExtractOptions {
  /** 이 값 미만의 신뢰도는 'needs-check' */
  autoThreshold?: number;
}

export function extractConcepts(chunks: ChunkInput[], opts: ExtractOptions = {}): ConceptDraft[] {
  const threshold = opts.autoThreshold ?? 0.7;
  const drafts: ConceptDraft[] = [];
  const sectionOf = (c: ChunkInput) => c.headingPath[c.headingPath.length - 1] ?? '';

  const add = (term: string, kind: ConceptKind, confidence: number, rule: string, ev: EvidenceDraft[], chunk: ChunkInput, statement?: string) => {
    const cleaned = cleanTerm(term);
    if (!cleaned) return;
    const conf = chunk.lowText ? Math.min(confidence, 0.5) : confidence;
    drafts.push({
      term: cleaned.term,
      aliases: cleaned.aliases,
      kind,
      statement: statement ?? ev.map((e) => e.quote).join('\n'),
      evidence: ev,
      section: chunk.kind === 'heading' ? stripNumbering(chunk.text) : sectionOf(chunk),
      pageNumber: chunk.pageNumber,
      confidence: conf,
      status: conf >= threshold ? 'auto' : 'needs-check',
      importance: 1,
      rule,
    });
  };

  // 문장 단위 패턴
  for (const chunk of chunks) {
    if (chunk.kind === 'heading' || chunk.kind === 'table') continue;
    const colon = matchColonDefinition(chunk.text);
    if (colon) {
      add(colon.term, kindForTerm(colon.term, 'definition'), 0.74, '“용어: 설명” 형식', [{ chunkIndex: chunk.index, pageNumber: chunk.pageNumber, start: colon.start, quote: colon.quote }], chunk);
      continue;
    }
    const body = chunk.text.replace(/^((?:[-•·▪◦○●■□▶▷◆◇※✓]|\d+\)|\(\d+\)|[①-⑳]|[가-하][.)])\s*)/, '');
    const offset = chunk.text.length - body.length;
    for (const sent of splitSentences(body)) {
      const match = matchSentence(sent.text);
      if (!match) continue;
      add(match.term, match.kind, match.confidence, match.rule, [{ chunkIndex: chunk.index, pageNumber: chunk.pageNumber, start: offset + sent.start, quote: sent.text }], chunk);
    }
  }

  // 절차: 제목에 절차/단계/과정/순서가 있고 바로 뒤에 목록이 2개 이상
  chunks.forEach((chunk, i) => {
    if (chunk.kind !== 'heading' || !/(절차|단계|과정|순서|방법)/.test(chunk.text)) return;
    const items: ChunkInput[] = [];
    for (let j = i + 1; j < chunks.length && chunks[j].kind === 'list'; j++) items.push(chunks[j]);
    if (items.length < 2) return;
    add(
      stripNumbering(chunk.text),
      'procedure',
      0.75,
      '“~절차/단계” 제목 아래 목록',
      items.map((it) => ({ chunkIndex: it.index, pageNumber: it.pageNumber, start: 0, quote: it.text })),
      chunk,
    );
  });

  // 같은 용어 병합: 가장 신뢰도 높은 것을 대표로, 나머지는 추가 근거로
  const byTerm = new Map<string, ConceptDraft>();
  for (const d of drafts.sort((a, b) => b.confidence - a.confidence)) {
    const key = compact(d.term);
    const existing = byTerm.get(key);
    if (!existing) {
      byTerm.set(key, d);
      continue;
    }
    for (const e of d.evidence)
      if (!existing.evidence.some((x) => x.chunkIndex === e.chunkIndex && x.start === e.start)) existing.evidence.push(e);
    for (const a of d.aliases) if (!existing.aliases.includes(a)) existing.aliases.push(a);
  }

  // 제목만 있고 정의를 찾지 못한 핵심 용어 → 근거는 제목, 상태는 확인 필요
  for (const chunk of chunks) {
    if (chunk.kind !== 'heading' || (chunk.headingLevel ?? 1) < 2) continue;
    const title = stripNumbering(chunk.text);
    const cleaned = cleanTerm(title);
    if (!cleaned || byTerm.has(compact(cleaned.term))) continue;
    // 제목 안에 이미 찾은 용어가 들어 있으면(예: '행동의 기능평가' ⊃ '기능평가') 중복으로 보고 건너뛴다
    if ([...byTerm.values()].some((d) => d.term.length >= 2 && cleaned.term.includes(d.term))) continue;
    if (/(개요|서론|결론|정리|요약|목차|참고문헌|학습\s*목표|들어가며|마무리|토의|과제|질문|퀴즈|문제)/.test(cleaned.term)) continue;
    // 제목 바로 아래 첫 문장을 함께 근거로 붙인다(사용자가 정의인지 판단).
    const next = chunks.find((c) => c.index > chunk.index && c.kind === 'paragraph' && c.headingPath.includes(chunk.text));
    const ev: EvidenceDraft[] = [{ chunkIndex: chunk.index, pageNumber: chunk.pageNumber, start: 0, quote: chunk.text }];
    let statement = chunk.text;
    if (next) {
      const first = splitSentences(next.text)[0];
      if (first) {
        ev.push({ chunkIndex: next.index, pageNumber: next.pageNumber, start: first.start, quote: first.text });
        statement = first.text;
      }
    }
    byTerm.set(compact(cleaned.term), {
      term: cleaned.term,
      aliases: cleaned.aliases,
      kind: 'term',
      statement,
      evidence: ev,
      section: title,
      pageNumber: chunk.pageNumber,
      confidence: 0.4,
      status: 'needs-check',
      importance: 1,
      rule: '제목에 나온 용어(정의 문장 미확인)',
    });
  }

  // 중요도: 문서 전체 등장 횟수와 제목 등장 여부(규칙 명시)
  const fullText = chunks.map((c) => c.text).join('\n');
  const headingText = chunks.filter((c) => c.kind === 'heading').map((c) => c.text).join('\n');
  const result = [...byTerm.values()];
  for (const d of result) {
    const count = (fullText.match(new RegExp(escapeRegExp(d.term), 'g')) ?? []).length;
    const inHeading = headingText.includes(d.term);
    d.importance = inHeading || count >= 4 ? 3 : count >= 2 ? 2 : 1;
  }
  return result.sort((a, b) => a.evidence[0].chunkIndex - b.evidence[0].chunkIndex || a.evidence[0].start - b.evidence[0].start);
}

/** 근거가 원문과 정확히 일치하는지 검사(가져오기·수정 후 무결성 확인용) */
export function verifyEvidence(chunks: { index: number; text: string }[], ev: EvidenceDraft): boolean {
  const c = chunks.find((x) => x.index === ev.chunkIndex);
  return !!c && c.text.slice(ev.start, ev.start + ev.quote.length) === ev.quote;
}
