import type { ConceptKind, ConceptStatus, MistakeType, QuestionType } from './types';

export const CONCEPT_KIND_LABEL: Record<ConceptKind, string> = {
  definition: '정의',
  classification: '분류·유형',
  principle: '원리',
  procedure: '절차',
  'person-theory': '인물·이론',
  comparison: '비교',
  term: '핵심 용어',
};

export const CONCEPT_STATUS_LABEL: Record<ConceptStatus, string> = {
  auto: '원문 근거 있음',
  verified: '확인 완료',
  'needs-check': '확인 필요',
  rejected: '제외됨',
};

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  mcq: '객관식',
  ox: '참·거짓',
  short: '단답형',
  blank: '빈칸',
  essay: '서술형',
};

export const MISTAKE_TYPE_LABEL: Record<MistakeType, string> = {
  'concept-gap': '개념 부족',
  'memory-fail': '기억 실패',
  confusion: '유사 개념 혼동',
  misread: '문제 해석 오류',
  application: '적용 능력 부족',
  time: '시간 부족',
  slip: '실수',
};

export const RATING_LABEL = { 1: '다시', 2: '어려움', 3: '보통', 4: '쉬움' } as const;
