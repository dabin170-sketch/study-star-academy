import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { Server as IOServer, type Socket } from 'socket.io';
import { z } from 'zod';
import {
  ROOM_ERROR_MESSAGES,
  authSchema,
  createRoomSchema,
  focusStartSchema,
  joinRoomSchema,
  participantUpdateSchema,
  quizAnswerSchema,
  quizStartSchema,
  roomCodeSchema,
  type RoomErrorCode,
} from '@academy/shared';
import type { ServerConfig } from './config';
import { RoomError, RoomManager } from './rooms/RoomManager';
import { RateLimiter } from './security/rateLimit';

export const SERVER_VERSION = '2.0.0';

export interface BuiltApp {
  app: ReturnType<typeof Fastify>;
  io: IOServer;
  manager: RoomManager;
  stop: () => Promise<void>;
}

function errorBody(code: RoomErrorCode) {
  return { error: { code, message: ROOM_ERROR_MESSAGES[code] } };
}

const statusOf: Record<RoomErrorCode, number> = {
  ROOM_NOT_FOUND: 404,
  ROOM_FULL: 409,
  INVALID_INPUT: 400,
  UNAUTHORIZED: 401,
  RATE_LIMITED: 429,
  NOT_HOST: 403,
  QUIZ_NOT_ACTIVE: 409,
  SERVER_BUSY: 503,
};

