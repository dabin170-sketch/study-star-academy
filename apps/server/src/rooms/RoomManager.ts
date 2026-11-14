/**
 * 실시간 스터디룸 상태 관리(메모리 저장).
 * 무료 서버는 휴면·재시작될 수 있으므로 방은 "임시 상태"로 취급한다.
 * 개인 학습 기록은 서버에 저장하지 않는다.
 */
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_ERROR_MESSAGES,
  ROOM_MAX_PARTICIPANTS,
  type CreateRoomInput,
  type FocusTimerState,
  type JoinResult,
  type ParticipantUpdate,
  type PublicParticipant,
  type QuizAnswerInput,
  type QuizStartInput,
  type RoomErrorCode,
  type RoomState,
  type StudyStatus,
} from '@academy/shared';

export class RoomError extends Error {
  constructor(public code: RoomErrorCode) {
    super(ROOM_ERROR_MESSAGES[code]);
  }
}

interface Participant {
  id: string;
  nickname: string;
  characterId: CreateRoomInput['characterId'];
  deviceId: string;
  tokenHash: Buffer;
  connected: boolean;
  socketIds: Set<string>;
  isHost: boolean;
  status: StudyStatus;
  activity: string;
  progress: number;
  goalRate: number;
  accumulatedMs: number;
  studyingSince: number | null;
  joinedAt: number;
  lastSeen: number;
}

interface QuizQuestion {
  prompt: string;
  choices: string[];
  answerIndex: number;
}

interface Quiz {
  id: string;
  questions: QuizQuestion[];
  index: number;
  secondsPerQuestion: number;
  questionStartedAt: number;
  /** questionIndex → participantId → 제출 */
  answers: Map<number, Map<string, { choice: number; at: number; submissionId: string }>>;
  scores: Map<string, number>;
  phase: 'question' | 'finished';
  lastReveal?: { index: number; answerIndex: number; correctBy: string[] };
}

interface Room {
  code: string;
  createdAt: number;
  participants: Map<string, Participant>;
  focus: FocusTimerState;
  quiz: Quiz | null;
  seq: number;
  lastActivity: number;
}

export const REVEAL_DELAY_MS = 3000;
/** 방이 꽉 찼을 때, 이 시간 이상 연결이 끊긴 참가자 자리를 비워 준다 */
export const STALE_PARTICIPANT_MS = 2 * 60_000;

const hashToken = (t: string) => createHash('sha256').update(t).digest();

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return code;
}

export interface RoomManagerOptions {
  maxRooms: number;
  idleRoomTtlMs: number;
  maxRoomAgeMs: number;
  now?: () => number;
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private now: () => number;

  constructor(private opts: RoomManagerOptions) {
    this.now = opts.now ?? Date.now;
  }

  get roomCount() {
    return this.rooms.size;
  }

  /* ---------- 생성·입장 ---------- */

  createRoom(input: CreateRoomInput): JoinResult {
    if (this.rooms.size >= this.opts.maxRooms) {
      this.cleanup();
      if (this.rooms.size >= this.opts.maxRooms) throw new RoomError('SERVER_BUSY');
    }
    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();
    const t = this.now();
    const room: Room = {
      code,
      createdAt: t,
      participants: new Map(),
      focus: { phase: 'idle', durationMs: 25 * 60_000, startedAt: null, remainingMs: 25 * 60_000 },
      quiz: null,
      seq: 0,
      lastActivity: t,
    };
    this.rooms.set(code, room);
    return this.addParticipant(room, input, true);
  }

  joinRoom(code: string, input: CreateRoomInput): JoinResult {
    const room = this.get(code);
    if (room.participants.size >= ROOM_MAX_PARTICIPANTS) {
      const t = this.now();
      for (const p of room.participants.values()) {
        if (!p.connected && t - p.lastSeen > STALE_PARTICIPANT_MS) this.removeParticipant(room, p.id);
        if (room.participants.size < ROOM_MAX_PARTICIPANTS) break;
      }
      if (room.participants.size >= ROOM_MAX_PARTICIPANTS) throw new RoomError('ROOM_FULL');
    }
    return this.addParticipant(room, input, room.participants.size === 0);
  }

