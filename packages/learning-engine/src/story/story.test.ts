import { describe, expect, it } from 'vitest';
import type { CastId, StoryEpisode } from '@academy/shared';
import { estimateEpisodeMs, generateEpisode, lineDurationMs, mainPath, outcomeFor, pickStyle, type StoryConcept } from './generate';
import { validateEpisode } from './validate';
import { buildPanels, paginate, selectPanels } from './comic';
import { josa, quoted } from './josa';

const ev = (id: string, quote: string) => ({ conceptId: id, documentId: 'd1', chunkId: `ch-${id}`, pageNumber: 2, quote });
const C = (id: string, term: string, statement: string, kind: StoryConcept['kind'] = 'definition'): StoryConcept => ({
  id,
  term,
  aliases: [],
  kind,
  statement,
  status: 'auto',
  section: '1. 강화와 벌',
  evidence: ev(id, statement),
});

const pool = [
  C('a', '정적 강화', '정적 강화는 행동 직후 자극을 제시하여 행동의 빈도를 높이는 것을 의미한다.'),
  C('b', '부적 강화', '부적 강화는 행동 직후 불쾌한 자극을 제거하여 행동의 빈도를 높이는 것을 의미한다.'),
  C('c', '소거', '소거는 강화되던 행동에 강화를 제공하지 않아 행동이 감소하는 과정을 말한다.'),
  C('d', '벌', '벌이란 행동 뒤에 따르는 결과로 인해 그 행동이 일어날 가능성이 감소하는 현상을 말한다.'),
];
const ALL: CastId[] = ['hana', 'doto', 'mungchi', 'seoyun', 'rio', 'kangha'];

function make(length: 30 | 60 | 180 | 300 | 600 = 180, seed = 's1', cast = ALL): StoryEpisode {
  return generateEpisode(pool.slice(0, 3), pool, { style: 'auto', length, cast, seed });
}

describe('조사', () => {
  it('받침에 맞는 조사를 붙인다', () => {
    expect(josa('강화', '을/를')).toBe('강화를');
    expect(josa('벌', '을/를')).toBe('벌을');
    expect(josa('소거', '으로/로')).toBe('소거로');
    expect(josa('규칙', '으로/로')).toBe('규칙으로');
    expect(josa('교실', '으로/로')).toBe('교실로');
    expect(quoted('벌', '이랑/랑')).toBe('‘벌’이랑');
  });
});

describe('스토리 생성', () => {
  const ep = make();

  it('행동중재 개념은 탐정 사건으로 고르고, 법령 개념은 모의 재판으로 고른다', () => {
    expect(ep.style).toBe('detective');
    expect(pickStyle([C('x', '개별화교육지원팀', '특수교육법 제22조에 따라 구성하는 팀을 말한다.')])).toBe('courtroom');
    expect(pickStyle([C('y', '유형', '장애의 유형에는 A, B가 있다.', 'classification')])).toBe('sorting');
  });

  it('학습 대사(source·derived)는 모두 원문 근거를 가지고, source 대사는 원문과 같다', () => {
    const learning = ep.scenes.flatMap((s) => s.lines).filter((l) => l.fact !== 'fiction');
    expect(learning.length).toBeGreaterThan(3);
    for (const l of learning) {
      expect(l.evidence).toBeDefined();
      if (l.fact === 'source') expect(l.text).toBe(l.evidence!.quote);
    }
  });

  it('사건 → 오해 → 시도 → 결과 → 선택 → 단서 → 이해 → 해결 → 정리 순서를 따른다', () => {
    const beats = mainPath(ep).map((s) => s.beat);
    const firstAct = beats.slice(0, beats.indexOf('resolution') + 1);
    const order = ['incident', 'misunderstanding', 'attempt', 'consequence', 'choice', 'feedback', 'clue', 'understanding', 'resolution'];
    let last = -1;
    for (const b of firstAct.slice(1)) {
      const i = order.indexOf(b);
      expect(i).toBeGreaterThanOrEqual(last);
      last = i;
    }
    expect(beats[beats.length - 2]).toBe('summary');
    expect(beats[beats.length - 1]).toBe('ending');
  });

  it('오개념 대사 다음에는 다른 개념의 원문으로 바로잡는 장면이 온다', () => {
    const scenes = mainPath(ep);
    const mis = scenes.findIndex((s) => s.lines.some((l) => l.misconception));
    expect(mis).toBeGreaterThanOrEqual(0);
    const after = scenes.slice(mis + 1, mis + 4);
    expect(after.some((s) => s.beat === 'consequence' && s.lines.some((l) => l.fact === 'source'))).toBe(true);
  });

  it('선택지: 정답 하나, 정답·오답 모두 같은 다음 본 장면(단서·이해)으로 합류한다', () => {
    const choices = ep.scenes.filter((s) => s.choice);
    expect(choices.length).toBe(2);
    const byId = new Map(ep.scenes.map((s) => [s.id, s]));
    for (const s of choices) {
      expect(s.choice!.options.filter((o) => o.correct)).toHaveLength(1);
      const targets = new Set(s.choice!.options.map((o) => byId.get(o.nextSceneId)!.nextSceneId));
      expect(targets.size).toBe(1);
      expect(['clue', 'understanding']).toContain(byId.get([...targets][0]!)!.beat);
      for (const o of s.choice!.options.filter((x) => !x.correct)) expect(o.feedback).toMatch(/원문/);
    }
  });

  it('검증 문제가 없다', () => {
    const issues = validateEpisode(ep, pool.map((p) => ({ id: p.id, term: p.term, statement: p.statement, status: 'auto' as const })));
    expect(issues.map((i) => i.message)).toEqual([]);
  });

  it('seed가 다르면 대사·화자 조합이 달라진다(반복 패턴 방지)', () => {
    const texts = (e: StoryEpisode) => e.scenes.flatMap((s) => s.lines.filter((l) => l.fact === 'fiction').map((l) => l.text)).join('|');
    const variants = new Set(['s1', 's2', 's3', 's4', 's5'].map((s) => texts(make(180, s))));
    expect(variants.size).toBeGreaterThan(2);
  });

  it('조사가 어색한 문장(“‘벌’를” 등)을 만들지 않는다', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const e = generateEpisode([pool[3], pool[2]], pool, { style: 'detective', length: 300, cast: ALL, seed });
      const all = e.scenes.flatMap((s) => s.lines.map((l) => l.text)).join('\n');
      expect(all).not.toMatch(/‘벌’(를|는|가|와|랑|로|라)/);
      expect(all).not.toMatch(/‘소거’(을|은|이|과|이랑|으로|이라)/);
    }
  });

  it('캐릭터를 일부만 골라도 모든 역할이 고른 캐릭터에게 배정된다', () => {
    const e = make(180, 's1', ['hana', 'doto']);
    const speakers = new Set(e.scenes.flatMap((s) => s.lines.map((l) => l.speaker)).filter((x) => x !== 'narrator'));
    expect([...speakers].every((sp) => ['hana', 'doto'].includes(sp))).toBe(true);
  });

  it('길이 옵션에 따라 장면 수와 예상 길이가 늘어난다', () => {
    const short = make(30);
    const long = make(300);
    expect(mainPath(short).length).toBeLessThan(mainPath(long).length);
    expect(estimateEpisodeMs(short)).toBeLessThan(estimateEpisodeMs(long));
    expect(lineDurationMs({ text: '가'.repeat(10), kind: 'speech' }, 2)).toBeCloseTo(lineDurationMs({ text: '가'.repeat(10), kind: 'speech' }) / 2);
  });

  it('근거가 확인되지 않은 개념만 있으면 이야기를 만들지 않는다', () => {
    expect(() => generateEpisode([{ ...pool[0], status: 'needs-check' }], pool, { style: 'auto', length: 60, cast: ALL, seed: 'x' })).toThrow(/근거/);
  });

  it('엔딩은 정답 비율로 정한다', () => {
    expect(outcomeFor(ep, 2, 2).id).toBe('full');
    expect(outcomeFor(ep, 1, 2).id).toBe('partial');
    expect(outcomeFor(ep, 0, 2).id).toBe('more');
  });
});

