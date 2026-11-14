import { defineConfig, devices } from '@playwright/test';

/**
 * E2E 테스트
 *  - 웹: VITE_SERVER_URL=http://localhost:3001 로 빌드한 뒤 vite preview(4173)
 *  - 서버: tests/e2e/server-harness.mjs 가 실시간 서버(3001)를 띄우고, 3009 포트로 '재시작' 명령을 받는다
 *  - 브라우저를 내려받을 수 없는 환경에서는 CHROME_PATH=/usr/bin/google-chrome 처럼 설치된 크롬을 지정할 수 있다
 */
const executablePath = process.env.CHROME_PATH;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'ko-KR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: executablePath ? { executablePath, args: ['--no-sandbox'] } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec/ },
  ],
  webServer: [
    {
      command: 'node tests/e2e/server-harness.mjs',
      url: 'http://localhost:3001/health',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npm run build -w apps/web && npm run preview -w apps/web -- --strictPort',
      url: 'http://localhost:4173',
      env: { VITE_SERVER_URL: 'http://localhost:3001' },
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});