  private addParticipant(room: Room, input: CreateRoomInput, isHost: boolean): JoinResult {
    const token = randomBytes(32).toString('hex');
    const t = this.now();
    // 같은 닉네임이 있으면 구분 번호를 붙인다(닉네임은 신원 증명이 아님)
    let nickname = input.nickname;
    const names = new Set([...room.participants.values()].map((p) => p.nickname));
    for (let i = 2; names.has(nickname); i++) nickname = `${input.nickname}${i}`;
    const p: Participant = {
      id: randomUUID(),
      nickname,
      characterId: input.characterId,
      deviceId: input.deviceId,
      tokenHash: hashToken(token),
      connected: false,
      socketIds: new Set(),
      isHost,
      status: 'idle',
      activity: '',
      progress: 0,
      goalRate: 0,
      accumulatedMs: 0,
      studyingSince: null,
      joinedAt: t,
      lastSeen: t,
    };
    room.participants.set(p.id, p);
    this.touch(room);
    return { code: room.code, participantId: p.id, recoveryToken: token, state: this.state(room.code) };
  }

  /** 복구 토큰 검증. 닉네임이나 기기 ID만으로는 인증되지 않는다. */
  authenticate(code: string, participantId: string, token: string): Participant {
    const room = this.get(code);
    const p = room.participants.get(participantId);
    if (!p) throw new RoomError('UNAUTHORIZED');
    const given = hashToken(token);
    if (given.length !== p.tokenHash.length || !timingSafeEqual(given, p.tokenHash)) throw new RoomError('UNAUTHORIZED');
    return p;
  }

  attachSocket(code: string, participantId: string, socketId: string): void {
    const room = this.get(code);
    const p = room.participants.get(participantId);
    if (!p) throw new RoomError('UNAUTHORIZED');
    p.socketIds.add(socketId);
    p.connected = true;
    p.lastSeen = this.now();
    this.touch(room);
  }

  /** 소켓 연결이 끊기면 공부 구간을 마감하고 '연결 끊김'으로 표시한다. */
  detachSocket(socketId: string): string[] {
    const changed: string[] = [];
    for (const room of this.rooms.values()) {
      for (const p of room.participants.values()) {
        if (!p.socketIds.delete(socketId)) continue;
        if (p.socketIds.size === 0) {
          p.connected = false;
          p.lastSeen = this.now();
          this.closeStudySpan(p);
          p.status = 'idle';
        }
        this.touch(room);
        changed.push(room.code);
      }
    }
    return changed;
  }

  leave(code: string, participantId: string): void {
    const room = this.get(code);
    this.removeParticipant(room, participantId);
    if (room.participants.size === 0) this.rooms.delete(code);
  }

  private removeParticipant(room: Room, participantId: string) {
    const p = room.participants.get(participantId);
    if (!p) return;
    room.participants.delete(participantId);
    if (p.isHost) {
      const next = [...room.participants.values()].sort((a, b) => Number(b.connected) - Number(a.connected) || a.joinedAt - b.joinedAt)[0];
      if (next) next.isHost = true;
    }
    this.touch(room);
  }

  /* ---------- 개인 상태·타이머 ---------- */

  private closeStudySpan(p: Participant) {
    if (p.studyingSince !== null) {
      p.accumulatedMs += Math.max(0, this.now() - p.studyingSince);
      p.studyingSince = null;
    }
  }

  updateParticipant(code: string, participantId: string, update: ParticipantUpdate): void {
    const room = this.get(code);
    const p = room.participants.get(participantId);
    if (!p) throw new RoomError('UNAUTHORIZED');
    if (update.status && update.status !== p.status) {
      if (p.status === 'studying') this.closeStudySpan(p);
      if (update.status === 'studying') p.studyingSince = this.now();
      p.status = update.status;
    }
    if (update.activity !== undefined) p.activity = update.activity;
    if (update.progress !== undefined) p.progress = update.progress;
    if (update.goalRate !== undefined) p.goalRate = update.goalRate;
    this.touch(room);
  }

  private requireHost(room: Room, participantId: string) {
    const p = room.participants.get(participantId);
    if (!p) throw new RoomError('UNAUTHORIZED');
    if (!p.isHost) throw new RoomError('NOT_HOST');
  }

