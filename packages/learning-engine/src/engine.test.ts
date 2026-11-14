import { describe, expect, it } from 'vitest';
import type { ChunkInput } from './extract';
import { cleanTerm, extractConcepts, matchSentence, verifyEvidence } from './extract';
import { DEFAULT_PARAMS, newSchedulingState, nextIntervalDays, retrievability, review } from './fsrs';
import { generateFlashcards, generateQuestions, maskTerm } from './questions';
import { essayKeywordReport, gradeExam, gradeObjective } from './grading';
import { compareBlankReview, finalBlankCoverage, recommendBlankRetryDays } from './blank-review';
import { computeMastery, DEFAULT_WEIGHTS, recommend } from './mastery';
import { evaluateAchievements, levelFromXp, planUntilExam, rewardForExam, rewardForGameAnswer, rewardForReview } from './rewards';

const chunk = (index: number, text: string, extra: Partial<ChunkInput> = {}): ChunkInput => ({
  index,
  pageNumber: 1,
  kind: 'paragraph',
  text,
  headingPath: ['1. 강화와 벌'],
  ...extra,
});

const sampleChunks: ChunkInput[] = [
  chunk(0, '1. 강화와 벌', { kind: 'heading', headingLevel: 2, headingPath: [] }),
  chunk(1, '오늘은 행동의 결과를 살펴본다. 강화란 행동 뒤에 따르는 결과로 인해 그 행동의 발생 빈도가 증가하는 현상을 말한다.'),
  chunk(2, '정적 강화(positive reinforcement)는 행동 직후 자극을 제시하여 행동의 빈도를 높이는 것을 의미한다.'),
  chunk(3, '부적 강화는 행동 직후 혐오 자극을 제거하여 행동의 빈도를 높이는 것을 말한다.'),
  chunk(4, '• 소거: 이전에 강화되던 행동에 더 이상 강화를 제공하지 않아 행동이 감소하는 절차', { kind: 'list' }),
  chunk(5, '강화계획의 유형에는 연속 강화계획과 간헐 강화계획이 있다.'),
  chunk(6, '이것은 매우 중요하다. 그러나 학생들은 자주 헷갈린다.'),
  chunk(7, '2. 기능평가 절차', { kind: 'heading', headingLevel: 2, headingPath: [] }),
  chunk(8, '1) 문제행동을 조작적으로 정의한다.', { kind: 'list', headingPath: ['2. 기능평가 절차'] }),
  chunk(9, '2) 정보를 수집한다.', { kind: 'list', headingPath: ['2. 기능평가 절차'] }),
  chunk(10, '3) 가설을 세운다.', { kind: 'list', headingPath: ['2. 기능평가 절차'] }),
  chunk(11, '3. 전환교육', { kind: 'heading', headingLevel: 2, headingPath: [] }),
  chunk(12, '학교 졸업 이후의 삶을 준비하는 과정에 대해 살펴본다.', { headingPath: ['3. 전환교육'] }),
];

