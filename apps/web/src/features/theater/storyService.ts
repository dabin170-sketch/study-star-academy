/**
 * 이야기 극장 데이터 서비스 — 기존 개념·근거·문항과 연결해 작품을 만들고 저장한다.
 */
import { generateEpisode, validateEpisode, type StoryConcept, type StoryIssue } from '@academy/learning-engine';
import { CAST, type CastProfile } from '@academy/animation-engine';
import type { CastId, ComicLayoutKind, PlaybackProgress, StoryEpisode, StoryLength, StoryProject, StoryStyle } from '@academy/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, entity, touch } from '../../storage/db';

export async function storyConcepts(subjectId: string): Promise<StoryConcept[]> {
  const concepts = await db.concepts.where('subjectId').equals(subjectId).toArray();
  const ev = await db.evidence.where('conceptId').anyOf(concepts.map((c) => c.id)).toArray();
  const first = new Map<string, (typeof ev)[number]>();
  for (const e of ev) if (!first.has(e.conceptId)) first.set(e.conceptId, e);
  return concepts.map((c) => {
    const e = first.get(c.id);
    return {
      id: c.id,
      term: c.term,
      aliases: c.aliases,
      kind: c.kind,
      // 사용자가 고친 개념은 고친 설명을 우선 쓰고, 근거 quote도 그 설명으로 맞춘다(출처 위치는 유지)
      statement: c.statement,
      status: c.status,
      section: c.section.replace(/^(제\s*\d+\s*[장절편부]|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+[.\s]|\d+(\.\d+)*\.?)\s*/, ''),
      evidence: e ? { conceptId: c.id, documentId: e.documentId, chunkId: e.chunkId, pageNumber: e.pageNumber, quote: c.statement } : undefined,
    };
  });
}

export interface CreateInput {
  subjectId: string;
  documentId: string;
  conceptIds: string[];
  format: StoryProject['format'];
  style: StoryStyle | 'auto';
  length: StoryLength;
  cast: CastId[];
  layout: ComicLayoutKind;
  seed?: string;
}

export async function buildEpisode(input: CreateInput): Promise<StoryEpisode> {
  const pool = await storyConcepts(input.subjectId);
  const selected = input.conceptIds.map((id) => pool.find((p) => p.id === id)).filter((x): x is StoryConcept => !!x);
  return generateEpisode(selected, pool, { style: input.style, length: input.length, cast: input.cast, seed: input.seed ?? String(Date.now()) });
}

export async function createProject(input: CreateInput, episode?: StoryEpisode): Promise<StoryProject> {
  const ep = episode ?? (await buildEpisode(input));
  const p: StoryProject = entity({
    subjectId: input.subjectId,
    documentId: input.documentId,
    title: ep.title,
    format: input.format,
    length: input.length,
    episode: ep,
    comicLayout: input.layout,
    lastOpenedAt: Date.now(),
  });
  await db.storyProjects.add(p);
  return p;
}

export async function saveEpisode(projectId: string, episode: StoryEpisode, patch: Partial<Pick<StoryProject, 'title' | 'comicLayout' | 'format'>> = {}) {
  const p = await db.storyProjects.get(projectId);
  if (!p) return;
  await db.storyProjects.put(touch(p, { episode, ...patch }));
}

export async function issuesFor(project: StoryProject): Promise<StoryIssue[]> {
  const concepts = await db.concepts.where('subjectId').equals(project.subjectId).toArray();
  const ids = project.episode.objectives.map((o) => o.conceptId);
  const bank = await db.questions.where('conceptId').anyOf(ids).toArray();
  return validateEpisode(project.episode, concepts, bank);
}

export async function recordProgress(projectId: string, data: Omit<PlaybackProgress, keyof import('@academy/shared').BaseEntity | 'projectId'>) {
  await db.playbackProgress.add(entity({ projectId, ...data }));
}

/** 사용자가 바꾼 캐릭터 이름·색을 반영한 프로필 */
export function useCastProfiles(): Record<CastId, CastProfile> {
  const custom = useLiveQuery(() => db.castCustomizations.toArray(), []) ?? [];
  const out = { ...CAST };
  for (const c of custom) out[c.castId] = { ...CAST[c.castId], name: c.name || CAST[c.castId].name, hair: c.hair || CAST[c.castId].hair, outfit: c.outfit || CAST[c.castId].outfit };
  return out;
}

export async function saveCastCustomization(castId: CastId, patch: { name?: string; hair?: string; outfit?: string }) {
  const existing = await db.castCustomizations.where('castId').equals(castId).first();
  const base = CAST[castId];
  if (existing) await db.castCustomizations.put(touch(existing, patch));
  else await db.castCustomizations.add(entity({ castId, name: patch.name ?? base.name, hair: patch.hair ?? base.hair, outfit: patch.outfit ?? base.outfit }));
}

export async function resetCastCustomization(castId: CastId) {
  await db.castCustomizations.where('castId').equals(castId).delete();
}
