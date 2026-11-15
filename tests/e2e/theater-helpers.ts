import { expect, type Page } from '@playwright/test';

/** 온보딩을 건너뛰고 예시 자료를 준비한다. */
export async function skipAndSample(page: Page) {
  await page.goto('/welcome');
  await page.getByRole('button', { name: '건너뛰기' }).click();
  await page.waitForURL((u) => u.pathname === '/');
  await page.goto('/library?sample=1');
  await page.waitForURL(/\/library\/.+/);
}

/** 제작소에서 작품을 만든다(자료는 첫 번째, 개념은 이름으로 고름). 저장 후 이동한 URL의 작품 ID를 돌려준다. */
export async function createStory(page: Page, opts: { terms: string[]; format?: '애니메이션으로 배우기' | '만화로 배우기'; doc?: string; layout?: string }) {
  await page.goto('/theater/new');
  if (opts.doc) await page.locator('label', { hasText: opts.doc }).first().click();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  for (const t of opts.terms) await page.locator('label.chip', { hasText: new RegExp(`^${t}`) }).first().click();
  await page.getByRole('button', { name: /다음 \(/ }).click();
  if (opts.format) await page.getByRole('button', { name: opts.format }).click();
  if (opts.layout) await page.getByRole('button', { name: opts.layout, exact: true }).click();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('button', { name: '스토리 구성하기' }).click();
  await expect(page.getByRole('heading', { name: '스토리보드' })).toBeVisible();
  await page.getByRole('button', { name: '저장하고 보기' }).click();
  await page.waitForURL(/\/theater\/[^/]+\/(play|comic)/);
  return page.url().split('/theater/')[1].split('/')[0];
}
