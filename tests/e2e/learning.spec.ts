import { expect, test } from '@playwright/test';
import path from 'node:path';
import { quickStart, reviewCards } from './helpers';

test('1. 신규 사용자 최초 접속 → 온보딩 → 예시 자료', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/welcome/);
  await expect(page.getByRole('heading', { name: /환영해요/ })).toBeVisible();
  await quickStart(page);
  await expect(page.getByText('응용행동분석').first()).toBeVisible();
  // 원문 근거 보기
  await page.getByRole('button', { name: '원문 근거 보기' }).first().click();
  await expect(page.locator('mark.evidence').first()).toBeVisible();
});

test('2. PDF 업로드 → 두 단 구성 인식 → 개념과 근거 확인 → 학습 시작', async ({ page }) => {
  await quickStart(page);
  await page.goto('/library');
  await page.getByRole('button', { name: '+ 자료 올리기' }).click();
  await page.getByTestId('file-input').setInputFiles(path.join(process.cwd(), 'tests', 'e2e', 'fixtures', 'lecture.pdf'));
  await expect(page.getByRole('heading', { name: 'lecture', exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/2쪽을 두 단 구성으로 판단/)).toBeVisible();
  for (const term of ['직접교수', '협력교수', '보편적 학습설계', '또래교수', '촉진']) await expect(page.getByRole('heading', { name: term, exact: true })).toBeVisible();
  // 개념 확인 → 원본 읽기(PDF 렌더링)
  await page.getByRole('button', { name: '원문과 맞아요' }).first().click();
  await page.getByRole('tab', { name: '원본 읽기' }).click();
  await expect(page.locator('canvas[aria-label="원본 1쪽"]')).toBeVisible();
  await page.getByRole('link', { name: '문제 풀기' }).click();
  await expect(page.getByText(/1 \/ /)).toBeVisible();
});

test('3. 플래시카드 10개 복습 → 기록·경험치', async ({ page }) => {
  await quickStart(page);
  await reviewCards(page, 10);
  await page.goto('/garden');
  await expect(page.getByText(/누적 \d+ XP/)).toBeVisible();
  await expect(page.getByText('플래시카드 복습').first()).toBeVisible();
});

test('4·5. 서술형 시험 응시 → 자기채점 → 확정 → 오답 노트', async ({ page }) => {
  await quickStart(page);
  await page.goto('/tower');
  for (const name of ['객관식', '참·거짓', '빈칸']) await page.getByText(new RegExp(`^${name} \\(`)).click();
  await page.getByRole('button', { name: '시험 시작' }).click();
  await expect(page.getByRole('timer', { name: '남은 시간' })).toBeVisible();
  // 첫 문항 답 작성 후 새로고침해도 답안이 남는다(자동 저장)
  await page.getByLabel('답안').fill('강화는 행동의 빈도를 높인다.');
  await expect(page.getByText('✓ 자동 저장됨')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('답안')).toHaveValue('강화는 행동의 빈도를 높인다.');
  await page.getByRole('button', { name: '최종 제출' }).click();
  await page.getByRole('button', { name: '제출', exact: true }).click();
  await expect(page.getByRole('heading', { name: '시험 결과' })).toBeVisible();
  const selects = page.getByLabel(/점수$/);
  const n = await selects.count();
  for (let i = 0; i < n; i++) await selects.nth(i).selectOption('0');
  await page.getByRole('button', { name: '채점 확정' }).click();
  await page.getByRole('link', { name: '오답 분석하러 가기' }).click();
  await expect(page.getByText(/미해결 \(\d+\)/)).toBeVisible();
  await page.getByLabel('오답 원인').first().selectOption('concept-gap');
  await expect(page.getByLabel('오답 원인').first()).toHaveValue('concept-gap');
});

test('6·7. 새로고침·브라우저 재접속 후 데이터 유지, 백업 파일로 복원', async ({ page, browser }) => {
  await quickStart(page, '보존테스트');
  await reviewCards(page, 2);
  await page.reload();
  await page.goto('/');
  await expect(page.getByText('보존테스트님, 어서 오세요!')).toBeVisible();
  // 같은 브라우저 프로필에서 새 탭으로 다시 접속
  const again = await page.context().newPage();
  await again.goto('/library');
  await expect(again.getByText('[예시 자료] 행동지원과 개별화교육 기초')).toBeVisible();
  // 백업 내보내기 → 새 브라우저(빈 저장소)로 가져오기
  await again.goto('/settings');
  const [download] = await Promise.all([again.waitForEvent('download'), again.getByRole('button', { name: '백업 파일 내보내기' }).click()]);
  const file = await download.path();
  const fresh = await browser.newContext();
  const p2 = await fresh.newPage();
  await p2.goto('/welcome');
  await p2.getByRole('button', { name: '건너뛰기' }).click();
  await p2.waitForURL((u) => u.pathname === '/');
  await p2.goto('/settings');
  await p2.locator('input[type=file][accept*="json"]').setInputFiles(file!);
  await expect(p2.getByText(/가져오기 완료/)).toBeVisible();
  await p2.goto('/library');
  await expect(p2.getByText('[예시 자료] 행동지원과 개별화교육 기초')).toBeVisible();
  await fresh.close();
});

test('11. 인터넷 연결 없이 개인 학습', async ({ page, context }) => {
  await quickStart(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // 서비스 워커가 페이지를 제어하도록
  await page.goto('/greenhouse');
  await page.goto('/lecture/blank');
  await page.goto('/tower');
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('오프라인')).toBeVisible();
  await page.getByRole('link', { name: '온실' }).click();
  await page.getByRole('button', { name: /정답 보기/ }).first().click();
  await page.getByRole('button', { name: /^쉬움/ }).click();
  await page.getByRole('link', { name: '강의실' }).click();
  await page.getByRole('link', { name: '백지 복습 훈련' }).click();
  await page.getByRole('button', { name: '원문 덮고 시작하기' }).click();
  await page.getByLabel('백지 복습 답안').fill('강화란 행동 뒤 결과로 행동 가능성이 증가하는 현상');
  await page.getByRole('button', { name: '복습 종료하고 비교' }).click();
  await expect(page.getByText(/회상률 \d+%/).first()).toBeVisible();
  await context.setOffline(false);
});

test('캐릭터 스프라이트: 한 격자에서 그려지고 걷기 프레임에서도 몸통·팔다리가 같은 좌표계를 쓴다', async ({ page }) => {
  await page.goto('/welcome');
  await page.getByRole('button', { name: '시작하기' }).click();
  const sprites = page.locator('[role=radiogroup] svg');
  await expect(sprites).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    const box = await sprites.nth(i).evaluate((svg) => {
      const rects = [...svg.querySelectorAll('rect')].map((r) => [Number(r.getAttribute('x')), Number(r.getAttribute('y'))]);
      return { min: Math.min(...rects.map((r) => r[0])), max: Math.max(...rects.map((r) => r[0])), count: rects.length, viewBox: svg.getAttribute('viewBox') };
    });
    expect(box.viewBox).toBe('0 0 16 16');
    expect(box.min).toBeGreaterThanOrEqual(0);
    expect(box.max).toBeLessThan(16);
  }
  await page.screenshot({ path: 'test-results/characters.png', clip: (await page.locator('[role=radiogroup]').boundingBox())! });
});
