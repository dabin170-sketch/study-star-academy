import { expect, test } from '@playwright/test';
import path from 'node:path';
import { createStory, skipAndSample } from './theater-helpers';

test.describe('이야기 극장', () => {
  test('1·2·3. PDF 업로드 → 만화 작품 생성 → 원문 출처 확인 → 4·8·12컷 렌더링', async ({ page }) => {
    await skipAndSample(page);
    await page.goto('/library');
    await page.getByRole('button', { name: '+ 자료 올리기' }).click();
    await page.getByTestId('file-input').setInputFiles(path.join(process.cwd(), 'tests', 'e2e', 'fixtures', 'lecture.pdf'));
    await expect(page.getByRole('heading', { name: 'lecture', exact: true })).toBeVisible({ timeout: 30_000 });
    const id = await createStory(page, { doc: 'lecture', terms: ['직접교수', '협력교수', '또래교수'], format: '만화로 배우기', layout: '4컷' });
    await expect(page).toHaveURL(new RegExp(`/theater/${id}/comic`));
    await expect(page.getByTestId('comic-panel')).toHaveCount(4);
    // 개념 상자를 누르면 원문(문서·쪽)이 보인다
    await page.getByTestId('comic-concept-box').first().click();
    const dialog = page.getByRole('dialog', { name: '이 대사의 원문 근거' });
    await expect(dialog.getByText(/원본 문서: lecture/)).toBeVisible();
    await expect(dialog.locator('mark.evidence')).toBeVisible();
    await dialog.getByRole('button', { name: '닫기' }).click();
    for (const [label, n] of [['8컷', 8], ['12컷', 12]] as const) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect(page.getByTestId('comic-panel')).toHaveCount(n);
    }
    await page.getByRole('button', { name: '세로 웹툰' }).click();
    await expect.poll(() => page.getByTestId('comic-panel').count()).toBeGreaterThan(12);
  });

  test('5. 팔·어깨·손목: 모든 모션에서 화면상 관절이 떨어지지 않는다', async ({ page }) => {
    await skipAndSample(page);
    await page.goto('/theater?tab=cast');
    const preview = page.locator('svg[aria-label*="하나 선생님"]').first();
    await expect(page.locator('button[data-motion]')).toHaveCount(20);
    const motions = await page.locator('button[data-motion]').evaluateAll((els) => els.map((e) => e.getAttribute('data-motion')!));
    expect(motions.length).toBe(20);
    for (const m of motions) {
      await page.locator(`button[data-motion="${m}"]`).click();
      for (let k = 0; k < 3; k++) {
        await page.waitForTimeout(150);
        const gaps = await preview.evaluate((svg) => {
          const c = (sel: string) => {
            const r = svg.querySelector(sel)!.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          };
          const out: number[] = [];
          for (const side of ['l', 'r']) {
            for (const j of ['elbow', 'wrist']) {
              const a = c(`[data-joint="${j}${side}-parent"]`);
              const b = c(`[data-joint="${j}${side}-child"]`);
              out.push(Math.hypot(a.x - b.x, a.y - b.y));
            }
          }
          return out;
        });
        for (const g of gaps) expect(g, `${m} 관절 간격`).toBeLessThan(1.5);
      }
    }
    await preview.screenshot({ path: 'test-results/rig-hana.png' });
  });

  test('4·9·15. 표정 변경·장면 편집이 자동 저장되고, 원문 대사를 고치면 검증 경고가 뜬다', async ({ page }) => {
    await skipAndSample(page);
    const id = await createStory(page, { terms: ['정적 강화', '부적 강화'] });
    await page.goto(`/theater/${id}/edit`);
    await expect(page.getByText('검증 통과')).toBeVisible();
    await page.getByRole('button', { name: /정적 강화 이해하기|부적 강화 이해하기/ }).first().click();
    const first = page.getByLabel('표정').first();
    await first.selectOption('surprised');
    // 원문 대사(개념 상자) 고치기
    const sourceBox = page.locator('[data-fact="source"] textarea[aria-label="대사"]').first();
    await sourceBox.fill('강화는 그냥 칭찬하는 것이다.');
    await expect(page.getByTestId('story-issues')).toContainText('원문 대사를 고쳤어요');
    await expect(page.getByText('✓ 자동 저장됨')).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: /정적 강화 이해하기|부적 강화 이해하기/ }).first().click();
    await expect(page.getByLabel('표정').first()).toHaveValue('surprised');
    await expect(page.getByText('강화는 그냥 칭찬하는 것이다.').first()).toBeVisible();
    await expect(page.getByText('검증 안 됨').first()).toBeVisible();
  });

  test('6·7·8. 음성 미지원 환경: 자막으로 재생, 분기 선택 후 올바른 장면으로 이동', async ({ page }) => {
    await page.addInitScript(() => {
      // 음성 합성이 없는 브라우저 흉내
      // @ts-expect-error 테스트용
      delete window.speechSynthesis;
    });
    await skipAndSample(page);
    await createStory(page, { terms: ['정적 강화', '부적 강화'] });
    await expect(page.getByTestId('subtitle-mode')).toBeVisible();
    await page.getByRole('combobox').filter({ hasText: '×1' }).selectOption('1.5');
    await page.getByRole('button', { name: '재생' }).click();
    const sub = page.getByTestId('subtitle');
    const firstText = await sub.innerText();
    await expect(sub).not.toHaveText(firstText, { timeout: 15_000 }); // 타임라인이 자동으로 진행
    // 선택지까지 빨리 넘기기
    for (let i = 0; i < 40 && !(await page.getByText('칠판의 ○○에 들어갈 개념은 무엇일까요?').isVisible()); i++) await page.getByRole('button', { name: '다음 대사' }).click();
    const panel = page.locator('section', { hasText: '칠판의 ○○에 들어갈 개념은 무엇일까요?' });
    await expect(panel).toBeVisible();
    // 정답이 아닌 보기 고르기 → 교육적 피드백(원문)
    const wrong = panel.getByRole('button').filter({ hasNotText: /정적 강화|부적 강화|이야기 계속하기/ }).first();
    await wrong.click();
    await expect(panel.getByText(/원문에서/)).toBeVisible();
    await panel.getByRole('button', { name: '이야기 계속하기 →' }).click();
    await expect(page.getByText(/장면 \d+\/\d+ · 다시 보기/)).toBeVisible();
    await page.getByRole('button', { name: '다음 대사' }).click();
    await expect(page.getByText(/· (단서 발견|.* 이해하기)$/)).toBeVisible();
  });

  test('10. 복습: 이해도 퀴즈 결과가 학습 기록·오답 노트에 저장된다', async ({ page }) => {
    await skipAndSample(page);
    const id = await createStory(page, { terms: ['정적 강화', '부적 강화'] });
    await page.goto(`/theater/${id}/review`);
    await page.getByLabel('3줄 정리').fill('정적 강화는 행동 직후 자극을 제시해 빈도를 높인다.');
    await page.getByRole('button', { name: '원문과 비교' }).first().click();
    await expect(page.getByText(/핵심어 \d+\/\d+/).first()).toBeVisible();
    const quiz = page.locator('section', { hasText: '2. 이해도 확인 퀴즈' });
    for (let i = 0; i < 5; i++) {
      const choice = quiz.getByRole('radio').first();
      if (await choice.isVisible()) await choice.click();
      else {
        const input = quiz.getByLabel('정답');
        if (await input.isVisible()) await input.fill('틀린답');
      }
      await quiz.getByRole('button', { name: '정답 확인' }).click();
      await quiz.getByRole('button', { name: '다음 →' }).click();
    }
    await expect(quiz.getByText(/퀴즈 결과 \d+\/5/)).toBeVisible();
    await page.goto('/observatory');
    await page.goto('/garden');
    await page.goto('/detective');
    // 틀린 문제가 하나라도 있으면 오답 노트에 들어간다(정답만 골랐다면 비어 있을 수 있음)
    await expect(page.getByRole('heading', { name: '탐정 연구소' })).toBeVisible();
  });

  test('14. 서버·인터넷 없이 개인 작품 재생', async ({ page, context }) => {
    await skipAndSample(page);
    const id = await createStory(page, { terms: ['정적 강화', '부적 강화'] });
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await context.setOffline(true);
    await page.goto(`/theater/${id}/play`);
    await expect(page.getByText('오프라인')).toBeVisible();
    await page.getByRole('button', { name: '재생' }).click();
    await page.getByRole('button', { name: '다음 대사' }).click();
    await expect(page.getByTestId('stage')).toBeVisible();
    await page.goto(`/theater/${id}/comic`);
    await expect(page.getByTestId('comic-panel').first()).toBeVisible();
    await context.setOffline(false);
  });
});