  focusStart(code: string, participantId: string, durationMin: number): void {
    const room = this.get(code);
    this.requireHost(room, participantId);
    const ms = durationMin * 60_000;
    room.focus = { phase: 'running', durationMs: ms, startedAt: this.now(), remainingMs: ms };
    this.touch(room);
  }

  focusPause(code: string, participantId: string): void {
    const room = this.get(code);
    this.requireHost(room, participantId);
    if (room.focus.phase !== 'running' || room.focus.startedAt === null) return;
    const remaining = Math.max(0, room.focus.remainingMs - (this.now() - room.focus.startedAt));
    room.focus = { ...room.focus, phase: 'paused', startedAt: null, remainingMs: remaining };
    this.touch(room);
  }

  focusResume(code: string, participantId: string): void {
    const room = this.get(code);
    this.requireHost(room, participantId);
    if (room.focus.phase !== 'paused') return;
    room.focus = { ...room.focus, phase: 'running', startedAt: this.now() };
    this.touch(room);
  }

  focusReset(code: string, participantId: string): void {
    const room = this.get(code);
    this.requireHost(room, participantId);
    room.focus = { phase: 'idle', durationMs: room.focus.durationMs, startedAt: null, remainingMs: room.focus.durationMs };
    this.touch(room);
  }

  /* ---------- 퀴즈(서버 판정) ---------- */

  quizStart(code: string, participantId: string, input: QuizStartInput): void {
    const room = this.get(code);
    this.requireHost(room, participantId);
    for (const q of input.questions) if (q.answerIndex >= q.choices.length) throw new RoomError('INVALID_INPUT');
    room.quiz = {
      id: randomUUID(),
      questions: input.questions,
      index: 0,
      secondsPerQuestion: input.secondsPerQuestion,
      questionStartedAt: this.now() + REVEAL_DELAY_MS,
      answers: new Map(),
      scores: new Map([...room.participants.keys()].map((id) => [id, 0])),
      phase: 'question',
    };
    this.touch(room);
  }

  /**
   * 답 제출. 같은 문항에 두 번 제출하면 처음 제출만 인정한다(재시도·중복 이벤트 방지).
   * 반환값 duplicate=true 이면 이미 처리된 제출이다.
   */
  quizAnswer(code: string, participantId: string, input: QuizAnswerInput): { accepted: boolean; duplicate: boolean } {
    const room = this.get(code);
    const quiz = room.quiz;
    if (!room.participants.has(participantId)) throw new RoomError('UNAUTHORIZED');
    if (!quiz || quiz.phase !== 'question') throw new RoomError('QUIZ_NOT_ACTIVE');
    const t = this.now();
    if (input.questionIndex !== quiz.index || t < quiz.questionStartedAt) return { accepted: false, duplicate: false };
    if (t > quiz.questionStartedAt + quiz.secondsPerQuestion * 1000) return { accepted: false, duplicate: false };
    const q = quiz.questions[quiz.index];
    if (input.choice >= q.choices.length) throw new RoomError('INVALID_INPUT');
    let map = quiz.answers.get(quiz.index);
    if (!map) quiz.answers.set(quiz.index, (map = new Map()));
    const prev = map.get(participantId);
    if (prev) return { accepted: prev.submissionId === input.submissionId, duplicate: true };
    map.set(participantId, { choice: input.choice, at: t, submissionId: input.submissionId });
    if (input.choice === q.answerIndex) {
      const elapsed = (t - quiz.questionStartedAt) / 1000;
      const speedBonus = Math.round(50 * Math.max(0, 1 - elapsed / quiz.secondsPerQuestion));
      quiz.scores.set(participantId, (quiz.scores.get(participantId) ?? 0) + 100 + speedBonus);
    }
    this.touch(room);
    const connected = [...room.participants.values()].filter((p) => p.connected || p.socketIds.size > 0);
    const everyone = connected.length ? connected : [...room.participants.values()];
    if (everyone.every((p) => map!.has(p.id))) this.advanceQuiz(room);
    return { accepted: true, duplicate: false };
  }

