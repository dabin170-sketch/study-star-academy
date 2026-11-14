/**
 * 한국어 텍스트 처리 도우미(형태소 분석기 없이 동작하는 규칙 기반).
 * 키워드 비교는 "의미 이해"가 아니라 "단어 포함 여부"를 판단할 뿐이라는 점을
 * 화면에서도 항상 함께 안내한다.
 */

const PARTICLES = [
  '으로써', '으로서', '에서는', '에게서', '이라는', '이라고', '이라도', '에서도', '로부터', '으로는',
  '에서', '에게', '으로', '로서', '로써', '까지', '부터', '처럼', '보다', '이며', '이고', '이나', '이란',
  '하는', '하고', '하여', '해서', '되는', '되어', '된다', '한다', '이다', '하다', '적인', '적으로', '들은', '들이', '들을',
  '들의', '에는', '과의', '와의', '이라', '라는', '라고', '께서',
  '은', '는', '이', '가', '을', '를', '의', '에', '와', '과', '도', '만', '로', '며', '고', '나', '란', '들', '적',
];

const STOPWORDS = new Set([
  '것', '수', '등', '및', '또는', '그리고', '그러나', '하지만', '따라서', '즉', '때', '중', '위해', '대한', '통해', '대해',
  '있다', '없다', '있는', '없는', '한다', '된다', '이다', '같은', '다른', '모든', '각', '여러', '어떤', '이러한', '그러한',
  '이것', '그것', '이는', '그는', '경우', '정도', '말한다', '의미한다', '뜻한다', '가리킨다', '일컫는다', '있으며', '하며',
  '위한', '되며', '한', '할', '함', '하는', '되는', '것이다', '것을', '것은', '것이', '때문', '때문에', '가지', '매우',
  '뒤에', '뒤', '앞으', '앞으로', '따르', '따라', '인해', '인하여', '통하', '위하', '대하', '관하', '이후', '이전', '현재',
  '해당', '점차', '등의', '가장', '다시', '함께', '모두', '각각', '통한', '관한', '따른', '의한', '같이', '더욱', '보다',
  'the', 'a', 'an', 'of', 'to', 'and', 'or', 'is', 'are', 'in', 'on', 'for', 'as', 'by', 'with',
]);

export function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** 비교용 정규화: 공백·문장부호 제거, 소문자 */
export function compact(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s.,·・!?'"“”‘’「」『』()[\]{}<>《》〈〉:;\-–—_/\\|~`^*+=]/g, '');
}

export function stripParticle(token: string): string {
  if (/^[a-z0-9]+$/i.test(token)) return token.toLowerCase();
  for (const p of PARTICLES) {
    if (token.length - p.length >= 2 && token.endsWith(p)) return token.slice(0, -p.length);
  }
  return token;
}

export function tokenize(s: string): string[] {
  return s
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(stripParticle)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

/**
 * 정의 문장에서 채점·비교용 핵심어를 뽑는다(용어 자체 제외).
 * 원문에 실제로 있는 단어만 돌려준다.
 */
export function keywordsOf(statement: string, term: string, max = 8): string[] {
  const termTokens = new Set(tokenize(term).concat(compact(term)));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokenize(statement)) {
    if (termTokens.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  // 긴 단어가 더 변별력이 있으므로 우선하되, 원문 순서를 최대한 유지
  const ranked = out
    .map((t, i) => ({ t, score: Math.min(t.length, 6) * 10 - i }))
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.t);
  return out.filter((t) => ranked.includes(t));
}

/** 사용자 글 토큰 집합에 키워드가 들어 있는지(부분 일치 허용 규칙 명시) */
export function containsKeyword(userTokens: string[], userCompact: string, keyword: string): boolean {
  const k = keyword.toLowerCase();
  if (userCompact.includes(compact(k))) return true;
  return userTokens.some((u) => u === k || (u.length >= 3 && k.includes(u)) || (k.length >= 2 && u.includes(k)));
}

/** 결정적 의사난수(문항 보기 섞기를 재현 가능하게) */
export function seededRandom(seedText: string): () => number {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 문장 분리 — 각 문장의 원문 내 시작 위치를 함께 돌려준다. */
export function splitSentences(text: string): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  const re = /[^.!?。]+(?:[.!?。]+["')\]」』]*|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (!m[0]) {
      re.lastIndex++;
      continue;
    }
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const t = raw.trim();
    if (t) out.push({ text: t, start: m.index + lead });
  }
  // 소수점(예: 3.5)이나 약어로 잘린 짧은 조각은 앞 문장에 붙인다.
  const merged: { text: string; start: number }[] = [];
  for (const s of out) {
    const prev = merged[merged.length - 1];
    if (prev && (/\d\.$/.test(prev.text) && /^\d/.test(s.text))) {
      prev.text = text.slice(prev.start, s.start + s.text.length);
    } else merged.push({ ...s });
  }
  return merged;
}