describe('근거 기반 개념 추출', () => {
  const concepts = extractConcepts(sampleChunks);
  const byTerm = (t: string) => concepts.find((c) => c.term === t);

  it('정의 문장에서 용어를 찾고, 근거 문장은 원문과 정확히 같다', () => {
    expect(byTerm('강화')?.kind).toBe('definition');
    expect(byTerm('강화')?.statement).toBe('강화란 행동 뒤에 따르는 결과로 인해 그 행동의 발생 빈도가 증가하는 현상을 말한다.');
    for (const c of concepts) {
      expect(c.evidence.length).toBeGreaterThan(0);
      for (const e of c.evidence) expect(verifyEvidence(sampleChunks, e)).toBe(true);
    }
  });

  it('괄호 안 영문은 별칭으로 분리한다', () => {
    expect(byTerm('정적 강화')?.aliases).toEqual(['positive reinforcement']);
  });

  it('“용어: 설명” 형식과 분류 문장, 절차 목록을 인식한다', () => {
    expect(byTerm('소거')?.statement.startsWith('소거: ')).toBe(true);
    expect(byTerm('강화계획')?.kind).toBe('classification');
    const proc = byTerm('기능평가 절차')!;
    expect(proc.kind).toBe('procedure');
    expect(proc.evidence).toHaveLength(3);
  });

  it('지시어로 시작하는 문장이나 근거 없는 내용은 개념으로 만들지 않는다', () => {
    expect(concepts.some((c) => c.term.startsWith('이것'))).toBe(false);
    expect(concepts.some((c) => c.term.includes('학생들'))).toBe(false);
  });

  it('정의를 찾지 못한 제목 용어는 확인 필요로 둔다', () => {
    const t = byTerm('전환교육')!;
    expect(t.status).toBe('needs-check');
    expect(t.kind).toBe('term');
  });

  it('스캔 의심 페이지의 개념은 자동 확정하지 않는다', () => {
    const r = extractConcepts([chunk(0, '강화란 행동 빈도가 증가하는 현상을 말한다.', { lowText: true })]);
    expect(r[0].status).toBe('needs-check');
  });

  it('matchSentence/cleanTerm 경계 사례', () => {
    expect(matchSentence('개별화교육계획이란 학생의 교육 목표와 지원을 담은 문서이다.')?.term).toBe('개별화교육계획');
    expect(matchSentence('학습자의 반응을 강화하는 과정을 조형이라고 한다.')?.term).toBe('조형');
    expect(cleanTerm('그러한 방법')).toBeNull();
    expect(cleanTerm('직접교수')?.term).toBe('직접교수');
    expect(matchSentence('또래교수는 학생이 서로 가르치도록 구조화한 교수 방 법을 의 미한다.')?.term).toBe('또래교수');
    expect(cleanTerm('관점')?.term).toBe('관점');
    expect(cleanTerm('할 수')).toBeNull();
    expect(cleanTerm('강화하')).toBeNull();
    expect(cleanTerm('① 촉구(prompt)')).toEqual({ term: '촉구', aliases: ['prompt'] });
  });
});

describe('문항·카드 생성과 채점', () => {
  const concepts = extractConcepts(sampleChunks).map(({ evidence: _e, ...c }, i) => ({ ...c, id: `c${i}` }));
  const questions = generateQuestions(concepts);

  it('확인 필요·제외 개념으로는 문항을 만들지 않는다', () => {
    const ids = new Set(concepts.filter((c) => c.status !== 'auto' && c.status !== 'verified').map((c) => c.id));
    expect(questions.some((q) => ids.has(q.conceptId))).toBe(false);
  });

  it('객관식의 정답은 해당 개념 용어이고 문제 본문에는 용어가 가려져 있다', () => {
    const mcqs = questions.filter((q) => q.type === 'mcq');
    expect(mcqs.length).toBeGreaterThan(0);
    for (const q of mcqs) {
      const c = concepts.find((x) => x.id === q.conceptId)!;
      expect(q.choices![q.answer as number]).toBe(c.term);
      expect(q.prompt.includes(c.term)).toBe(false);
      expect(new Set(q.choices).size).toBe(q.choices!.length);
    }
  });

  it('참·거짓(거짓) 문항은 다른 개념의 원문을 바꿔 만들었음을 해설에 밝힌다', () => {
    const fake = questions.find((q) => q.generator === 'ox-swap');
    expect(fake?.answer).toBe(false);
    expect(fake?.explanation).toMatch(/바꿔 만든 틀린 문장/);
  });

  it('객관식·빈칸·참거짓을 자동 채점한다', () => {
    const mcq = questions.find((q) => q.type === 'mcq')!;
    expect(gradeObjective(mcq, mcq.answer as number).correct).toBe(true);
    expect(gradeObjective(mcq, ((mcq.answer as number) + 1) % mcq.choices!.length).correct).toBe(false);
    const blank = questions.find((q) => q.type === 'blank' && q.answer === '정적 강화')!;
    expect(gradeObjective(blank, ' 정적강화 ').correct).toBe(true);
    expect(gradeObjective(blank, 'Positive Reinforcement').correct).toBe(true);
    expect(gradeObjective(blank, '강화').correct).toBe(false);
    expect(gradeObjective(blank, '').correct).toBe(false);
  });

  it('서술형은 자기채점 전에는 0점·대기 상태이고, 루브릭 점수로 계산한다', () => {
    const essay = questions.find((q) => q.type === 'essay')!;
    const qs = [{ ...essay, id: 'e1' }];
    const pending = gradeExam({ questions: qs, answers: { e1: '답안' }, essayScores: {} });
    expect(pending.perQuestion.e1.pendingSelfGrade).toBe(true);
    expect(pending.score).toBe(0);
    const graded = gradeExam({ questions: qs, answers: { e1: '답안' }, essayScores: { e1: [1, 2, 1] } });
    expect(graded.score).toBe(4);
    expect(graded.maxScore).toBe(5);
    const report = essayKeywordReport(essay.rubric!, `${concepts.find((c) => c.id === essay.conceptId)!.statement}`);
    expect(report.every((r) => r.suggested === r.points)).toBe(true);
  });

  it('용어 가리기와 카드 생성', () => {
    expect(maskTerm('강화란 행동을 늘리는 것', '강화')).toBe('○○란 행동을 늘리는 것');
    const cards = generateFlashcards(concepts);
    expect(cards.some((c) => c.type === 'term')).toBe(true);
    expect(cards.some((c) => c.type === 'order')).toBe(true);
  });
});

