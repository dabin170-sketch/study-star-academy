/**
 * 공부별 아카데미 2.0 — 공통 데이터 타입
 * 개인 학습 데이터는 모두 브라우저 IndexedDB에 저장된다(apps/web/src/storage/db.ts).
 * 모든 엔터티는 BaseEntity 공통 필드를 가진다.
 */

export const SCHEMA_VERSION = 2;

export interface BaseEntity {
  id: string;
  createdAt: number;
  updatedAt: number;
  schemaVersion: number;
}

/* ---------- 사용자 ---------- */

export interface RecommendWeights {
  /** 취약도(1 - 숙련도) 가중치 */
  weakness: number;
  /** 복습 기한 초과 가중치 */
  overdue: number;
  /** 중요도 가중치 */
  importance: number;
  /** 시험 임박도 가중치 */
  examUrgency: number;
}

export interface UserSettings {
  fontScale: number; // 0.9 ~ 1.4
  reduceMotion: boolean;
  sound: boolean;
  /** 시험 시간 배율(학습 시간 제한 조절, 접근성) */
  timeLimitMultiplier: number;
  recommendWeights: RecommendWeights;
  /** FSRS 목표 기억 유지율 */
  desiredRetention: number;
  viewMode: 'map' | 'dashboard';
}

export interface UserProfile extends BaseEntity {
  nickname: string;
  characterId: CharacterId;
  goal: string;
  onboarded: boolean;
  settings: UserSettings;
}

export type CharacterId = 'byeol' | 'mochi' | 'dubu' | 'kongi';

export interface GuestIdentity extends BaseEntity {
  deviceId: string;
}

/* ---------- 자료 ---------- */

export interface StudySubject extends BaseEntity {
  name: string;
  color: string;
  examDate?: string; // YYYY-MM-DD
  examScope?: string;
}

export type DocumentFileType = 'pdf' | 'pptx' | 'docx' | 'txt' | 'md' | 'sample';

export interface OutlineItem {
  level: number;
  title: string;
  pageNumber: number;
  chunkId: string;
}

export interface StudyDocument extends BaseEntity {
  subjectId: string;
  title: string;
  fileName: string;
  fileType: DocumentFileType;
  fileSize: number;
  pageCount: number;
  status: 'parsing' | 'ready' | 'error';
  warnings: string[];
  outline: OutlineItem[];
  /** 원본 파일 Blob이 blobs 테이블에 저장되어 있는지 */
  hasOriginal: boolean;
  /** 사용자가 지정한 시험 범위 포함 여부 */
  inExamScope: boolean;
}

export interface DocumentPage extends BaseEntity {
  documentId: string;
  pageNumber: number;
  text: string;
  /** 추출 텍스트가 매우 적은 페이지(스캔·이미지 가능성) */
  lowText: boolean;
}

export type ChunkKind = 'heading' | 'paragraph' | 'list' | 'table';

export interface DocumentChunk extends BaseEntity {
  documentId: string;
  pageNumber: number;
  /** 문서 전체 기준 문단 순번(0부터) */
  index: number;
  kind: ChunkKind;
  headingLevel?: number;
  text: string;
  /** 이 문단이 속한 제목 경로 */
  headingPath: string[];
}

/* ---------- 개념 ---------- */

export type ConceptKind =
  | 'definition'
  | 'classification'
  | 'principle'
  | 'procedure'
  | 'person-theory'
  | 'comparison'
  | 'term';

/**
 * auto        : 원문 문장에서 규칙으로 추출됨(근거 있음, 사용자 미확인)
 * verified    : 사용자가 원문과 대조해 확인함
 * needs-check : 근거가 약하거나 판독이 불확실해 확인 필요
 * rejected    : 사용자가 제외함(문제 생성에 쓰지 않음)
 */
export type ConceptStatus = 'auto' | 'verified' | 'needs-check' | 'rejected';

export interface Concept extends BaseEntity {
  subjectId: string;
  documentId: string;
  term: string;
  aliases: string[];
  kind: ConceptKind;
  /** 원문 그대로의 근거 문장(사용자가 수정하면 userEdited=true) */
  statement: string;
  userEdited: boolean;
  /** 사용자가 덧붙인 메모(원문과 구분되어 표시) */
  userNote: string;
  status: ConceptStatus;
  importance: 1 | 2 | 3;
  section: string;
  pageNumber: number;
  /** 추출 신뢰도 0~1 (규칙 기반 점수) */
  confidence: number;
}

export interface ConceptEvidence extends BaseEntity {
  conceptId: string;
  documentId: string;
  chunkId: string;
  pageNumber: number;
  quote: string;
  /** chunk.text 안에서 quote가 시작하는 위치 */
  start: number;
}

export type RelationType = 'parent-child' | 'cause-effect' | 'contrast' | 'prerequisite' | 'application';

export interface ConceptRelation extends BaseEntity {
  fromId: string;
  toId: string;
  type: RelationType;
  status: 'auto' | 'verified';
}

/* ---------- 플래시카드 / 간격 반복 ---------- */

export type FlashcardType = 'qa' | 'term' | 'cloze' | 'compare' | 'case' | 'order' | 'image';

export type Rating = 1 | 2 | 3 | 4; // 다시, 어려움, 보통, 쉬움

export type CardState = 'new' | 'learning' | 'review' | 'relearning';

export interface SchedulingState {
  due: number;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: CardState;
  lastReview?: number;
}

