/**
 * 통합 테스트: 실제 HTTP + Socket.IO 서버를 띄워 방 생성 → 입장 → 상태 동기화 → 퀴즈 → 재연결을 확인한다.
 */
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { JoinResult, RoomState } from '@academy/shared';
import { buildApp, type BuiltApp } from './app';
import { loadConfig } from './config';

let built: BuiltApp;
let base: string;

beforeAll(async () => {
  built = buildApp({ ...loadConfig({}), port: 0, allowedOrigins: ['http://localhost:5173'] }, { logger: false });
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(built.app.server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await built.stop();
});

const post = async (path: string, body: unknown, headers: Record<string, string> = {}) => {
  const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as any };
};

const person = (nickname: string) => ({ nickname, characterId: 'mochi', deviceId: randomUUID() });

function client(): Socket {
  return connect(base, { transports: ['websocket'], forceNew: true, reconnection: false });
}

function waitFor<T>(socket: Socket, event: string, pred: (d: T) => boolean = () => true, ms = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} 대기 시간 초과`)), ms);
    const handler = (d: T) => {
      if (pred(d)) {
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(d);
      }
    };
    socket.on(event, handler);
  });
}

const emitAck = (s: Socket, event: string, data?: unknown) => new Promise<any>((r) => s.emit(event, data, r));

describe('실시간 서버', () => {
  it('헬스 체크', async () => {
    const r = await fetch(`${base}/health`);
    expect(await r.json()).toMatchObject({ ok: true });
  });

  it('잘못된 입력과 없는 방을 친절한 오류로 거절한다', async () => {
    const bad = await post('/api/rooms', { nickname: '<script>', characterId: 'mochi', deviceId: randomUUID() });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_INPUT');
    const missing = await post('/api/rooms/ABCDEF/join', person('a'));
    expect(missing.status).toBe(404);
    expect(missing.body.error.message).toMatch(/새 방을 만들어/);
  });

  it('4명 입장·상태 동기화·서버 판정 퀴즈·재연결', async () => {
    const created = await post('/api/rooms', person('호스트'));
    expect(created.status).toBe(200);
    const host = created.body as JoinResult;
    const joins: JoinResult[] = [host];
    for (const n of ['둘', '셋', '넷']) joins.push((await post(`/api/rooms/${host.code}/join`, person(n))).body);
    const full = await post(`/api/rooms/${host.code}/join`, person('다섯'));
    expect(full.status).toBe(409);

    const sockets = joins.map(() => client());
    await Promise.all(sockets.map((s) => new Promise<void>((r) => s.on('connect', () => r()))));
    for (let i = 0; i < 4; i++) {
      const ack = await emitAck(sockets[i], 'room:join', { code: host.code, participantId: joins[i].participantId, recoveryToken: joins[i].recoveryToken });
      expect(ack.ok).toBe(true);
    }
    const all = await waitFor<RoomState>(sockets[0], 'room:state', (s) => s.participants.filter((p) => p.connected).length === 4);
    expect(all.participants).toHaveLength(4);

    // 다른 사람 토큰으로는 들어갈 수 없다
    const intruder = client();
    await new Promise<void>((r) => intruder.on('connect', () => r()));
    const denied = await emitAck(intruder, 'room:join', { code: host.code, participantId: joins[1].participantId, recoveryToken: 'a'.repeat(64) });
    expect(denied.ok).toBe(false);
    intruder.close();

    // 개인 상태 업데이트가 모두에게 전달된다
    sockets[1].emit('room:participant-update', { status: 'studying', activity: '플래시카드' });
    const upd = await waitFor<RoomState>(sockets[2], 'room:state', (s) => s.participants.some((p) => p.status === 'studying'));
    expect(upd.participants.find((p) => p.id === joins[1].participantId)!.studyingSince).not.toBeNull();

    // 방장만 타이머 시작
    sockets[1].emit('timer:start', { durationMin: 25 });
    const err = await waitFor<{ code: string }>(sockets[1], 'room:error');
    expect(err.code).toBe('NOT_HOST');
    sockets[0].emit('timer:start', { durationMin: 25 });
    const timer = await waitFor<RoomState>(sockets[3], 'room:state', (s) => s.focus.phase === 'running');
    expect(timer.focus.startedAt).not.toBeNull();

    // 한 명이 연결 해제 후 같은 토큰으로 복귀
    sockets[3].close();
    await waitFor<RoomState>(sockets[0], 'room:state', (s) => s.participants.find((p) => p.id === joins[3].participantId)!.connected === false);
    const back = client();
    await new Promise<void>((r) => back.on('connect', () => r()));
    const re = await emitAck(back, 'room:reconnect', { code: host.code, participantId: joins[3].participantId, recoveryToken: joins[3].recoveryToken });
    expect(re.ok).toBe(true);
    sockets[3] = back;

    // 퀴즈(지연 시작 3초를 기다리지 않도록 서버 시각을 직접 비교)
    await emitAck(sockets[0], 'quiz:start', { questions: [{ prompt: '강화는 행동을?', choices: ['증가시킨다', '감소시킨다'], answerIndex: 0 }], secondsPerQuestion: 10 });
    const started = await waitFor<RoomState>(sockets[1], 'room:state', (s) => !!s.quiz);
    expect(JSON.stringify(started.quiz)).not.toContain('answerIndex');
    await new Promise((r) => setTimeout(r, Math.max(0, started.quiz!.questionStartedAt - started.serverNow) + 50));
    const resultPromise = waitFor<any>(sockets[2], 'quiz:result');
    const sub = randomUUID();
    const a1 = await emitAck(sockets[0], 'quiz:answer', { questionIndex: 0, choice: 0, submissionId: sub });
    expect(a1).toMatchObject({ ok: true, accepted: true, duplicate: false });
    const dup = await emitAck(sockets[0], 'quiz:answer', { questionIndex: 0, choice: 0, submissionId: sub });
    expect(dup.duplicate).toBe(true);
    for (const i of [1, 2, 3]) await emitAck(sockets[i], 'quiz:answer', { questionIndex: 0, choice: 1, submissionId: randomUUID() });
    const result = await resultPromise;
    expect(result.finished).toBe(true);
    expect(result.ranking[0].nickname).toBe('호스트');
    expect(result.ranking[0].score).toBeGreaterThan(100);

    sockets.forEach((s) => s.close());
  }, 15000);
});
