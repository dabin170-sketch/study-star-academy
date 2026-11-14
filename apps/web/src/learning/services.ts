/**
 * 학습 기록 서비스 — 화면에서 일어난 학습 결과를 저장하고, 오답·복습·보상을 연결한다.
 */
import {
  DEFAULT_PARAMS,
  FSRS_VERSION,
  computeMastery,
  essayKeywordReport,
  evaluateAchievements,
  finalBlankCoverage,
  gradeExam,
  gradeObjective,
  paramsHash,
  recommend,
  recommendBlankRetryDays,
  review,
  rewardForBlankReview,
  rewardForExam,
  rewardForGameAnswer,
  rewardForMistakeResolved,
  rewardForReview,
  type AttemptLite,
  type ConceptMastery,
  type Recommendation,
  type Reward,
} from '@academy/learning-engine';
import type {
  AnswerRecord,
  AnswerSource,
  AnswerValue,
  BlankConceptResult,
  BlankReviewAttempt,
  Exam,
  ExamAttempt,
  MistakeRecord,
  MistakeType,
  Question,
  Rating,
  StudyActivity,
  StudySession,
  XpEvent,
} from '@academy/shared';
import { db, entity, touch } from '../storage/db';
import { ensureProfile } from './profile';

const DAY = 86_400_000;

/* ---------------- 보상 ---------------- */

/** sourceKey가 같으면 한 번만 지급된다. 지급되었으면 true */
export async function grantReward(r: Reward | null, kind: XpEvent['kind']): Promise<boolean> {
  if (!r || r.xp <= 0) return false;
  try {
    await db.xpEvents.add(entity({ sourceKey: r.sourceKey, kind, xp: r.xp, coins: r.coins, reason: r.reason }));
    await checkAchievements();
    return true;
  } catch (e) {
    if ((e as { name?: string }).name === 'ConstraintError') return false; // 이미 받은 보상
    throw e;
  }
}

export async function totals() {
  const events = await db.xpEvents.toArray();
  const spent = (await db.inventory.toArray()).length; // 아이템 가격은 garden 화면에서 계산
  return { xp: events.reduce((a, e) => a + e.xp, 0), coins: events.reduce((a, e) => a + e.coins, 0), itemCount: spent };
}

/* ---------------- 공부 시간 ---------------- */

export async function logSession(activity: StudyActivity, startedAt: number, endedAt: number, subjectId?: string) {
  const durationMs = Math.max(0, endedAt - startedAt);
  if (durationMs < 5_000) return null; // 5초 미만은 기록하지 않음(실수로 연 화면)
  // 한 번에 최대 4시간까지만 인정(타이머를 켜 둔 채 잊은 경우 부풀림 방지)
  const capped = Math.min(durationMs, 4 * 3_600_000);
  const s: StudySession = entity({ activity, startedAt, endedAt: startedAt + capped, durationMs: capped, subjectId });
  await db.sessions.add(s);
  await checkAchievements();
  return s;
}

/* ---------------- 문항 풀이 ---------------- */

export interface AnswerInput {
  question: Question;
  value: AnswerValue;
  source: AnswerSource;
  responseMs: number;
  attemptId?: string;
  /** 서술형: 자기채점 비율 0~1 */
  essayRatio?: number;
  confidence?: 1 | 2 | 3;
}

/** 답을 기록하고, 틀리면 오답 노트에 넣고 재도전을 예약한다. */
export async function recordAnswer(input: AnswerInput): Promise<{ record: AnswerRecord; mistake: MistakeRecord | null }> {
  const q = input.question;
  const now = Date.now();
  let correct: boolean;
  let ratio: number;
  if (q.type === 'essay') {
    ratio = Math.max(0, Math.min(1, input.essayRatio ?? 0));
    correct = ratio >= 0.8;
  } else {
    correct = gradeObjective(q, input.value).correct;
    ratio = correct ? 1 : 0;
  }
  const record: AnswerRecord = entity(
    {
      questionId: q.id,
      conceptId: q.conceptId,
      subjectId: q.subjectId,
      attemptId: input.attemptId,
      source: input.source,
      questionType: q.type,
      correct,
      scoreRatio: ratio,
      responseMs: input.responseMs,
      confidence: input.confidence,
      answeredAt: now,
      userAnswer: input.value,
    },
    now,
  );
  let mistake: MistakeRecord | null = null;
  await db.transaction('rw', [db.answers, db.mistakes], async () => {
    await db.answers.add(record);
    const open = await db.mistakes.where('questionId').equals(q.id).filter((m) => !m.resolved).first();
    if (!correct) {
      if (open) {
        mistake = touch(open, { userAnswer: input.value, answerRecordId: record.id, retryAt: now + DAY });
        await db.mistakes.put(mistake);
      } else {
        mistake = entity({ questionId: q.id, conceptId: q.conceptId, subjectId: q.subjectId, answerRecordId: record.id, userAnswer: input.value, note: '', retryAt: now + DAY, retryCount: 0, resolved: false }, now);
        await db.mistakes.add(mistake);
      }
    }
  });
  return { record, mistake };
}