export function buildApp(config: ServerConfig, opts: { now?: () => number; logger?: boolean } = {}): BuiltApp {
  const app = Fastify({
    logger:
      opts.logger === false
        ? false
        : {
            level: config.logLevel,
            // 개인정보·문서 내용이 로그에 남지 않도록 요청 본문은 기록하지 않고 인증 헤더를 가린다.
            redact: ['req.headers.authorization', 'req.headers["x-recovery-token"]', 'req.headers.cookie'],
            serializers: {
              req: (req: FastifyRequest) => ({ method: req.method, url: req.url.replace(/\/rooms\/[A-Z0-9]{6}/i, '/rooms/:code') }),
            },
          },
    bodyLimit: 64 * 1024,
    trustProxy: true,
  });
  const manager = new RoomManager({
    maxRooms: config.maxRooms,
    idleRoomTtlMs: config.idleRoomTtlMin * 60_000,
    maxRoomAgeMs: config.maxRoomAgeHours * 3_600_000,
    now: opts.now,
  });

  const httpLimiter = new RateLimiter(60, 1); // IP당 순간 60회, 초당 1회 회복
  const joinLimiter = new RateLimiter(10, 10 / 60); // 방 생성·입장: IP당 분당 약 10회
  const badCodeLimiter = new RateLimiter(15, 15 / 600); // 없는 코드 시도: 10분에 15회(무작위 대입 방지)
  const socketLimiter = new RateLimiter(30, 10); // 소켓당 초당 10개 이벤트

  const originAllowed = (origin: string | undefined) => !origin || config.allowedOrigins.includes(origin.replace(/\/$/, ''));

  app.register(cors, {
    origin: (origin, cb) => cb(null, originAllowed(origin)),
    methods: ['GET', 'POST'],
  });

  app.addHook('onRequest', async (req, reply) => {
    if (req.url === '/health') return;
    if (!httpLimiter.take(req.ip)) return reply.code(429).send(errorBody('RATE_LIMITED'));
  });

  const handle = async <T>(reply: FastifyReply, ip: string, fn: () => T) => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof RoomError) {
        if (e.code === 'ROOM_NOT_FOUND') badCodeLimiter.take(ip);
        return reply.code(statusOf[e.code]).send(errorBody(e.code));
      }
      if (e instanceof z.ZodError) return reply.code(400).send(errorBody('INVALID_INPUT'));
      throw e;
    }
  };

  const authFromHeaders = (req: FastifyRequest, code: string) =>
    authSchema.parse({
      code,
      participantId: req.headers['x-participant-id'],
      recoveryToken: req.headers['x-recovery-token'],
    });

  app.get('/health', async () => ({ ok: true, version: SERVER_VERSION, uptimeSec: Math.round(process.uptime()), rooms: manager.roomCount }));

  app.get('/', async () => ({ name: '공부별 아카데미 실시간 서버', health: '/health' }));

  app.post('/api/rooms', async (req, reply) =>
    handle(reply, req.ip, () => {
      if (!joinLimiter.take(req.ip)) throw new RoomError('RATE_LIMITED');
      return manager.createRoom(createRoomSchema.parse(req.body));
    }),
  );

  app.post<{ Params: { code: string } }>('/api/rooms/:code/join', async (req, reply) =>
    handle(reply, req.ip, () => {
      if (!badCodeLimiter.allowed(req.ip) || !joinLimiter.take(req.ip)) throw new RoomError('RATE_LIMITED');
      const code = roomCodeSchema.parse(req.params.code);
      return manager.joinRoom(code, joinRoomSchema.parse(req.body));
    }),
  );

  app.get<{ Params: { code: string } }>('/api/rooms/:code/state', async (req, reply) =>
    handle(reply, req.ip, () => {
      const a = authFromHeaders(req, req.params.code);
      manager.authenticate(a.code, a.participantId, a.recoveryToken);
      return manager.state(a.code);
    }),
  );

  app.post<{ Params: { code: string } }>('/api/rooms/:code/leave', async (req, reply) =>
    handle(reply, req.ip, () => {
      const a = authFromHeaders(req, req.params.code);
      manager.authenticate(a.code, a.participantId, a.recoveryToken);
      manager.leave(a.code, a.participantId);
      broadcast(a.code);
      return { ok: true };
    }),
  );

  app.post<{ Params: { code: string } }>('/api/rooms/:code/quiz/start', async (req, reply) =>
    handle(reply, req.ip, () => {
      const a = authFromHeaders(req, req.params.code);
      manager.authenticate(a.code, a.participantId, a.recoveryToken);
      manager.quizStart(a.code, a.participantId, quizStartSchema.parse(req.body));
      broadcast(a.code);
      return { ok: true };
    }),
  );

  app.post<{ Params: { code: string } }>('/api/rooms/:code/quiz/submit', async (req, reply) =>
    handle(reply, req.ip, () => {
      const a = authFromHeaders(req, req.params.code);
      manager.authenticate(a.code, a.participantId, a.recoveryToken);
      const r = manager.quizAnswer(a.code, a.participantId, quizAnswerSchema.parse(req.body));
      broadcast(a.code);
      return r;
    }),
  );

  app.get<{ Params: { code: string } }>('/api/rooms/:code/results', async (req, reply) =>
    handle(reply, req.ip, () => {
      const a = authFromHeaders(req, req.params.code);
      manager.authenticate(a.code, a.participantId, a.recoveryToken);
      return manager.results(a.code);
    }),
  );

  /* ---------------- Socket.IO ---------------- */

  const io = new IOServer(app.server, {
    cors: { origin: (origin, cb) => cb(null, originAllowed(origin)), methods: ['GET', 'POST'] },
    maxHttpBufferSize: 64 * 1024,
    pingInterval: 20_000,
    pingTimeout: 20_000,
  });

  const broadcast = (code: string) => {
    if (!manager.has(code)) return;
    io.to(code).emit('room:state', manager.state(code));
  };

  io.on('connection', (socket: Socket) => {
    let session: { code: string; participantId: string } | null = null;

    const fail = (e: unknown) => {
      const code: RoomErrorCode = e instanceof RoomError ? e.code : e instanceof z.ZodError ? 'INVALID_INPUT' : 'INVALID_INPUT';
      socket.emit('room:error', { code, message: ROOM_ERROR_MESSAGES[code] });
    };

    const on = <T>(event: string, schema: z.ZodType<T, z.ZodTypeDef, unknown> | null, fn: (data: T, ack?: (r: unknown) => void) => void) => {
      socket.on(event, (raw: unknown, ack?: (r: unknown) => void) => {
        if (!socketLimiter.take(socket.id)) return fail(new RoomError('RATE_LIMITED'));
        try {
          const data = schema ? schema.parse(raw) : (undefined as T);
          fn(data, typeof ack === 'function' ? ack : undefined);
        } catch (e) {
          fail(e);
          if (typeof ack === 'function') ack({ ok: false, error: e instanceof RoomError ? e.code : 'INVALID_INPUT' });
        }
      });
    };

    const requireSession = () => {
      if (!session) throw new RoomError('UNAUTHORIZED');
      return session;
    };

    const attach = (a: z.infer<typeof authSchema>, ack?: (r: unknown) => void) => {
      manager.authenticate(a.code, a.participantId, a.recoveryToken);
      if (session && session.code !== a.code) socket.leave(session.code);
      manager.attachSocket(a.code, a.participantId, socket.id);
      session = { code: a.code, participantId: a.participantId };
      socket.join(a.code);
      ack?.({ ok: true, state: manager.state(a.code) });
      broadcast(a.code);
    };

    on('room:join', authSchema, attach);
    on('room:reconnect', authSchema, attach);

    on('room:leave', null, (_d, ack) => {
      const s = requireSession();
      manager.leave(s.code, s.participantId);
      socket.leave(s.code);
      broadcast(s.code);
      session = null;
      ack?.({ ok: true });
    });

    on('room:participant-update', participantUpdateSchema, (d) => {
      const s = requireSession();
      manager.updateParticipant(s.code, s.participantId, d);
      broadcast(s.code);
    });

    on('timer:start', focusStartSchema, (d) => {
      const s = requireSession();
      manager.focusStart(s.code, s.participantId, d.durationMin);
      broadcast(s.code);
    });
    on('timer:pause', null, () => {
      const s = requireSession();
      manager.focusPause(s.code, s.participantId);
      broadcast(s.code);
    });
    on('timer:resume', null, () => {
      const s = requireSession();
      manager.focusResume(s.code, s.participantId);
      broadcast(s.code);
    });
    on('timer:reset', null, () => {
      const s = requireSession();
      manager.focusReset(s.code, s.participantId);
      broadcast(s.code);
    });
    on('timer:sync', null, (_d, ack) => {
      ack?.({ serverNow: (opts.now ?? Date.now)() });
    });

    on('quiz:start', quizStartSchema, (d, ack) => {
      const s = requireSession();
      manager.quizStart(s.code, s.participantId, d);
      broadcast(s.code);
      ack?.({ ok: true });
    });

    on('quiz:answer', quizAnswerSchema, (d, ack) => {
      const s = requireSession();
      const r = manager.quizAnswer(s.code, s.participantId, d);
      ack?.({ ok: true, ...r });
      if (!r.duplicate) {
        broadcast(s.code);
        const res = manager.results(s.code);
        if (res.finished) io.to(s.code).emit('quiz:result', res);
      }
    });

    socket.on('disconnect', () => {
      const changed = manager.detachSocket(socket.id);
      changed.forEach(broadcast);
    });
  });

  const ticker = setInterval(() => {
    const { changed, finishedQuizzes } = manager.tick();
    changed.forEach(broadcast);
    for (const code of finishedQuizzes) if (manager.has(code)) io.to(code).emit('quiz:result', manager.results(code));
  }, 1000);
  const syncer = setInterval(() => io.emit('timer:sync', { serverNow: (opts.now ?? Date.now)() }), 15_000);
  const sweeper = setInterval(() => {
    httpLimiter.sweep();
    joinLimiter.sweep();
    badCodeLimiter.sweep();
    socketLimiter.sweep();
  }, 60_000);
  ticker.unref();
  syncer.unref();
  sweeper.unref();

  const stop = async () => {
    clearInterval(ticker);
    clearInterval(syncer);
    clearInterval(sweeper);
    io.close();
    await app.close();
  };

  return { app, io, manager, stop };
}
