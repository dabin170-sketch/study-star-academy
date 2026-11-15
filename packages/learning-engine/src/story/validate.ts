/**
 * 에피소드 검증 — 원문 근거, 출처 변경, 분기 구조, 문항 정답과의 충돌을 검사한다.
 * 오류(error)는 학습 내용이 근거 없이 확정될 위험, 경고(warning)는 사용자가 다시 확인할 부분이다.
 */
import type { StoryEpisode } from '@academy/shared';

export interface StoryIssue {
  level: 'error' | 'warning';
  code: 'missing-evidence' | 'edited-source' | 'quote-mismatch' | 'source-changed' | 'concept-removed' | 'choice-correct-count' | 'dangling-link' | 'unreachable' | 'cycle' | 'no-ending' | 'answer-conflict';
  sceneId?: string;
  lineId?: string;
  message: string;
}

export interface CurrentConcept {
  id: string;
  term: string;
  statement: string;
  status: 'auto' | 'verified' | 'needs-check' | 'rejected';
}

export interface BankQuestion {
  conceptId?: string;
  type: string;
  choices?: string[];
  answer: unknown;
}

const norm = (s: string) => s.replace(/\s+/g, '');

export function validateEpisode(ep: StoryEpisode, concepts: CurrentConcept[], bank: BankQuestion[] = []): StoryIssue[] {
  const issues: StoryIssue[] = [];
  const byId = new Map(ep.scenes.map((s) => [s.id, s]));
  const conceptById = new Map(concepts.map((c) => [c.id, c]));

  for (const s of ep.scenes) {
    for (const l of s.lines) {
      if (l.fact === 'fiction') continue;
      if (!l.evidence) {
        issues.push({ level: 'error', code: 'missing-evidence', sceneId: s.id, lineId: l.id, message: `‘${s.title}’ 장면의 학습 대사에 원문 근거가 없어요. 근거를 연결하거나 ‘이야기 설정’ 대사로 바꿔 주세요.` });
        continue;
      }
      const c = conceptById.get(l.evidence.conceptId);
      if (!c || c.status === 'rejected') {
        issues.push({ level: 'error', code: 'concept-removed', sceneId: s.id, lineId: l.id, message: `‘${s.title}’ 장면이 삭제되었거나 제외된 개념을 근거로 쓰고 있어요.` });
        continue;
      }
      if (l.fact === 'source' && !norm(l.text).includes(norm(l.evidence.quote)) && !norm(l.evidence.quote).includes(norm(l.text))) {
        issues.push({
          level: l.edited ? 'warning' : 'error',
          code: l.edited ? 'edited-source' : 'quote-mismatch',
          sceneId: s.id,
          lineId: l.id,
          message: l.edited ? `‘${s.title}’ 장면의 원문 대사를 고쳤어요. 원문과 뜻이 같은지 확인해 주세요(확인 전에는 ‘검증 안 됨’으로 표시돼요).` : `‘${s.title}’ 장면의 원문 대사가 근거 문장과 달라요.`,
        });
      }
    }
    if (s.choice) {
      const correct = s.choice.options.filter((o) => o.correct);
      if (correct.length !== 1) issues.push({ level: 'error', code: 'choice-correct-count', sceneId: s.id, message: `‘${s.title}’ 선택지의 정답은 정확히 하나여야 해요(지금 ${correct.length}개).` });
      for (const o of s.choice.options) if (!byId.has(o.nextSceneId)) issues.push({ level: 'error', code: 'dangling-link', sceneId: s.id, message: `‘${s.title}’ 선택지 ‘${o.text}’가 없는 장면을 가리켜요.` });
      // 문항 은행과의 정답 충돌: 같은 개념의 객관식 정답 용어와 선택지 정답이 다르면 경고
      const cid = s.choice.conceptId;
      const c = cid ? conceptById.get(cid) : undefined;
      if (c && correct[0] && norm(correct[0].text) !== norm(c.term)) {
        const mcq = bank.find((q) => q.conceptId === cid && q.type === 'mcq');
        issues.push({ level: 'warning', code: 'answer-conflict', sceneId: s.id, message: `‘${s.title}’ 선택지 정답(${correct[0].text})이 개념 용어(${c.term})${mcq ? '·퀴즈 정답' : ''}과 달라요.` });
      }
    } else if (s.nextSceneId && !byId.has(s.nextSceneId)) {
      issues.push({ level: 'error', code: 'dangling-link', sceneId: s.id, message: `‘${s.title}’ 장면 다음 장면이 없어요.` });
    }
  }

  for (const [cid, snap] of Object.entries(ep.conceptSnapshot)) {
    const c = conceptById.get(cid);
    if (c && norm(c.statement) !== norm(snap)) issues.push({ level: 'warning', code: 'source-changed', message: `개념 ‘${c.term}’의 원문 설명이 바뀌었어요. 관련 장면을 다시 검토하거나 이야기를 새로 만들어 주세요.` });
  }

  // 그래프 검사: 도달 가능성, 순환, 엔딩 도달
  const reach = new Set<string>();
  const stack = [ep.startSceneId];
  while (stack.length) {
    const id = stack.pop()!;
    if (reach.has(id) || !byId.has(id)) continue;
    reach.add(id);
    const s = byId.get(id)!;
    if (s.choice) s.choice.options.forEach((o) => stack.push(o.nextSceneId));
    else if (s.nextSceneId) stack.push(s.nextSceneId);
  }
  for (const s of ep.scenes) if (!reach.has(s.id)) issues.push({ level: 'warning', code: 'unreachable', sceneId: s.id, message: `‘${s.title}’ 장면은 어떤 경로로도 도달하지 않아요.` });
  const visiting = new Set<string>();
  const done = new Set<string>();
  let cyclic = false;
  const dfs = (id: string) => {
    if (done.has(id) || cyclic) return;
    if (visiting.has(id)) {
      cyclic = true;
      return;
    }
    visiting.add(id);
    const s = byId.get(id);
    if (s) (s.choice ? s.choice.options.map((o) => o.nextSceneId) : s.nextSceneId ? [s.nextSceneId] : []).forEach(dfs);
    visiting.delete(id);
    done.add(id);
  };
  dfs(ep.startSceneId);
  if (cyclic) issues.push({ level: 'error', code: 'cycle', message: '장면 연결이 원을 그리며 끝나지 않아요. 다음 장면 설정을 확인해 주세요.' });
  if (![...reach].some((id) => byId.get(id)?.beat === 'ending' || (!byId.get(id)?.nextSceneId && !byId.get(id)?.choice)))
    issues.push({ level: 'error', code: 'no-ending', message: '끝나는 장면이 없어요.' });
  return issues;
}