describe('FSRS 간격 반복', () => {
  const now = Date.UTC(2026, 0, 1);
  const DAY = 86_400_000;

  it('목표 유지율 90%에서 간격은 안정도와 같다', () => {
    expect(nextIntervalDays(10)).toBe(10);
    expect(retrievability(10, 10)).toBeCloseTo(0.9, 5);
  });

  it('새 카드: 다시는 분 단위, 보통은 약 4일, 쉬움은 그보다 길다', () => {
    const c = newSchedulingState(now);
    expect(review(c, 1, now).state.due - now).toBe(60_000);
    const good = review(c, 3, now);
    expect(good.scheduledDays).toBe(4);
    expect(review(c, 4, now).scheduledDays).toBeGreaterThan(good.scheduledDays);
  });

  it('복습 카드: 어려움 ≤ 보통 < 쉬움, 다시는 망각 처리', () => {
    const learned = review(newSchedulingState(now), 3, now).state;
    const later = now + 4 * DAY;
    const [h, g, e] = [2, 3, 4].map((r) => review(learned, r as 2 | 3 | 4, later).scheduledDays);
    expect(h).toBeLessThanOrEqual(g);
    expect(g).toBeLessThan(e);
    const again = review(learned, 1, later);
    expect(again.state.state).toBe('relearning');
    expect(again.state.lapses).toBe(1);
    expect(again.state.stability).toBeLessThan(learned.stability);
  });

  it('난이도는 1~10 범위를 벗어나지 않는다', () => {
    let s = newSchedulingState(now);
    let t = now;
    for (let i = 0; i < 20; i++) {
      s = review(s, 1, t).state;
      t += DAY;
    }
    expect(s.difficulty).toBeLessThanOrEqual(10);
    expect(s.difficulty).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_PARAMS.w).toHaveLength(17);
  });
});

describe('백지 복습 비교', () => {
  const concepts = [
    { id: 'a', term: '정적 강화', aliases: ['positive reinforcement'], statement: '정적 강화는 행동 직후 자극을 제시하여 행동의 빈도를 높이는 것을 의미한다.' },
    { id: 'b', term: '소거', aliases: [], statement: '소거는 강화되던 행동에 강화를 제공하지 않아 행동이 감소하는 절차이다.' },
    { id: 'c', term: '조형', aliases: [], statement: '조형은 목표 행동에 점진적으로 가까워지는 행동을 차별 강화하는 방법이다.' },
  ];

  it('정확·부분·누락을 구분하고 빠진 핵심어를 알려 준다', () => {
    const text = '정적강화: 행동 직후에 자극을 제시해서 빈도를 높임.\n소거라는 것도 있었는데 기억이 안 난다.';
    const { results, coverage } = compareBlankReview(text, concepts);
    expect(results.find((r) => r.conceptId === 'a')!.autoVerdict).toBe('correct');
    const b = results.find((r) => r.conceptId === 'b')!;
    expect(b.autoVerdict).toBe('partial');
    expect(b.missingKeywords.length).toBeGreaterThan(0);
    expect(results.find((r) => r.conceptId === 'c')!.autoVerdict).toBe('missing');
    expect(coverage).toBe(0.5);
  });

  it('사용자 판정이 자동 판정보다 우선하고 재시험 간격을 추천한다', () => {
    const { results } = compareBlankReview('정적 강화 자극 제시 빈도', concepts);
    results[0].userVerdict = 'wrong';
    expect(finalBlankCoverage(results)).toBe(0);
    expect(recommendBlankRetryDays(0.3)).toBe(1);
    expect(recommendBlankRetryDays(0.7)).toBe(3);
    expect(recommendBlankRetryDays(0.9)).toBe(7);
  });
});