/** 오답 다시 풀기 결과 */
export async function retryMistake(mistakeId: string, value: AnswerValue, responseMs: number, essayRatio?: number) {
  const m = await db.mistakes.get(mistakeId);
  if (!m) return null;
  const q = await db.questions.get(m.questionId);
  if (!q) return null;
  const { record } = await recordAnswer({ question: q, value, source: 'quiz', responseMs, essayRatio });
  const now = Date.now();
  if (record.correct) {
    await db.mistakes.put(touch(m, { resolved: true, resolvedAt: now, retryCount: m.retryCount + 1 }));
    await grantReward(rewardForMistakeResolved(m.id), 'mistake-resolved');
  } else {
    // 틀릴수록 간격을 짧게 유지: 1일 → 1일 → 2일 …(최대 3일)
    const days = Math.min(3, 1 + Math.floor(m.retryCount / 2));
    await db.mistakes.put(touch(m, { retryCount: m.retryCount + 1, retryAt: now + days * DAY, userAnswer: value }));
  }
  return record.correct;
}

export async function classifyMistake(mistakeId: string, errorType: MistakeType | undefined, note?: string) {
  const m = await db.mistakes.get(mistakeId);
  if (!m) return;
  await db.mistakes.put(touch(m, { errorType, note: note ?? m.note }));
}

/* ---------------- 플래시카드 ---------------- */

export async function reviewFlashcard(cardId: string, rating: Rating) {
  const card = await db.flashcards.get(cardId);
  if (!card) return null;
  const profile = await ensureProfile();
  const params = { ...DEFAULT_PARAMS, desiredRetention: profile.settings.desiredRetention };
  const now = Date.now();
  const out = review(card.sched, rating, now, params);
  await db.transaction('rw', [db.flashcards, db.reviewLogs], async () => {
    await db.flashcards.put(touch(card, { sched: out.state, algorithm: FSRS_VERSION }, now));
    await db.reviewLogs.add(
      entity({ cardId, conceptId: card.conceptId, rating, reviewedAt: now, elapsedDays: out.elapsedDays, scheduledDays: out.scheduledDays, before: card.sched, after: out.state, algorithm: FSRS_VERSION, paramsHash: paramsHash(params) }, now),
    );
  });
  await grantReward(rewardForReview(cardId, rating, now), 'review');
  return out;
}

/* ---------------- 시험 ---------------- */

export async function createExam(input: { subjectId: string; title: string; questionIds: string[]; durationMin: number }): Promise<Exam> {
  const exam: Exam = entity(input);
  await db.exams.add(exam);
  return exam;
}

export async function startAttempt(examId: string): Promise<ExamAttempt> {
  const exam = await db.exams.get(examId);
  if (!exam) throw new Error('시험을 찾을 수 없습니다.');
  const profile = await ensureProfile();
  const now = Date.now();
  const durationMs = exam.durationMin * 60_000 * (profile.settings.timeLimitMultiplier || 1);
  const attempt: ExamAttempt = entity({ examId, subjectId: exam.subjectId, startedAt: now, deadline: now + durationMs, answers: {}, flags: [], status: 'in-progress' as const, essayScores: {} }, now);
  await db.attempts.add(attempt);
  return attempt;
}

/** 답안 자동 저장(제출 후에는 수정 불가) */
export async function saveAttemptAnswers(attemptId: string, patch: { answers?: Record<string, AnswerValue>; flags?: string[] }) {
  const a = await db.attempts.get(attemptId);
  if (!a || a.status !== 'in-progress') return false;
  await db.attempts.put(touch(a, { answers: patch.answers ?? a.answers, flags: patch.flags ?? a.flags }));
  return true;
}