  private advanceQuiz(room: Room) {
    const quiz = room.quiz!;
    const q = quiz.questions[quiz.index];
    const answers = quiz.answers.get(quiz.index) ?? new Map();
    quiz.lastReveal = {
      index: quiz.index,
      answerIndex: q.answerIndex,
      correctBy: [...answers.entries()].filter(([, a]) => a.choice === q.answerIndex).map(([id]) => id),
    };
    if (quiz.index + 1 >= quiz.questions.length) {
      quiz.phase = 'finished';
    } else {
      quiz.index += 1;
      quiz.questionStartedAt = this.now() + REVEAL_DELAY_MS;
    }
    this.touch(room);
  }

  /** 주기적으로 호출: 시간 초과 문항 진행, 오래된 방 정리. 바뀐 방 코드를 돌려준다. */
  tick(): { changed: string[]; finishedQuizzes: string[] } {
    const changed: string[] = [];
    const finishedQuizzes: string[] = [];
    const t = this.now();
    for (const room of this.rooms.values()) {
      const quiz = room.quiz;
      if (quiz && quiz.phase === 'question' && t > quiz.questionStartedAt + quiz.secondsPerQuestion * 1000) {
        this.advanceQuiz(room);
        changed.push(room.code);
        if ((quiz.phase as string) === 'finished') finishedQuizzes.push(room.code);
      }
      if (room.focus.phase === 'running' && room.focus.startedAt !== null && t - room.focus.startedAt >= room.focus.remainingMs) {
        room.focus = { phase: 'idle', durationMs: room.focus.durationMs, startedAt: null, remainingMs: room.focus.durationMs };
        this.touch(room);
        changed.push(room.code);
      }
    }
    this.cleanup();
    return { changed: [...new Set(changed)], finishedQuizzes };
  }

  cleanup(): void {
    const t = this.now();
    for (const [code, room] of this.rooms) {
      const anyoneConnected = [...room.participants.values()].some((p) => p.connected);
      if ((!anyoneConnected && t - room.lastActivity > this.opts.idleRoomTtlMs) || t - room.createdAt > this.opts.maxRoomAgeMs) {
        this.rooms.delete(code);
      }
    }
  }

  results(code: string) {
    const room = this.get(code);
    const quiz = room.quiz;
    if (!quiz) throw new RoomError('QUIZ_NOT_ACTIVE');
    return {
      quizId: quiz.id,
      finished: quiz.phase === 'finished',
      ranking: [...room.participants.values()]
        .map((p) => ({ participantId: p.id, nickname: p.nickname, score: quiz.scores.get(p.id) ?? 0 }))
        .sort((a, b) => b.score - a.score),
    };
  }

  /* ---------- 상태 ---------- */

  private get(code: string): Room {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) throw new RoomError('ROOM_NOT_FOUND');
    return room;
  }

  has(code: string) {
    return this.rooms.has(code.toUpperCase());
  }

  private touch(room: Room) {
    room.seq += 1;
    room.lastActivity = this.now();
  }

  state(code: string): RoomState {
    const room = this.get(code);
    const participants: PublicParticipant[] = [...room.participants.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({
        id: p.id,
        nickname: p.nickname,
        characterId: p.characterId,
        connected: p.connected,
        isHost: p.isHost,
        status: p.status,
        activity: p.activity,
        progress: p.progress,
        goalRate: p.goalRate,
        accumulatedMs: p.accumulatedMs,
        studyingSince: p.studyingSince,
      }));
    const quiz = room.quiz;
    return {
      code: room.code,
      createdAt: room.createdAt,
      serverNow: this.now(),
      participants,
      focus: room.focus,
      quiz: quiz
        ? {
            id: quiz.id,
            phase: quiz.phase,
            index: quiz.index,
            total: quiz.questions.length,
            prompt: quiz.questions[quiz.index].prompt,
            choices: quiz.questions[quiz.index].choices,
            questionStartedAt: quiz.questionStartedAt,
            secondsPerQuestion: quiz.secondsPerQuestion,
            answeredBy: [...(quiz.answers.get(quiz.index)?.keys() ?? [])],
            scores: Object.fromEntries(quiz.scores),
            lastReveal: quiz.lastReveal,
          }
        : null,
      seq: room.seq,
    };
  }
}
