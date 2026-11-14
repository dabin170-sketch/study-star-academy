/**
 * 백지 복습 비교기.
 * 판정은 "용어 포함 + 원문 핵심어 포함 비율"로만 한다(키워드 비교).
 * 내용을 잘못 기억했는지는 자동으로 판단할 수 없으므로, 화면에서 사용자가 원문과 대조해
 * 'wrong'(잘못 기억)으로 직접 바꿀 수 있게 한다.
 */
import type { BlankConceptResult } from '@academy/shared';
import { compact, containsKeyword, keywordsOf, tokenize } from './text';

export interface BlankConceptInput {
  id: string;
  term: string;
  aliases: string[];
  statement: string;
}

/** 판정 기준(코드에 명시, 화면에도 표시) */
export const BLANK_RULES = {
  correctCoverage: 0.6,
  partialCoverage: 0.3,
};

export function compareBlankReview(text: string, concepts: BlankConceptInput[]): { results: BlankConceptResult[]; coverage: number } {
  const tokens = tokenize(text);
  const comp = compact(text);
  const results: BlankConceptResult[] = concepts.map((c) => {
    const termFound = [c.term, ...c.aliases].some((t) => t.length >= 2 && comp.includes(compact(t)));
    const keywords = keywordsOf(c.statement, c.term, 8);
    const matched = keywords.filter((k) => containsKeyword(tokens, comp, k));
    const coverage = keywords.length ? matched.length / keywords.length : termFound ? 1 : 0;
    let autoVerdict: BlankConceptResult['autoVerdict'];
    if (termFound && coverage >= BLANK_RULES.correctCoverage) autoVerdict = 'correct';
    else if (termFound || coverage >= BLANK_RULES.partialCoverage) autoVerdict = 'partial';
    else autoVerdict = 'missing';
    return {
      conceptId: c.id,
      term: c.term,
      termFound,
      keywordCoverage: Math.round(coverage * 100) / 100,
      matchedKeywords: matched,
      missingKeywords: keywords.filter((k) => !matched.includes(k)),
      autoVerdict,
    };
  });
  const coverage = results.length
    ? results.reduce((acc, r) => acc + (r.autoVerdict === 'correct' ? 1 : r.autoVerdict === 'partial' ? 0.5 : 0), 0) / results.length
    : 0;
  return { results, coverage: Math.round(coverage * 100) / 100 };
}

/** 최종 판정(사용자 수정 우선)으로 점수 계산 */
export function finalBlankCoverage(results: BlankConceptResult[]): number {
  if (!results.length) return 0;
  const v = results.reduce((acc, r) => {
    const verdict = r.userVerdict ?? r.autoVerdict;
    return acc + (verdict === 'correct' ? 1 : verdict === 'partial' ? 0.5 : 0);
  }, 0);
  return Math.round((v / results.length) * 100) / 100;
}

/** 재시험 추천 간격(일) — 많이 빠뜨릴수록 빨리 다시 */
export function recommendBlankRetryDays(coverage: number): number {
  if (coverage < 0.5) return 1;
  if (coverage < 0.8) return 3;
  return 7;
}
