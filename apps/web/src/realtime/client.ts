/**
 * 실시간 스터디룸 클라이언트.
 * - 방 입장 정보(참가자 ID, 복구 토큰)는 이 기기 IndexedDB에만 저장한다.
 * - 연결이 끊기면 socket.io가 자동 재연결하고, 재연결되면 room:reconnect로 상태를 다시 받는다.
 * - 서버가 재시작되어 방이 사라졌으면 'room-lost' 상태로 알리고 새 방 만들기를 안내한다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { CharacterId, JoinResult, QuizStartInput, RoomError, RoomState, StudyRoomLocal, ParticipantUpdate } from '@academy/shared';
import { db, entity, getDeviceId } from '../storage/db';

export const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined)?.replace(/\/$/, '') || '';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function api<T>(path: string, init: RequestInit = {}, timeoutMs = 70_000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(SERVER_URL + path, { ...init, signal: ctrl.signal, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(body?.error?.code ?? 'HTTP_' + res.status, body?.error?.message ?? `서버 오류(${res.status})가 발생했습니다. 잠시 후 다시 시도해 주세요.`);
    return body as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if ((e as Error).name === 'AbortError') throw new ApiError('TIMEOUT', '서버가 응답하지 않습니다. 무료 서버가 잠에서 깨어나는 중일 수 있어요. 1분 정도 뒤에 다시 시도해 주세요.');
    throw new ApiError('NETWORK', '서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요. 개인 학습 기능은 그대로 쓸 수 있어요.');
  } finally {
    clearTimeout(t);
  }
}

export async function checkHealth(): Promise<{ ok: boolean; rooms: number }> {
  return api('/health', {}, 70_000);
}

async function saveLocal(r: JoinResult, nickname: string, characterId: CharacterId) {
  await db.rooms.clear();
  const row: StudyRoomLocal = entity({ code: r.code, participantId: r.participantId, recoveryToken: r.recoveryToken, nickname, characterId, lastJoinedAt: Date.now() });
  await db.rooms.add(row);
  return row;
}

export async function createRoom(nickname: string, characterId: CharacterId) {
  const deviceId = await getDeviceId();
  const r = await api<JoinResult>('/api/rooms', { method: 'POST', body: JSON.stringify({ nickname, characterId, deviceId }) });
  return saveLocal(r, nickname, characterId);
}

export async function joinRoom(code: string, nickname: string, characterId: CharacterId) {
  const deviceId = await getDeviceId();
  const r = await api<JoinResult>(`/api/rooms/${encodeURIComponent(code.trim().toUpperCase())}/join`, { method: 'POST', body: JSON.stringify({ nickname, characterId, deviceId }) });
  return saveLocal(r, nickname, characterId);
}

export type ConnStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'room-lost';

export function useRoomConnection(local: StudyRoomLocal | null | undefined) {
  const [state, setState] = useState<RoomState | null>(null);
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [error, setError] = useState<RoomError | null>(null);
  const [result, setResult] = useState<{ ranking: { participantId: string; nickname: string; score: number }[] } | null>(null);
  const offset = useRef(0);
  const socketRef = useRef<Socket | null>(null);
  const seqRef = useRef(-1);
  const createdRef = useRef(0);

  useEffect(() => {
    if (!local || !SERVER_URL) return;
    const auth = { code: local.code, participantId: local.participantId, recoveryToken: local.recoveryToken };
    const socket = io(SERVER_URL, { transports: ['websocket', 'polling'], reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 10_000 });
    socketRef.current = socket;
    setStatus('connecting');

    const applyState = (s: RoomState) => {
      offset.current = s.serverNow - Date.now();
      // 오래된(순서가 뒤바뀐) 상태는 버린다. 서버가 재시작되면 seq가 처음부터 다시 시작하므로 방 생성 시각으로 구분
      if (s.seq < seqRef.current && createdRef.current === s.createdAt) return;
      seqRef.current = s.seq;
      createdRef.current = s.createdAt;
      setState(s);
    };

    socket.on('connect', () => {
      socket.emit('room:reconnect', auth, (ack: { ok: boolean; state?: RoomState; error?: string }) => {
        if (ack?.ok && ack.state) {
          seqRef.current = -1;
          applyState(ack.state);
          setStatus('connected');
          setError(null);
        }
      });
    });
    socket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') return; // 우리가 직접 끊은 경우(방 사라짐·나가기)는 상태를 덮어쓰지 않는다
      setStatus('reconnecting');
      // 서버가 종료(재배포·휴면)하면서 연결을 끊으면 socket.io는 자동 재연결하지 않으므로 직접 다시 연결한다.
      if (reason === 'io server disconnect') setTimeout(() => socket.connect(), 1500);
    });
    socket.io.on('reconnect_attempt', () => setStatus('reconnecting'));
    socket.on('connect_error', () => setStatus((s) => (s === 'connected' ? 'reconnecting' : s === 'connecting' ? 'connecting' : 'reconnecting')));
    socket.on('room:state', applyState);
    socket.on('timer:sync', (d: { serverNow: number }) => (offset.current = d.serverNow - Date.now()));
    socket.on('quiz:result', (r) => setResult(r));
    socket.on('room:error', (e: RoomError) => {
      if (e.code === 'ROOM_NOT_FOUND' || e.code === 'UNAUTHORIZED') {
        setStatus('room-lost');
        socket.disconnect();
      }
      setError(e);
    });
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local?.code, local?.participantId]);

  const emit = useCallback((event: string, data?: unknown) => socketRef.current?.emit(event, data), []);

  /** 답 제출: 같은 submissionId로 최대 3번 재시도해도 서버는 한 번만 인정한다. */
  const answer = useCallback(async (questionIndex: number, choice: number, submissionId: string) => {
    for (let i = 0; i < 3; i++) {
      const s = socketRef.current;
      if (!s?.connected) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      const ack = await new Promise<{ ok: boolean } | null>((resolve) => {
        const t = setTimeout(() => resolve(null), 4000);
        s.emit('quiz:answer', { questionIndex, choice, submissionId }, (a: { ok: boolean }) => {
          clearTimeout(t);
          resolve(a);
        });
      });
      if (ack) return ack;
    }
    return null;
  }, []);

  return {
    state,
    status,
    error,
    result,
    clearResult: () => setResult(null),
    serverNow: () => Date.now() + offset.current,
    update: (u: ParticipantUpdate) => emit('room:participant-update', u),
    focusStart: (durationMin: number) => emit('timer:start', { durationMin }),
    focusPause: () => emit('timer:pause'),
    focusResume: () => emit('timer:resume'),
    focusReset: () => emit('timer:reset'),
    quizStart: (input: QuizStartInput) => emit('quiz:start', input),
    answer,
    leave: () => new Promise<void>((resolve) => {
      const s = socketRef.current;
      if (!s?.connected) return resolve();
      const t = setTimeout(resolve, 2000);
      s.emit('room:leave', undefined, () => {
        clearTimeout(t);
        resolve();
      });
    }),
  };
}