export async function submitAttempt(attemptId: string) {
  const a = await db.attempts.get(attemptId);
  if (!a || a.status !== 'in-progress') return a;
  const now = Date.now();
  const next = touch(a, { status: 'submitted' as const, submittedAt: Math.min(now, a.deadline) });
  await db.attempts.put(next);
  await logSession('exam', a.startedAt, Math.min(now, a.deadline), a.subjectId);
  return next;
}

export async function saveEssayScores(attemptId: string, questionId: string, scores: number[]) {
  const a = await db.attempts.get(attemptId);
  if (!a || a.status !== 'submitted') return;
  await db.attempts.put(touch(a, { essayScores: { ...a.essayScores, [questionId]: scores } }));
}

/** 채점 확정: 문항별 기록·오답·보상을 저장한다. 한 번만 실행된다. */
export async function finalizeAttempt(attemptId: string) {
  const a = await db.attempts.get(attemptId);
  if (!a || a.status !== 'submitted') return a;
  const exam = await db.exams.get(a.examId);
  if (!exam) return a;
  const questions = (await db.questions.bulkGet(exam.questionIds)).filter((q): q is Question => !!q);
  const result = gradeExam({ questions, answers: a.answers, essayScores: a.essayScores });
  const perQ = Math.round(((a.submittedAt ?? Date.now()) - a.startedAt) / Math.max(1, questions.length));
  for (const q of questions) {
    const r = result.perQuestion[q.id];
    await recordAnswer({ question: q, value: a.answers[q.id] ?? null, source: 'exam', responseMs: perQ, attemptId, essayRatio: q.type === 'essay' ? r.ratio : undefined });
  }
  const graded = touch(a, { status: 'graded' as const, score: result.score, maxScore: result.maxScore });
  await db.attempts.put(graded);
  await grantReward(rewardForExam(attemptId, result.maxScore ? result.score / result.maxScore : 0, questions.length), 'exam');
  return graded;
}

export { essayKeywordReport };

/* ---------------- 백지 복습 ---------------- */

export async function saveBlankReview(input: { subjectId: string; documentId: string; section: string; text: string; results: BlankConceptResult[]; startedAt: number }) {
  const coverage = finalBlankCoverage(input.results);
  const days = recommendBlankRetryDays(coverage);
  const now = Date.now();
  const attempt: BlankReviewAttempt = entity({ subjectId: input.subjectId, documentId: input.documentId, section: input.section, text: input.text, results: input.results, coverage, nextReviewAt: now + days * DAY }, now);
  await db.blankReviews.add(attempt);
  await logSession('blank-review', input.startedAt, now, input.subjectId);
  // 개념별 회상 기록(숙련도 계산에 반영)
  for (const r of input.results) {
    const verdict = r.userVerdict ?? r.autoVerdict;
    const ratio = verdict === 'correct' ? 1 : verdict === 'partial' ? 0.5 : 0;
    await db.answers.add(
      entity({ questionId: `blank:${attempt.id}:${r.conceptId}`, conceptId: r.conceptId, subjectId: input.subjectId, attemptId: attempt.id, source: 'quiz' as const, questionType: 'short' as const, correct: ratio >= 1, scoreRatio: ratio, responseMs: 0, answeredAt: now, userAnswer: null }, now),
    );
  }
  await grantReward(rewardForBlankReview(attempt.id, coverage), 'blank-review');
  return attempt;
}

export async function recordGameAnswer(question: Question, value: AnswerValue, responseMs: number) {
  const res = await recordAnswer({ question, value, source: 'game', responseMs });
  await grantReward(rewardForGameAnswer(question.id, res.record.correct, Date.now()), 'game');
  return res;
}

/* ---------------- 숙련도·추천 ---------------- */

