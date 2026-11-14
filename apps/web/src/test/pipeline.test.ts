/**
 * 통합 테스트(브라우저 저장소 = fake-indexeddb)
 *  자료 업로드 → 개념 추출 → 문제 제작 → 시험 → 채점 → 오답 기록 → 재복습 예약
 *  백지 복습 → 비교 → 보완 학습, 백업 → 복원
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { compareBlankReview, verifyEvidence } from '@academy/learning-engine';
import { parsePlainText } from '@academy/document-parser';
import { db, useDatabase } from '../storage/db';
import { loadSampleDocument, ensureDefaultSubject } from '../learning/sample';
import { deleteDocument, saveParsedDocument, updateConcept } from '../features/import/importDocument';
import {
  createExam,
  finalizeAttempt,
  masteryMap,
  recommendations,
  retryMistake,
  reviewFlashcard,
  saveAttemptAnswers,
  saveBlankReview,
  saveEssayScores,
  startAttempt,
  submitAttempt,
  totals,
} from '../learning/services';
import { exportBackup, importBackup, wipeAllData } from '../storage/backup';

let n = 0;
beforeEach(async () => {
  useDatabase(`test-${n++}`);
  await db.open();
});

describe('자료 → 개념 → 문항', () => {
  it('예시 자료에서 근거가 연결된 개념과 카드·문항을 만든다', async () => {
    const docId = await loadSampleDocument();
    const concepts = await db.concepts.where('documentId').equals(docId).toArray();
    const terms = concepts.map((c) => c.term);
    expect(terms).toEqual(expect.arrayContaining(['응용행동분석', '강화', '정적 강화', '부적 강화', '벌', '소거', '촉구', '기능평가', '개별화교육계획', '전환교육', '기능평가 절차']));
    // 모든 근거 quote는 문단 원문과 정확히 일치
    const chunks = await db.chunks.where('documentId').equals(docId).toArray();
    const ev = await db.evidence.where('documentId').equals(docId).toArray();
    for (const e of ev) {
      const ch = chunks.find((c) => c.id === e.chunkId)!;
      expect(verifyEvidence([{ index: 0, text: ch.text }], { chunkIndex: 0, pageNumber: e.pageNumber, start: e.start, quote: e.quote })).toBe(true);
    }
    expect(await db.flashcards.count()).toBeGreaterThan(10);
    const qs = await db.questions.toArray();
    expect(qs.filter((q) => q.type === 'mcq').length).toBeGreaterThan(5);
    expect(qs.every((q) => q.evidence?.quote)).toBe(true);
  });

  it('사용자가 개념을 수정하면 이후 문항에 수정 내용이 반영되고, 제외하면 문항이 사라진다', async () => {
    const docId = await loadSampleDocument();
    const c = (await db.concepts.where('documentId').equals(docId).filter((x) => x.term === '소거').first())!;
    await updateConcept(c.id, { statement: '소거: 강화를 중단하여 행동을 줄이는 절차', status: 'verified' });
    const blank = await db.questions.where('conceptId').equals(c.id).filter((q) => q.type === 'blank').first();
    expect(blank!.prompt).toContain('강화를 중단하여');
    expect((await db.concepts.get(c.id))!.userEdited).toBe(true);
    await updateConcept(c.id, { status: 'rejected' });
    expect(await db.questions.where('conceptId').equals(c.id).count()).toBe(0);
    expect((await db.flashcards.where('conceptId').equals(c.id).toArray()).every((f) => f.suspended)).toBe(true);
  });

  it('자료를 지우면 문단·개념은 지우고 학습 기록은 남긴다', async () => {
    const subjectId = await ensureDefaultSubject();
    const docId = await saveParsedDocument({ subjectId, parsed: parsePlainText('강화란 행동의 빈도가 증가하는 현상을 말한다.\n\n벌이란 행동의 빈도가 감소하는 현상을 말한다.', 't'), fileName: 't.txt', fileType: 'txt', fileSize: 10 });
    const card = (await db.flashcards.toCollection().first())!;
    await reviewFlashcard(card.id, 3);
    await deleteDocument(docId);
    expect(await db.concepts.count()).toBe(0);
    expect(await db.chunks.count()).toBe(0);
    expect(await db.reviewLogs.count()).toBe(1);
  });
});

describe('시험 → 채점 → 오답 → 재도전', () => {
  it('제출 후 수정 불가, 채점 확정 시 오답이 기록되고 재도전이 예약된다', async () => {
    const docId = await loadSampleDocument();
    const qs = await db.questions.where('documentId').equals(docId).toArray();
    const mcq = qs.find((q) => q.type === 'mcq')!;
    const ox = qs.find((q) => q.type === 'ox')!;
    const essay = qs.find((q) => q.type === 'essay')!;
    const exam = await createExam({ subjectId: mcq.subjectId, title: '모의고사', questionIds: [mcq.id, ox.id, essay.id], durationMin: 10 });
    const attempt = await startAttempt(exam.id);
    const wrongChoice = ((mcq.answer as number) + 1) % mcq.choices!.length;
    expect(await saveAttemptAnswers(attempt.id, { answers: { [mcq.id]: wrongChoice, [ox.id]: ox.answer as boolean, [essay.id]: '답안' }, flags: [essay.id] })).toBe(true);
    await submitAttempt(attempt.id);
    expect(await saveAttemptAnswers(attempt.id, { answers: { [mcq.id]: mcq.answer as number } })).toBe(false);
    await saveEssayScores(attempt.id, essay.id, [1, 1, 0]);
    const graded = await finalizeAttempt(attempt.id);
    expect(graded!.status).toBe('graded');
    expect(graded!.score).toBe(1 + 2); // OX 1점 + 서술형 2/5
    const mistakes = await db.mistakes.toArray();
    expect(mistakes.map((m) => m.questionId).sort()).toEqual([mcq.id, essay.id].sort());
    expect(mistakes.every((m) => m.retryAt > Date.now())).toBe(true);
    // 두 번 확정해도 기록이 중복되지 않는다
    await finalizeAttempt(attempt.id);
    expect(await db.answers.where('attemptId').equals(attempt.id).count()).toBe(3);
    // 재도전
    const m = mistakes.find((x) => x.questionId === mcq.id)!;
    expect(await retryMistake(m.id, mcq.answer as number, 1000)).toBe(true);
    expect((await db.mistakes.get(m.id))!.resolved).toBe(true);
    const t = await totals();
    expect(t.xp).toBeGreaterThan(0);
    const mm = await masteryMap();
    expect(mm.get(mcq.conceptId!)!.attempts).toBeGreaterThan(0);
    const recs = await recommendations();
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].reasons.length).toBeGreaterThan(0);
  });
});

describe('백지 복습', () => {
  it('비교 결과를 저장하고 재시험 날짜를 추천한다', async () => {
    const docId = await loadSampleDocument();
    const concepts = (await db.concepts.where('documentId').equals(docId).toArray()).filter((c) => c.section.includes('응용행동분석'));
    const text = '강화는 행동 뒤 결과로 행동 가능성이 증가하는 현상. 벌은 반대로 감소.';
    const { results } = compareBlankReview(text, concepts);
    const saved = await saveBlankReview({ subjectId: concepts[0].subjectId, documentId: docId, section: '응용행동분석', text, results, startedAt: Date.now() - 60_000 });
    expect(saved.coverage).toBeLessThan(1);
    expect(saved.nextReviewAt).toBeGreaterThan(Date.now());
    expect(results.find((r) => r.term === '강화')!.autoVerdict).toBe('correct');
  });
});

describe('백업·복원', () => {
  it('내보낸 데이터를 모두 지운 뒤 가져오면 복원된다', async () => {
    await loadSampleDocument();
    const before = await db.concepts.count();
    const backup = await exportBackup(false);
    await wipeAllData();
    expect(await db.concepts.count()).toBe(0);
    const s = await importBackup(JSON.parse(JSON.stringify(backup)));
    expect(s.added).toBeGreaterThan(0);
    expect(await db.concepts.count()).toBe(before);
    // 다시 가져와도 중복되지 않는다
    await importBackup(JSON.parse(JSON.stringify(backup)));
    expect(await db.concepts.count()).toBe(before);
  });
});
