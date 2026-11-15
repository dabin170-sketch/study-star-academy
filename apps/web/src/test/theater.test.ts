import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { buildPanels, selectPanels } from '@academy/learning-engine';
import { AcademyDB, db, useDatabase } from '../storage/db';
import { loadSampleDocument } from '../learning/sample';
import { createProject, issuesFor, saveEpisode, storyConcepts } from '../features/theater/storyService';
import { updateConcept } from '../features/import/importDocument';
import { exportBackup, importBackup, wipeAllData } from '../storage/backup';
import { recordAnswer } from '../learning/services';

let n = 0;
beforeEach(async () => {
  useDatabase(`theater-${n++}`);
  await db.open();
});

async function makeProject() {
  const docId = await loadSampleDocument();
  const doc = (await db.documents.get(docId))!;
  const concepts = await storyConcepts(doc.subjectId);
  const pick = concepts.filter((c) => ['정적 강화', '부적 강화'].includes(c.term)).map((c) => c.id);
  return createProject({ subjectId: doc.subjectId, documentId: docId, conceptIds: pick, format: 'animation', style: 'auto', length: 180, cast: ['hana', 'doto', 'mungchi', 'seoyun', 'rio', 'kangha'], layout: '4', seed: 'test' });
}

describe('이야기 극장 — 자료에서 작품까지', () => {
  it('PDF(예시 자료) 개념으로 작품을 만들고, 학습 대사는 원문 근거(문서·쪽)와 연결된다', async () => {
    const p = await makeProject();
    expect(p.episode.objectives.map((o) => o.term).sort()).toEqual(['부적 강화', '정적 강화']);
    const learning = p.episode.scenes.flatMap((s) => s.lines).filter((l) => l.fact !== 'fiction');
    expect(learning.length).toBeGreaterThan(4);
    for (const l of learning) {
      expect(l.evidence!.documentId).toBe(p.documentId);
      expect(await db.chunks.get(l.evidence!.chunkId)).toBeDefined();
    }
    expect(await issuesFor(p)).toEqual([]);
    // 4·8·12컷 구성
    const all = buildPanels(p.episode);
    expect(selectPanels(all, '4')).toHaveLength(4);
    expect(selectPanels(all, '8')).toHaveLength(8);
    expect(selectPanels(all, '12').length).toBe(Math.min(12, all.length));
  });

  it('장면을 고쳐 저장하면 다시 열어도 그대로이고, 원문 대사를 고치면 검증 경고가 생긴다', async () => {
    const p = await makeProject();
    const ep = structuredClone(p.episode);
    const und = ep.scenes.find((s) => s.beat === 'understanding')!;
    const src = und.lines.find((l) => l.fact === 'source')!;
    src.text = '정적 강화는 칭찬하는 것이다.';
    src.edited = true;
    und.lines[0].emotion = 'surprised';
    und.background = 'park';
    await saveEpisode(p.id, ep, { title: '내가 고친 작품' });
    const reopened = (await db.storyProjects.get(p.id))!;
    expect(reopened.title).toBe('내가 고친 작품');
    const und2 = reopened.episode.scenes.find((s) => s.id === und.id)!;
    expect(und2.background).toBe('park');
    expect(und2.lines[0].emotion).toBe('surprised');
    const codes = (await issuesFor(reopened)).map((i) => i.code);
    expect(codes).toContain('edited-source');
  });

  it('도서관에서 개념 원문을 바꾸면 관련 작품에 재검토 경고가 뜬다', async () => {
    const p = await makeProject();
    const cid = p.episode.objectives[0].conceptId;
    await updateConcept(cid, { statement: '정적 강화는 바람직한 행동 직후 좋아하는 자극을 주어 그 행동을 늘리는 것이다.' });
    expect((await issuesFor((await db.storyProjects.get(p.id))!)).map((i) => i.code)).toContain('source-changed');
  });

  it('복습 퀴즈 결과는 기존 학습 기록·오답 노트에 저장된다', async () => {
    const p = await makeProject();
    const q = (await db.questions.where('conceptId').equals(p.episode.objectives[0].conceptId).filter((x) => x.type === 'mcq').first())!;
    await recordAnswer({ question: q, value: ((q.answer as number) + 1) % q.choices!.length, source: 'quiz', responseMs: 900 });
    expect(await db.answers.where('questionId').equals(q.id).count()).toBe(1);
    expect(await db.mistakes.where('questionId').equals(q.id).count()).toBe(1);
  });

  it('작품도 백업·복원된다', async () => {
    const p = await makeProject();
    const b = await exportBackup(false);
    expect(b.backupVersion).toBe(3);
    await wipeAllData();
    await importBackup(JSON.parse(JSON.stringify(b)));
    expect((await db.storyProjects.get(p.id))?.title).toBe(p.title);
  });
});

describe('DB 마이그레이션 v1 → v2', () => {
  it('기존(v1) 데이터는 그대로 두고 이야기 극장 테이블만 추가한다', async () => {
    const name = `migrate-${Date.now()}`;
    const old = new Dexie(name);
    old.version(1).stores({ profile: 'id', subjects: 'id, updatedAt', concepts: 'id, documentId, subjectId, status, term' });
    await old.open();
    await old.table('subjects').add({ id: 's1', name: '특수교육', updatedAt: 1 });
    await old.table('concepts').add({ id: 'c1', term: '강화', subjectId: 's1', documentId: 'd', status: 'auto' });
    old.close();
    const upgraded = new AcademyDB(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(2);
    expect((await upgraded.subjects.get('s1'))?.name).toBe('특수교육');
    expect((await upgraded.concepts.get('c1'))?.term).toBe('강화');
    expect(await upgraded.storyProjects.count()).toBe(0);
    upgraded.close();
  });
});
