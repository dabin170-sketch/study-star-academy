import { expect, test } from '@playwright/test';
import { quickStart } from './helpers';

test('12. 모바일 화면에서 온보딩·하단 메뉴·카드 복습·퀴즈', async ({ page }) => {
  await quickStart(page, '모바일');
  const nav = page.getByRole('navigation', { name: '모바일 메뉴' });
  await expect(nav).toBeVisible();
  await nav.getByRole('link', { name: /카드/ }).click();
  await page.getByRole('button', { name: /정답 보기/ }).first().click();
  await page.getByRole('button', { name: /^보통/ }).click();
  await nav.getByRole('button', { name: /더보기/ }).click();
  await page.getByRole('link', { name: '강의실' }).last().click();
  await page.getByRole('tab', { name: '빠른 퀴즈' }).click();
  await expect(page.getByText(/1 \/ /)).toBeVisible();
  // 가로 스크롤이 생기지 않는다
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.goto('/');
  await page.screenshot({ path: 'test-results/mobile-home.png', fullPage: true });
});

test('이야기 극장 13. 모바일에서 만화·애니메이션 실행', async ({ page }) => {
  const { createStory, skipAndSample } = await import('./theater-helpers');
  await skipAndSample(page);
  const id = await createStory(page, { terms: ['정적 강화', '부적 강화'] });
  await page.getByRole('button', { name: '재생' }).click();
  await expect(page.getByTestId('stage')).toBeVisible();
  await page.getByRole('button', { name: '다음 대사' }).click();
  await page.goto(`/theater/${id}/comic`);
  await expect(page.getByTestId('comic-panel')).toHaveCount(4);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'test-results/mobile-comic.png', fullPage: true });
});