export interface Flashcard extends BaseEntity {
  subjectId: string;
  documentId?: string;
  conceptId?: string;
  type: FlashcardType;
  front: string;
  back: string;
  sched: SchedulingState;
  algorithm: string; // 예: 'fsrs-4.5'
  suspended: boolean;
}

export interface ReviewLog extends BaseEntity {
  cardId: string;
  conceptId?: string;
  rating: Rating;
  reviewedAt: number;
  elapsedDays: number;
  scheduledDays: number;
  before: SchedulingState;
  after: SchedulingState;
  algorithm: string;
  paramsHash: string;
}

/* ---------- 문항 / 시험 ---------- */

export type QuestionType = 'mcq' | 'ox' | 'short' | 'blank' | 'essay';

export interface RubricItem {
  label: string;
  keywords: string[];
  points: number;
}

export interface AnswerRubric {
  items: RubricItem[];
  modelAnswer: string;
}

export interface QuestionEvidence {
  documentId: string;
  chunkId: string;
  pageNumber: number;
  quote: string;
}

export interface Question extends BaseEntity {
  subjectId: string;
  documentId?: string;
  conceptId?: string;
  type: QuestionType;
  prompt: string;
  choices?: string[];
  /** mcq: 정답 인덱스, ox: true/false, short/blank: 정답 문자열 */
  answer: number | boolean | string;
  acceptedAnswers?: string[];
  explanation: string;
  points: number;
  origin: 'generated' | 'user';
  /** 생성 규칙 이름(예: def-to-term) — 사용자에게 출제 방식을 보여줄 때 사용 */
  generator?: string;
  evidence?: QuestionEvidence;
  rubric?: AnswerRubric;
}

export interface Exam extends BaseEntity {
  subjectId: string;
  title: string;
  questionIds: string[];
  durationMin: number;
}

export type AnswerValue = number | boolean | string | null;

export interface ExamAttempt extends BaseEntity {
  examId: string;
  subjectId: string;
  startedAt: number;
  deadline: number;
  answers: Record<string, AnswerValue>;
  flags: string[];
  status: 'in-progress' | 'submitted' | 'graded';
  submittedAt?: number;
  /** 서술형 문항별 루브릭 항목 자기채점 결과 */
  essayScores: Record<string, number[]>;
  score?: number;
  maxScore?: number;
}

export type AnswerSource = 'exam' | 'quiz' | 'game' | 'room' | 'diagnostic';

export interface AnswerRecord extends BaseEntity {
  questionId: string;
  conceptId?: string;
  subjectId: string;
  attemptId?: string;
  source: AnswerSource;
  questionType: QuestionType;
  correct: boolean;
  /** 0~1 (서술형 부분점수 포함) */
  scoreRatio: number;
  responseMs: number;
  confidence?: 1 | 2 | 3;
  answeredAt: number;
  userAnswer: AnswerValue;
}

export type MistakeType =
  | 'concept-gap'
  | 'memory-fail'
  | 'confusion'
  | 'misread'
  | 'application'
  | 'time'
  | 'slip';

export interface MistakeRecord extends BaseEntity {
  questionId: string;
  conceptId?: string;
  subjectId: string;
  answerRecordId: string;
  userAnswer: AnswerValue;
  errorType?: MistakeType;
  note: string;
  retryAt: number;
  retryCount: number;
  resolved: boolean;
  resolvedAt?: number;
}

/* ---------- 학습 기록 ---------- */

export type StudyActivity = 'timer' | 'flashcard' | 'exam' | 'quiz' | 'blank-review' | 'reading' | 'game' | 'room';

export interface StudySession extends BaseEntity {
  subjectId?: string;
  activity: StudyActivity;
  startedAt: number;
  endedAt: number;
  durationMs: number;
}

export interface StudyGoal extends BaseEntity {
  title: string;
  minutesPerDay: number;
  active: boolean;
}

export interface BlankReviewAttempt extends BaseEntity {
  subjectId: string;
  documentId: string;
  section: string;
  text: string;
  /** 개념별 판정 결과 */
  results: BlankConceptResult[];
  coverage: number;
  nextReviewAt: number;
}

export type BlankVerdict = 'correct' | 'partial' | 'missing' | 'wrong';

export interface BlankConceptResult {
  conceptId: string;
  term: string;
  termFound: boolean;
  keywordCoverage: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  autoVerdict: Exclude<BlankVerdict, 'wrong'>;
  /** 사용자가 원문과 대조해 직접 바꾼 판정 */
  userVerdict?: BlankVerdict;
}

export interface LearningRecommendation {
  conceptId: string;
  score: number;
  reasons: string[];
  action: 'flashcard' | 'quiz' | 'blank-review' | 'read';
}

/* ---------- 성장 ---------- */

export interface XpEvent extends BaseEntity {
  /** 같은 학습 결과로 경험치가 두 번 지급되지 않도록 하는 고유 키 */
  sourceKey: string;
  kind: 'review' | 'exam' | 'blank-review' | 'mistake-resolved' | 'game' | 'room';
  xp: number;
  coins: number;
  reason: string;
}

export interface Achievement extends BaseEntity {
  key: string;
  unlockedAt: number;
}

/* ---------- 실시간(로컬에 보관하는 복구 정보) ---------- */

export interface StudyRoomLocal extends BaseEntity {
  code: string;
  participantId: string;
  recoveryToken: string;
  nickname: string;
  characterId: CharacterId;
  lastJoinedAt: number;
}
