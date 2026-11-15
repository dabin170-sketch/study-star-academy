/**
 * 에피소드 → 만화 컷 배치.
 * 한 장면을 대사 1~2줄 단위의 컷으로 나누고, 장면 성격(사건·오해·단서 …)에 따라 구도를 정한다.
 * 연속한 컷이 같은 구도·같은 인물·같은 동작으로 반복되지 않도록 조정한다.
 */
import type { CastId, ComicLayoutKind, DialogueLine, StoryBeat, StoryEpisode, StoryScene } from '@academy/shared';
import { mainPath } from './generate';

export type Framing = 'wide' | 'full' | 'medium' | 'closeup' | 'over-shoulder' | 'object';

export interface ComicPanel {
  key: string;
  sceneId: string;
  beat: StoryBeat;
  framing: Framing;
  background: StoryScene['background'];
  cast: StoryScene['cast'];
  lines: DialogueLine[];
  /** 클로즈업·어깨너머 구도에서 중심 인물 */
  focus?: CastId;
  sfx?: string;
  effect?: StoryScene['effect'];
  /** 마지막 컷: 독자 확인 문제 */
  quiz?: StoryScene['choice'];
}

const BEAT_FRAMES: Record<StoryBeat, Framing[]> = {
  incident: ['wide', 'medium'],
  misunderstanding: ['closeup', 'medium'],
  attempt: ['full', 'wide'],
  consequence: ['over-shoulder', 'closeup'],
  choice: ['object', 'medium'],
  feedback: ['closeup', 'medium'],
  clue: ['object', 'closeup'],
  understanding: ['object', 'over-shoulder', 'medium'],
  resolution: ['wide', 'full'],
  summary: ['object', 'medium'],
  ending: ['wide'],
};

const SFX: Partial<Record<StoryBeat, string>> = { incident: '두둥!', attempt: '휘익—', consequence: '어라?', clue: '반짝!', resolution: '짜잔!', misunderstanding: '척!' };

const PRIORITY: StoryBeat[] = ['understanding', 'incident', 'misunderstanding', 'clue', 'resolution', 'consequence', 'attempt', 'summary', 'feedback', 'ending', 'choice'];

export function buildPanels(ep: StoryEpisode): ComicPanel[] {
  const path = mainPath(ep);
  const panels: ComicPanel[] = [];
  for (const s of path) {
    const chunks: DialogueLine[][] = [];
    let cur: DialogueLine[] = [];
    for (const l of s.lines) {
      // 개념 상자는 따로 한 컷(크게 보여 줌)
      if (l.kind === 'concept-box') {
        if (cur.length) chunks.push(cur);
        chunks.push([l]);
        cur = [];
        continue;
      }
      cur.push(l);
      if (cur.length === 2) {
        chunks.push(cur);
        cur = [];
      }
    }
    if (cur.length) chunks.push(cur);
    chunks.forEach((lines, i) => {
      const frames = BEAT_FRAMES[s.beat];
      let framing: Framing = lines[0].kind === 'concept-box' ? 'object' : frames[i % frames.length];
      const speaker = lines.find((l) => l.speaker !== 'narrator')?.speaker as CastId | undefined;
      const prev = panels[panels.length - 1];
      if (prev && prev.framing === framing && prev.focus === speaker) {
        // 같은 구도 반복 방지
        const alt = (['medium', 'closeup', 'full', 'over-shoulder', 'wide'] as Framing[]).find((f) => f !== framing && f !== 'object');
        framing = alt ?? 'medium';
      }
      panels.push({
        key: `${s.id}-${i}`,
        sceneId: s.id,
        beat: s.beat,
        framing,
        background: s.background,
        cast: s.cast,
        lines,
        focus: speaker,
        sfx: i === 0 ? SFX[s.beat] : undefined,
        effect: i === 0 ? s.effect : undefined,
        quiz: s.choice && i === chunks.length - 1 ? s.choice : undefined,
      });
    });
  }
  return panels;
}

/** 컷 수에 맞게 고른다(1·4·8·12컷). 웹툰·챕터형은 전체 컷. */
export function selectPanels(all: ComicPanel[], layout: ComicLayoutKind): ComicPanel[] {
  const n = layout === '1' ? 1 : layout === '4' ? 4 : layout === '8' ? 8 : layout === '12' ? 12 : all.length;
  if (all.length <= n) return all;
  if (n === 1) return [all.find((p) => p.beat === 'understanding' && p.lines.some((l) => l.kind === 'concept-box')) ?? all[0]];
  if (n === 4) {
    // 기승전결: 사건 → 오해(또는 시도) → 이해 → 해결(또는 정리)
    const pickBeat = (beats: StoryBeat[]) => all.find((p) => beats.includes(p.beat));
    const four = [pickBeat(['incident']), pickBeat(['misunderstanding', 'attempt', 'consequence']), all.find((p) => p.beat === 'understanding' && p.lines.some((l) => l.kind === 'concept-box')) ?? pickBeat(['understanding']), pickBeat(['resolution', 'summary', 'ending'])].filter(Boolean) as ComicPanel[];
    const uniq = [...new Map(four.map((p) => [p.key, p])).values()];
    for (const p of all) if (uniq.length < 4 && !uniq.includes(p)) uniq.push(p);
    return uniq.sort((a, b) => all.indexOf(a) - all.indexOf(b));
  }
  // 우선순위 장면을 먼저 담고, 나머지는 고르게 채운 뒤 원래 순서대로
  const chosen = new Set<ComicPanel>();
  for (const beat of PRIORITY) {
    const p = all.find((x) => x.beat === beat && !chosen.has(x));
    if (p && chosen.size < n) chosen.add(p);
  }
  const step = all.length / n;
  for (let i = 0; chosen.size < n && i < n * 3; i++) chosen.add(all[Math.floor((i * step) % all.length)]);
  return all.filter((p) => chosen.has(p));
}

/** 챕터형: 4컷씩 한 페이지 */
export function paginate(panels: ComicPanel[], perPage = 4): ComicPanel[][] {
  const pages: ComicPanel[][] = [];
  for (let i = 0; i < panels.length; i += perPage) pages.push(panels.slice(i, i + perPage));
  return pages;
}
