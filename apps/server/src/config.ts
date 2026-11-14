export interface ServerConfig {
  port: number;
  host: string;
  allowedOrigins: string[];
  maxRooms: number;
  /** 모든 참가자가 나간 방을 지우기까지의 시간(분) */
  idleRoomTtlMin: number;
  /** 방의 최대 수명(시간) */
  maxRoomAgeHours: number;
  logLevel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const origins = (env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:4173')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return {
    port: Number(env.PORT ?? 3001),
    host: env.HOST ?? '0.0.0.0',
    allowedOrigins: origins,
    maxRooms: Number(env.MAX_ROOMS ?? 200),
    idleRoomTtlMin: Number(env.IDLE_ROOM_TTL_MIN ?? 30),
    maxRoomAgeHours: Number(env.MAX_ROOM_AGE_HOURS ?? 24),
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
