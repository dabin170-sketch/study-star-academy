/**
 * 실시간 스터디룸 프로토콜 — 서버와 클라이언트가 같은 스키마로 입력을 검증한다.
 */
import { z } from 'zod';

export const ROOM_MAX_PARTICIPANTS = 4;
export const ROOM_CODE_LENGTH = 6;
/** 헷갈리는 문자(0,O,1,I,L)를 제외한 초대 코드 문자 집합 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const characterIdSchema = z.enum(['byeol', 'mochi', 'dubu', 'kongi']);

export const nicknameSchema = z
  .string()
  .trim()
  .min(1, '닉네임을 입력해 주세요.')
  .max(12, '닉네임은 12자 이내로 입력해 주세요.')
  .regex(/^[^<>&"'`]+$/, '닉네임에 사용할 수 없는 문자가 있습니다.');

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(ROOM_CODE_LENGTH)
  .regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]+$`), '초대 코드 형식이 올바르지 않습니다.');

export const createRoomSchema = z.object({
  nickname: nicknameSchema,
  characterId: characterIdSchema,
  deviceId: z.string().uuid(),
});

export const joinRoomSchema = z.object({
  nickname: nicknameSchema,
  characterId: characterIdSchema,
  deviceId: z.string().uuid(),
});

export const authSchema = z.object({
  code: roomCodeSchema,
  participantId: z.string().uuid(),
  recoveryToken: z.string().regex(/^[a-f0-9]{64}$/),
});

export const studyStatusSchema = z.enum(['studying', 'break', 'idle']);

export const participantUpdateSchema = z.object({
  status: studyStatusSchema.optional(),
  activity: z.string().trim().max(30).optional(),
  progress: z.number().min(0).max(100).optional(),
  goalRate: z.number().min(0).max(100).optional(),
});

export const focusStartSchema = z.object({
  durationMin: z.number().int().min(1).max(180),
});

export const quizQuestionSchema = z.object({
  prompt: z.string().trim().min(1).max(500),
  choices: z.array(z.string().trim().min(1).max(200)).min(2).max(5),
  answerIndex: z.number().int().min(0).max(4),
});

export const quizStartSchema = z.object({
  questions: z.array(quizQuestionSchema).min(1).max(20),
  secondsPerQuestion: z.number().int().min(5).max(120).default(20),
});

export const quizAnswerSchema = z.object({
  questionIndex: z.number().int().min(0).max(19),
  choice: z.number().int().min(0).max(4),
  /** 재시도 시 중복 제출을 막는 클라이언트 생성 ID */
  submissionId: z.string().uuid(),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type JoinRoomInput = z.infer<typeof joinRoomSchema>;
export type AuthInput = z.infer<typeof authSchema>;
export type ParticipantUpdate = z.infer<typeof participantUpdateSchema>;
export type QuizStartInput = z.infer<typeof quizStartSchema>;
export type QuizAnswerInput = z.infer<typeof quizAnswerSchema>;
export type StudyStatus = z.infer<typeof studyStatusSchema>;

/** 클라이언트에 공개되는 참가자 정보(복구 토큰·기기 ID는 절대 포함하지 않음) */
export interface PublicParticipant {
  id: string;
  nickname: string;
  characterId: z.infer<typeof characterIdSchema>;
  connected: boolean;
  isHost: boolean;
  status: StudyStatus;
  activity: string;
  progress: number;
  goalRate: number;
  /** 오늘 누적 공부 시간(현재 진행 중 구간 제외) */
  accumulatedMs: number;
  /** 공부 중이면 현재 구간 시작 시각(서버 시각) */
  studyingSince: number | null;
}

export interface FocusTimerState {
  phase: 'idle' | 'running' | 'paused';
  durationMs: number;
  startedAt: number | null;
  /** 일시정지 시 남은 시간 */
  remainingMs: number;
}

export interface PublicQuizState {
  id: string;
  phase: 'question' | 'finished';
  index: number;
  total: number;
  prompt: string;
  choices: string[];
  questionStartedAt: number;
  secondsPerQuestion: number;
  answeredBy: string[];
  scores: Record<string, number>;
  /** 직전 문항 정답(문항이 끝난 뒤에만 공개) */
  lastReveal?: { index: number; answerIndex: number; correctBy: string[] };
}

export interface RoomState {
  code: string;
  createdAt: number;
  serverNow: number;
  participants: PublicParticipant[];
  focus: FocusTimerState;
  quiz: PublicQuizState | null;
  /** 이벤트 순번 — 클라이언트가 오래된 상태를 버리는 데 사용 */
  seq: number;
}

export interface JoinResult {
  code: string;
  participantId: string;
  recoveryToken: string;
  state: RoomState;
}

export type RoomErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'INVALID_INPUT'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'NOT_HOST'
  | 'QUIZ_NOT_ACTIVE'
  | 'SERVER_BUSY';

export interface RoomError {
  code: RoomErrorCode;
  message: string;
}

export const ROOM_ERROR_MESSAGES: Record<RoomErrorCode, string> = {
  ROOM_NOT_FOUND: '방을 찾을 수 없습니다. 코드가 맞는지 확인하거나, 서버가 다시 시작되어 방이 사라졌다면 새 방을 만들어 주세요.',
  ROOM_FULL: '이 방은 이미 4명이 모두 입장했습니다.',
  INVALID_INPUT: '입력값이 올바르지 않습니다.',
  UNAUTHORIZED: '이 방에 다시 들어갈 권한 정보가 없습니다. 다시 입장해 주세요.',
  RATE_LIMITED: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  NOT_HOST: '방장만 할 수 있는 작업입니다.',
  QUIZ_NOT_ACTIVE: '진행 중인 퀴즈가 없습니다.',
  SERVER_BUSY: '서버에 방이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
};