export async function masteryMap(subjectId?: string): Promise<Map<string, ConceptMastery>> {
  const now = Date.now();
  const concepts = subjectId ? await db.concepts.where('subjectId').equals(subjectId).toArray() : await db.concepts.toArray();
  const ids = concepts.map((c) => c.id);
  const answers = await db.answers.where('conceptId').anyOf(ids).toArray();
  const logs = await db.reviewLogs.where('conceptId').anyOf(ids).toArray();
  const cards = await db.flashcards.where('conceptId').anyOf(ids).toArray();
  const byConcept = new Map<string, AttemptLite[]>();
  const push = (id: string | undefined, a: AttemptLite) => {
    if (!id) return;
    if (!byConcept.has(id)) byConcept.set(id, []);
    byConcept.get(id)!.push(a);
  };
  for (const a of answers) push(a.conceptId, { at: a.answeredAt, questionType: a.questionType, ratio: a.scoreRatio, responseMs: a.responseMs });
  for (const l of logs) push(l.conceptId, { at: l.reviewedAt, questionType: 'flashcard', ratio: l.rating >= 3 ? 1 : l.rating === 2 ? 0.5 : 0 });
  const out = new Map<string, ConceptMastery>();
  for (const c of concepts) {
    out.set(c.id, computeMastery(byConcept.get(c.id) ?? [], cards.filter((k) => k.conceptId === c.id && !k.suspended && k.sched.state !== 'new').map((k) => k.sched), now));
  }
  return out;
}

export async function recommendations(subjectId?: string, limit = 6): Promise<Recommendation[]> {
  const profile = await ensureProfile();
  const concepts = (subjectId ? await db.concepts.where('subjectId').equals(subjectId).toArray() : await db.concepts.toArray()).filter((c) => c.status !== 'rejected');
  if (!concepts.length) return [];
  const mm = await masteryMap(subjectId);
  const cards = await db.flashcards.where('conceptId').anyOf(concepts.map((c) => c.id)).toArray();
  const subject = subjectId ? await db.subjects.get(subjectId) : undefined;
  return recommend(
    concepts.map((c) => {
      const due = cards.filter((k) => k.conceptId === c.id && !k.suspended && k.sched.state !== 'new').map((k) => k.sched.due);
      return { id: c.id, term: c.term, importance: c.importance, mastery: mm.get(c.id)!, nextDue: due.length ? Math.min(...due) : null };
    }),
    profile.settings.recommendWeights,
    Date.now(),
    subject?.examDate,
    limit,
  );
}

/* ---------------- 업적 ---------------- */

export async function achievementStats() {
  const sessions = await db.sessions.toArray();
  const answers = await db.answers.toArray();
  const days = new Set([...sessions.map((s) => new Date(s.startedAt).toDateString()), ...answers.map((a) => new Date(a.answeredAt).toDateString())]);
  const logs = await db.reviewLogs.count();
  for (const l of await db.reviewLogs.toArray()) days.add(new Date(l.reviewedAt).toDateString());
  const blank = await db.blankReviews.count();
  const resolved = await db.mistakes.filter((m) => m.resolved).count();
  // 자료별 정답률(문항이 있는 자료만)
  const qDoc = new Map((await db.questions.toArray()).map((q) => [q.id, q.documentId]));
  const perDoc = new Map<string, { c: number; n: number }>();
  for (const a of answers) {
    const d = qDoc.get(a.questionId);
    if (!d) continue;
    const v = perDoc.get(d) ?? { c: 0, n: 0 };
    v.n++;
    v.c += a.scoreRatio;
    perDoc.set(d, v);
  }
  let best: { accuracy: number; answers: number } | null = null;
  for (const v of perDoc.values()) {
    const acc = v.c / v.n;
    if (!best || (v.n >= 20 && acc > best.accuracy) || (best.answers < 20 && v.n >= 20)) best = { accuracy: acc, answers: v.n };
  }
  return {
    studyDays: days.size,
    totalAnswers: answers.length,
    totalReviews: logs,
    blankReviews: blank,
    mistakesResolved: resolved,
    bestDocumentAccuracy: best,
    roomSessions: sessions.filter((s) => s.activity === 'room').length,
  };
}

export async function checkAchievements(): Promise<string[]> {
  const keys = evaluateAchievements(await achievementStats());
  const have = new Set((await db.achievements.toArray()).map((a) => a.key));
  const fresh = keys.filter((k) => !have.has(k));
  for (const key of fresh) {
    try {
      await db.achievements.add(entity({ key, unlockedAt: Date.now() }));
    } catch {
      /* 동시에 두 번 실행된 경우 */
    }
  }
  return fresh;
}

export { DAY };
