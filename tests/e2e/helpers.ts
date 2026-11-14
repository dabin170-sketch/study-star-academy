import { expect, type Page } from '@playwright/test';

/** 온보딩을 건너뛰고 예시 자료를 준비한다. */
export async function quickStart(page: Page, nickname = '테스터') {
  await page.goto('/welcome');
  await page.getByRole('button', { name: '시작하기' }).click();
  await page.getByRole('button', { name: '다음' }).click();
  await page.getByLabel('닉네임').fill(nickname);
  await page.getByRole('button', { name: '다음' }).click();
  await page.getByLabel('과목 이름').fill('특수교육학');
  await page.getByRole('button', { name: '다음' }).click();
  await page.getByRole('button', { name: '예시 자료로 체험하기' }).click();
  await expect(page.getByRole('heading', { name: '원문에서 찾은 내용이에요' })).toBeVisible();
  await page.getByRole('button', { name: '다음' }).click();
  await page.getByRole('button', { name: /원문과 개념 확인하기/ }).click();
  await expect(page.getByRole('heading', { name: /예시 자료/ })).toBeVisible();
}

export async function reviewCards(page: Page, count: number) {
  await page.goto('/greenhouse');
  for (let i = 0; i < count; i++) {
    await page.getByRole('button', { name: /정답 보기/ }).first().click();
    await page.getByRole('button', { name: /^보통/ }).click();
  }
}
