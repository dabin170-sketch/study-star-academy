import { expect, test, type Browser, type Page } from '@playwright/test';

async function guest(browser: Browser, nickname: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/welcome');
  await page.getByRole('button', { name: '건너뛰기' }).click();
  await page.waitForURL((u) => u.pathname === '/');
  await page.goto('/plaza');
  await page.getByLabel('닉네임').fill(nickname);
  return { ctx, page };
}

async function code(page: Page) {
  return (await page.locator('.tracking-widest').first().innerText()).trim();
}

test('8·9·10. 4명 동시 접속, 한 명 재접속, 서버 재시작 처리', async ({ browser }) => {
  const host = await guest(browser, '방장');
  await host.page.getByRole('button', { name: '새 방 만들기' }).click();
  await expect(host.page.getByText('실시간 연결됨')).toBeVisible();
  const roomCode = await code(host.page);
  expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);

  const others = [];
  for (const n of ['둘째', '셋째', '넷째']) {
    const g = await guest(browser, n);
    await g.page.getByLabel('초대 코드').fill(roomCode);
    await g.page.getByRole('button', { name: '입장' }).click();
    await expect(g.page.getByText('실시간 연결됨')).toBeVisible();
    others.push(g);
  }
  await expect(host.page.getByText('4/4명')).toBeVisible();
  for (const n of ['둘째', '셋째', '넷째']) await expect(host.page.getByText(n, { exact: false }).first()).toBeVisible();

  // 5번째는 입장 불가
  const fifth = await guest(browser, '다섯째');
  await fifth.page.getByLabel('초대 코드').fill(roomCode);
  await fifth.page.getByRole('button', { name: '입장' }).click();
  await expect(fifth.page.getByText(/이미 4명이 모두 입장/)).toBeVisible();
  await fifth.ctx.close();

  // 상태 동기화 + 방장 타이머
  await others[0].page.getByRole('button', { name: '공부 중' }).click();
  await expect(host.page.locator('text=공부 중').nth(1)).toBeVisible();
  await host.page.getByRole('button', { name: '25분 시작' }).click();
  await expect(others[1].page.getByText('모두 함께 집중 중!')).toBeVisible();

  // 9. 한 명이 연결을 끊었다가(탭 닫기) 같은 기기로 돌아오면 같은 참가자로 복귀
  await others[2].page.close();
  await expect(host.page.getByText('연결 끊김').first()).toBeVisible();
  const back = await others[2].ctx.newPage();
  await back.goto('/plaza');
  await expect(back.getByText('실시간 연결됨')).toBeVisible();
  await expect(host.page.getByText('4/4명')).toBeVisible();
  await expect(host.page.getByText('연결 끊김')).toHaveCount(0);

  // 10. 서버 재시작 → 방이 사라졌음을 안내하고 새 방 만들기로 이끈다
  await fetch('http://localhost:3009/restart', { method: 'POST' });
  await expect(host.page.getByText('방에 다시 들어갈 수 없어요')).toBeVisible({ timeout: 30_000 });
  await host.page.getByRole('button', { name: /새 방 만들기/ }).click();
  await expect(host.page.getByRole('button', { name: '새 방 만들기' })).toBeVisible();

  await host.ctx.close();
  for (const o of others) await o.ctx.close();
});

test('이야기 극장 11·12. 4명이 함께 애니메이션 보기, 공동 선택, 재접속 후 현재 장면 복귀', async ({ browser }) => {
  const { createStory, skipAndSample } = await import('./theater-helpers');
  const hostCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  await skipAndSample(host);
  await createStory(host, { terms: ['정적 강화', '부적 강화'] });
  await host.goto('/plaza');
  await host.getByLabel('닉네임').fill('방장');
  await host.getByRole('button', { name: '새 방 만들기' }).click();
  await expect(host.getByText('실시간 연결됨')).toBeVisible();
  const roomCode = await code(host);
  const guests = [];
  for (const n of ['둘째', '셋째', '넷째']) {
    const g = await guest(browser, n);
    await g.page.getByLabel('초대 코드').fill(roomCode);
    await g.page.getByRole('button', { name: '입장' }).click();
    await expect(g.page.getByText('실시간 연결됨')).toBeVisible();
    guests.push(g);
  }
  await host.getByRole('button', { name: /▶ .*사라진 단서 사건|▶ / }).first().click();
  for (const g of guests) await expect(g.page.getByTestId('group-stage')).toBeVisible();
  await host.getByRole('button', { name: '▶ 함께 재생' }).click();
  for (const g of guests) await expect(g.page.getByText('재생 중')).toBeVisible();
  // 비교하는 동안 자동 진행되지 않도록 일시정지한 뒤, 방장이 넘기면 모두 같은 대사를 본다(타임라인 이벤트 동기화)
  await host.getByRole('button', { name: '⏸ 일시정지' }).click();
  for (let i = 0; i < 2; i++) await host.getByRole('button', { name: '다음 ⏭' }).click();
  const hostLine = await host.getByTestId('group-stage').getByTestId('subtitle').textContent();
  for (const g of guests) await expect(g.page.getByTestId('group-stage').getByTestId('subtitle')).toHaveText(hostLine!);

  // 12. 한 명이 끊겼다가 돌아오면 현재 장면으로 복귀
  await guests[0].page.close();
  for (let i = 0; i < 2; i++) await host.getByRole('button', { name: '다음 ⏭' }).click();
  const now = await host.getByTestId('group-stage').getByTestId('subtitle').textContent();
  const back = await guests[0].ctx.newPage();
  await back.goto('/plaza');
  await expect(back.getByTestId('group-stage').getByTestId('subtitle')).toHaveText(now!);
  guests[0].page = back;

  // 선택지까지 진행 → 모두 투표 → 다수결 결과가 모두에게 보인다
  for (let i = 0; i < 30 && !(await host.getByText('칠판의 ○○에 들어갈 개념은 무엇일까요?').isVisible()); i++) await host.getByRole('button', { name: '다음 ⏭' }).click();
  const pages = [host, ...guests.map((g) => g.page)];
  for (const p of pages) {
    const box = p.locator('section', { hasText: '함께 보기' });
    await expect(box.getByText('칠판의 ○○에 들어갈 개념은 무엇일까요?')).toBeVisible();
    await box.getByRole('button').filter({ hasText: /강화/ }).first().click();
  }
  for (const p of pages) await expect(p.getByText(/함께 고른 답:/)).toBeVisible();

  await hostCtx.close();
  for (const g of guests) await g.ctx.close();
});
