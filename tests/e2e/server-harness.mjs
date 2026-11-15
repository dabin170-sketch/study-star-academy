// E2E용 실시간 서버 실행기: 서버(3001)를 자식 프로세스로 띄우고, 3009 포트의 POST /restart 로 재시작한다.
// "서버 재시작 시 오류 처리" 시나리오를 실제 프로세스 재시작으로 확인하기 위해 사용한다.
import { spawn, execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';

const entry = 'apps/server/dist/index.js';
// 항상 최신 코드로 빌드한다(예전 빌드로 테스트하는 일 방지)
execSync('npm run build -w apps/server', { stdio: 'inherit' });
if (!existsSync(entry)) throw new Error('서버 빌드 실패');

let child = null;
function start() {
  child = spawn(process.execPath, [entry], {
    env: { ...process.env, PORT: '3001', ALLOWED_ORIGINS: 'http://localhost:4173', LOG_LEVEL: 'warn' },
    stdio: 'inherit',
  });
}

function waitHealthy(retries = 50) {
  return new Promise((resolve, reject) => {
    const tick = (n) =>
      fetch('http://localhost:3001/health')
        .then((r) => (r.ok ? resolve() : Promise.reject()))
        .catch(() => (n <= 0 ? reject(new Error('server not healthy')) : setTimeout(() => tick(n - 1), 200)));
    tick(retries);
  });
}

start();

createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/restart') {
    await new Promise((r) => {
      child.once('exit', r);
      child.kill('SIGTERM');
    });
    start();
    await waitHealthy();
    res.end('restarted');
    return;
  }
  res.statusCode = 404;
  res.end();
}).listen(3009);

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { child?.kill('SIGTERM'); process.exit(0); });
