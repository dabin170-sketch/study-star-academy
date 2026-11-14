import { loadConfig } from './config';
import { buildApp } from './app';

const config = loadConfig();
const { app, stop } = buildApp(config);

app
  .listen({ port: config.port, host: config.host })
  .then(() => app.log.info(`실시간 서버 시작 — 허용 출처: ${config.allowedOrigins.join(', ')}`))
  .catch((err: unknown) => {
    app.log.error(err);
    process.exit(1);
  });

// Render가 재배포·휴면 시 SIGTERM을 보낸다. 방 상태는 메모리에만 있으므로 사라진다(문서에 안내).
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    app.log.info(`${sig} 수신 — 서버 종료`);
    stop().finally(() => process.exit(0));
  });
}