describe('검증 경고', () => {
  const concepts = pool.map((p) => ({ id: p.id, term: p.term, statement: p.statement, status: 'auto' as const }));

  it('원문 근거 없는 학습 대사, 고친 원문 대사, 바뀐 원문, 깨진 연결을 잡아낸다', () => {
    const ep = structuredClone(make());
    const und = ep.scenes.find((s) => s.beat === 'understanding')!;
    const src = und.lines.find((l) => l.fact === 'source')!;
    src.text = '강화는 그냥 칭찬하는 것이다.';
    src.edited = true;
    und.lines.push({ id: 'x', speaker: 'hana', kind: 'speech', text: '이건 법으로 정해져 있어요.', emotion: 'focused', motion: 'explain', fact: 'source' });
    ep.scenes[0].nextSceneId = 'nowhere';
    const changed = concepts.map((c) => (c.id === 'a' ? { ...c, statement: c.statement + ' (수정됨)' } : c));
    const codes = validateEpisode(ep, changed).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['edited-source', 'missing-evidence', 'source-changed', 'dangling-link']));
  });

  it('정답이 두 개인 선택지와 순환 연결을 잡아낸다', () => {
    const ep = structuredClone(make());
    const ch = ep.scenes.find((s) => s.choice)!;
    ch.choice!.options.forEach((o) => (o.correct = true));
    const last = ep.scenes[ep.scenes.length - 1];
    last.nextSceneId = ep.startSceneId;
    const codes = validateEpisode(ep, concepts).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['choice-correct-count', 'cycle']));
  });
});

describe('만화 컷', () => {
  const ep = make(300);
  const all = buildPanels(ep);

  it('1·4·8·12컷을 만들고, 4컷은 기승전결(사건→오해→이해→해결)을 담는다', () => {
    expect(selectPanels(all, '1')).toHaveLength(1);
    expect(selectPanels(all, '1')[0].lines[0].kind).toBe('concept-box');
    const four = selectPanels(all, '4');
    expect(four.map((p) => p.beat)).toEqual(['incident', 'misunderstanding', 'understanding', 'resolution']);
    expect(selectPanels(all, '8')).toHaveLength(8);
    expect(selectPanels(all, '12')).toHaveLength(12);
    expect(selectPanels(all, 'webtoon')).toHaveLength(all.length);
    expect(paginate(all).every((p) => p.length <= 4)).toBe(true);
  });

  it('연속한 컷이 같은 구도·같은 인물로 반복되지 않는다', () => {
    for (let i = 1; i < all.length; i++) {
      const a = all[i - 1];
      const b = all[i];
      expect(a.framing === b.framing && a.focus === b.focus && a.framing !== 'object').toBe(false);
    }
  });
});