describe('숙련도·추천', () => {
  const now = Date.UTC(2026, 5, 10);
  const DAY = 86_400_000;

  it('기록이 없으면 처음 보는 개념, 두 번 연속 틀리면 반복 오답', () => {
    expect(computeMastery([], [], now).state).toBe('new');
    const m = computeMastery(
      [
        { at: now - 3 * DAY, questionType: 'mcq', ratio: 1 },
        { at: now - 2 * DAY, questionType: 'mcq', ratio: 0 },
        { at: now - DAY, questionType: 'blank', ratio: 0 },
      ],
      [],
      now,
    );
    expect(m.state).toBe('repeated-wrong');
    expect(m.consecutiveWrong).toBe(2);
  });

  it('객관식은 맞히고 회상 문제를 틀리면 암기 부족으로 분류한다', () => {
    const m = computeMastery(
      [
        { at: 1, questionType: 'mcq', ratio: 1 },
        { at: 2, questionType: 'blank', ratio: 0 },
        { at: 3, questionType: 'ox', ratio: 1 },
        { at: 4, questionType: 'mcq', ratio: 1 },
      ],
      [],
      now,
    );
    expect(m.state).toBe('recall-weak');
  });

  it('추천은 이유를 함께 제공하고 숙달 개념은 제외한다', () => {
    const wrong = computeMastery([{ at: now - 6 * DAY, questionType: 'mcq', ratio: 0 }, { at: now - 5 * DAY, questionType: 'mcq', ratio: 0 }], [], now);
    const mastered = computeMastery([1, 2, 3, 4, 5].map((i) => ({ at: now - i * DAY, questionType: 'mcq' as const, ratio: 1 })), [], now);
    const recs = recommend(
      [
        { id: 'x', term: 'X', importance: 3, mastery: wrong, nextDue: now - 2 * DAY },
        { id: 'y', term: 'Y', importance: 1, mastery: mastered, nextDue: now + DAY },
      ],
      DEFAULT_WEIGHTS,
      now,
    );
    expect(recs.map((r) => r.conceptId)).toEqual(['x']);
    expect(recs[0].reasons.join(' ')).toMatch(/2번 연속 틀렸습니다/);
    expect(recs[0].reasons.join(' ')).toMatch(/5일이 지났습니다/);
    expect(recs[0].action).toBe('quiz');
  });
});

describe('보상·업적·계획', () => {
  it('같은 카드는 하루에 한 번만 복습 경험치 키가 같다', () => {
    const a = rewardForReview('card1', 3, Date.UTC(2026, 0, 1, 1));
    const b = rewardForReview('card1', 4, Date.UTC(2026, 0, 1, 10));
    expect(a.sourceKey).toBe(b.sourceKey);
  });

  it('시험 경험치는 정답률에 비례하고 0점이면 0', () => {
    expect(rewardForExam('t', 0, 10).xp).toBe(0);
    expect(rewardForExam('t', 0.5, 10).xp).toBe(15);
    expect(rewardForExam('t', 1, 10).xp).toBe(40);
    expect(rewardForGameAnswer('q', false, 0)).toBeNull();
  });

  it('레벨 계산과 업적 판정', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, current: 0, needed: 50 });
    expect(levelFromXp(50).level).toBe(2);
    expect(levelFromXp(149).level).toBe(2);
    expect(levelFromXp(150).level).toBe(3);
    const keys = evaluateAchievements({
      studyDays: 7,
      totalAnswers: 1,
      totalReviews: 0,
      blankReviews: 0,
      mistakesResolved: 0,
      bestDocumentAccuracy: null,
      roomSessions: 0,
    });
    expect(keys).toEqual(['first-study', 'days-7']);
  });

  it('시험 대비 계획은 남은 날짜로 하루 분량을 나눈다', () => {
    const now = new Date('2026-06-01T09:00:00').getTime();
    const p = planUntilExam({ examDate: '2026-06-10', now, newCount: 10, weakCount: 4, learningCount: 10 });
    expect(p.daysLeft).toBe(10);
    expect(p.estimatedMinutes).toBe(10 * 8 + 4 * 5 + 10 * 3);
    expect(p.dailyMinutes).toBe(13);
  });
});
