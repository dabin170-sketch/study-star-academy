/**
 * 채점. 객관식·참거짓·단답·빈칸은 자동 채점하고,
 * 서술형은 루브릭 핵심어 포함 여부를 "참고 정보"로만 보여 준 뒤 사용자가 항목별로 점수를 정한다.
 */
import type { AnswerRubric, AnswerValue, QuestionType } from '@academy/shared';
import { compact, containsKeyword, stripParticle, tokenize } from './text';

export interface GradableQuestion {
  type: QuestionType;
  answer: number | boolean | string;
  acceptedAnswers?: string[];
  points: number;
  rubric?: AnswerRubric;
}

export function normalizeShortAnswer(s: string): string {
  const c = compact(s);
  // 끝에 붙은 조사 하나 정도는 허용(예: "강화이다" → "강화")
  return stripParticle(c);
}

/** 자동 채점 가능 여부 */
export const isAutoGraded = (t: QuestionType) => t !== 'essay';

export function gradeObjective(q: GradableQuestion, value: AnswerValue): { correct: boolean; score: number } {
  if (value === null || value === undefined || value === '') return { correct: false, score: 0 };
  let correct = false;
  switch (q.type) {
    case 'mcq':
      correct = value === q.answer;
      break;
    case 'ox':
      correct = value === q.answer;
      break;
    case 'short':
    case 'blank': {
      const user = normalizeShortAnswer(String(value));
      const accepted = [String(q.answer), ...(q.acceptedAnswers ?? [])].map(normalizeShortAnswer).filter(Boolean);
      correct = user.length > 0 && accepted.includes(user);
      break;
    }
    default:
      correct = false;
  }
  return { correct, score: correct ? q.points : 0 };
}

export interface RubricItemReport {
  label: string;
  points: number;
  matched: string[];
  missing: string[];
  /** 핵심어 비율로 계산한 참고 점수(확정 점수 아님) */
  suggested: number;
}

export function essayKeywordReport(rubric: AnswerRubric, answer: string): RubricItemReport[] {
  const tokens = tokenize(answer);
  const comp = compact(answer);
  return rubric.items.map((item) => {
    const matched = item.keywords.filter((k) => containsKeyword(tokens, comp, k));
    const missing = item.keywords.filter((k) => !matched.includes(k));
    const ratio = item.keywords.length ? matched.length / item.keywords.length : 0;
    // 용어 항목은 하나라도 맞으면 인정
    const isTermItem = item.label.startsWith('용어');
    const suggested = isTermItem ? (matched.length ? item.points : 0) : Math.round(ratio * item.points * 2) / 2;
    return { label: item.label, points: item.points, matched, missing, suggested };
  });
}

export interface ExamGradeInput {
  questions: (GradableQuestion & { id: string })[];
  answers: Record<string, AnswerValue>;
  /** 서술형 문항별 루브릭 항목 점수(사용자 자기채점) */
  essayScores: Record<string, number[]>;
}

export interface ExamGradeResult {
  score: number;
  maxScore: number;
  perQuestion: Record<string, { score: number; max: number; correct: boolean; ratio: number; pendingSelfGrade: boolean }>;
}

export function gradeExam({ questions, answers, essayScores }: ExamGradeInput): ExamGradeResult {
  let score = 0;
  let maxScore = 0;
  const perQuestion: ExamGradeResult['perQuestion'] = {};
  for (const q of questions) {
    maxScore += q.points;
    if (q.type === 'essay') {
      const items = q.rubric?.items ?? [];
      const given = essayScores[q.id];
      const pending = !given || given.length !== items.length;
      const s = pending ? 0 : items.reduce((acc, item, i) => acc + Math.min(Math.max(given[i] ?? 0, 0), item.points), 0);
      const max = q.points;
      // 루브릭 총점과 문항 배점이 다르면 비율로 환산
      const rubricMax = items.reduce((a, b) => a + b.points, 0) || max;
      const scaled = Math.round((s / rubricMax) * max * 10) / 10;
      score += scaled;
      perQuestion[q.id] = { score: scaled, max, correct: scaled >= max * 0.8, ratio: max ? scaled / max : 0, pendingSelfGrade: pending };
    } else {
      const r = gradeObjective(q, answers[q.id] ?? null);
      score += r.score;
      perQuestion[q.id] = { score: r.score, max: q.points, correct: r.correct, ratio: r.correct ? 1 : 0, pendingSelfGrade: false };
    }
  }
  return { score: Math.round(score * 10) / 10, maxScore, perQuestion };
}
