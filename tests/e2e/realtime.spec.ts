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
