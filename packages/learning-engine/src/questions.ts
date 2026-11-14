/**
 * 근거 기반 문항·카드 생성기.
 * 모든 문항의 정답은 원문 근거 문장에서 결정적으로 도출된다.
 * (정답을 모델이 추측하지 않으므로 "문서에 없는 정답"이 생기지 않는다.)
 */
import type { AnswerRubric, ConceptKind, FlashcardType, QuestionType } from '@academy/shared';
import { escapeRegExp, keywordsOf, seededRandom, shuffle } from './text';

export interface ConceptForGen {
  id: string;
  term: string;
  aliases: string[];
  kind: ConceptKind;
  statement: string;
  status: 'auto' | 'verified' | 'needs-check' | 'rejected';
  evidence?: { chunkId: string; pageNumber: number; quote: string; documentId: string };
}

export interface QuestionDraft {
  conceptId: string;
  type: QuestionType;
  prompt: string;
  choices?: string[];
  answer: number | boolean | string;
  acceptedAnswers?: string[];
  explanation: string;
  points: number;
  generator: string;
  rubric?: AnswerRubric;
}

export interface FlashcardDraft {
  conceptId: string;
  type: FlashcardType;
  front: string;
  back: string;
}

const MASK = '○○';

/** 근거 문장에서 용어(와 별칭)를 가린다. 가릴 수 없으면 null */
export function maskTerm(statement: string, term: string, aliases: string[] = []): string | null {
  let out = statement;
  let hit = false;
  for (const t of [term, ...aliases].filter((x) => x.length >= 2).sort((a, b) => b.length - a.length)) {
    const re = new RegExp(escapeRegExp(t), 'g');
    if (re.test(out)) {
      hit = true;
      out = out.replace(re, MASK);
    }
  }
  return hit ? out.replace(/○○(\s*[(（][^)）]*[)）])/g, MASK) : null;
}

export function usableForQuestions(c: ConceptForGen): boolean {
  return c.status === 'auto' || c.status === 'verified';
}

function pick<T>(arr: T[], n: number, rand: () => number): T[] {
  return shuffle(arr, rand).slice(0, n);
}

/** 개념 하나에 대한 문항 묶음 */
export function generateQuestionsFor(concept: ConceptForGen, pool: ConceptForGen[]): QuestionDraft[] {
  if (!usableForQuestions(concept)) return [];
  const out: QuestionDraft[] = [];
  const rand = seededRandom(concept.id);
  const others = pool.filter((o) => o.id !== concept.id && usableForQuestions(o) && o.term !== concept.term);
  const masked = concept.kind !== 'procedure' ? maskTerm(concept.statement, concept.term, concept.aliases) : null;
  const source = `원문 근거: “${concept.statement}”`;

  if (masked && masked.replace(/○○/g, '').trim().length >= 8) {
    // 객관식: 설명 → 개념
    const sameKind = others.filter((o) => o.kind === concept.kind);
    const distractorPool = (sameKind.length >= 3 ? sameKind : others).map((o) => o.term);
    const distractors = pick([...new Set(distractorPool)], 3, rand);
    if (distractors.length >= 2) {
      const choices = shuffle([concept.term, ...distractors], rand);
      out.push({
        conceptId: concept.id,
        type: 'mcq',
        prompt: `다음 설명에 해당하는 개념은?\n\n“${masked}”`,
        choices,
        answer: choices.indexOf(concept.term),
        explanation: `정답은 ‘${concept.term}’입니다. ${source}`,
        points: 2,
        generator: 'def-to-term',
      });
    }
    // 빈칸
    out.push({
      conceptId: concept.id,
      type: 'blank',
      prompt: `빈칸(○○)에 들어갈 말을 쓰시오.\n\n${masked}`,
      answer: concept.term,
      acceptedAnswers: concept.aliases,
      explanation: `정답은 ‘${concept.term}’입니다. ${source}`,
      points: 2,
      generator: 'cloze',
    });
    // 참·거짓(참)
    out.push({
      conceptId: concept.id,
      type: 'ox',
      prompt: `다음 설명이 맞으면 O, 틀리면 X를 고르시오.\n\n${concept.statement}`,
      answer: true,
      explanation: `원문에 그대로 나오는 설명이므로 O입니다. ${source}`,
      points: 1,
      generator: 'ox-true',
    });
    // 참·거짓(거짓): 다른 개념의 설명에 이 용어를 바꿔 넣는다
    const swap = others.find((o) => o.kind !== 'procedure' && o.statement.startsWith(o.term) && !o.statement.includes(concept.term));
    if (swap) {
      const fake = concept.term + swap.statement.slice(swap.term.length);
      out.push({
        conceptId: concept.id,
        type: 'ox',
        prompt: `다음 설명이 맞으면 O, 틀리면 X를 고르시오.\n\n${fake}`,
        answer: false,
        explanation: `X입니다. 이 문장은 ‘${swap.term}’에 대한 원문 설명(“${swap.statement}”)에 용어만 ‘${concept.term}’로 바꿔 만든 틀린 문장입니다. ‘${concept.term}’의 원문 설명: “${concept.statement}”`,
        points: 1,
        generator: 'ox-swap',
      });
    }
  }

  // 서술형: 핵심어 루브릭
  const keywords = keywordsOf(concept.statement, concept.term, 8);
  if (keywords.length >= 2) {
    const half = Math.ceil(keywords.length / 2);
    const verb = concept.kind === 'classification' ? '의 유형(분류)을 쓰고 각각 설명하시오.' : concept.kind === 'procedure' ? '의 절차를 순서대로 쓰시오.' : concept.kind === 'comparison' ? '를 비교하여 설명하시오.' : '에 대해 설명하시오.';
    out.push({
      conceptId: concept.id,
      type: 'essay',
      prompt: `‘${concept.term}’${verb}`,
      answer: '',
      explanation: `모범 답안(원문): “${concept.statement}”`,
      points: 5,
      generator: 'essay-rubric',
      rubric: {
        modelAnswer: concept.statement,
        items: [
          { label: `용어 ‘${concept.term}’를 정확히 사용`, keywords: [concept.term, ...concept.aliases], points: 1 },
          { label: '핵심 내용 ①', keywords: keywords.slice(0, half), points: 2 },
          { label: '핵심 내용 ②', keywords: keywords.slice(half), points: 2 },
        ],
      },
    });
  }
  return out;
}

export function generateQuestions(concepts: ConceptForGen[]): QuestionDraft[] {
  return concepts.flatMap((c) => generateQuestionsFor(c, concepts));
}

export function generateFlashcards(concepts: ConceptForGen[]): FlashcardDraft[] {
  const out: FlashcardDraft[] = [];
  for (const c of concepts) {
    if (!usableForQuestions(c)) continue;
    out.push({ conceptId: c.id, type: 'term', front: c.term, back: c.statement });
    const masked = c.kind !== 'procedure' ? maskTerm(c.statement, c.term, c.aliases) : null;
    if (masked && masked.replace(/○○/g, '').trim().length >= 8) out.push({ conceptId: c.id, type: 'cloze', front: masked, back: c.term });
    if (c.kind === 'procedure') out.push({ conceptId: c.id, type: 'order', front: `‘${c.term}’의 순서를 떠올려 보세요.`, back: c.statement });
  }
  return out;
}
