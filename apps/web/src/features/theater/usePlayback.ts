/**
 * 타임라인 재생 엔진. 영상이 아니라 "장면 · 대사 순번 · 대사 시작 시각"으로 진행 상태를 표현한다.
 * 같은 상태를 친구 광장 함께 보기에서 그대로 동기화한다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lineDurationMs, outcomeFor, sceneDurationMs } from '@academy/learning-engine';
import type { ChoiceOption, StoryEpisode, StoryOutcome, StoryScene } from '@academy/shared';

export interface PlaybackState {
  sceneId: string;
  lineIndex: number;
  /** 현재 대사 시작 시각(performance.now 기준) */
  lineStartedAt: number;
  playing: boolean;
  /** 선택지 표시 중 */
  awaitingChoice: boolean;
  /** 방금 고른 선택지 피드백 */
  picked: ChoiceOption | null;
  path: string[];
  choices: Record<string, { optionId: string; correct: boolean }>;
  finished: boolean;
  outcome: StoryOutcome | null;
}

export interface PlaybackOptions {
  speed: number;
  auto: boolean;
  /** TTS가 대사를 읽는 중이면 끝날 때까지 다음으로 넘어가지 않음 */
  holdUntil?: () => boolean;
}

export function usePlayback(ep: StoryEpisode | undefined, opts: PlaybackOptions) {
  const byId = useMemo(() => new Map((ep?.scenes ?? []).map((s) => [s.id, s])), [ep]);
  const [st, setSt] = useState<PlaybackState>(() => initial(ep));
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const pausedElapsed = useRef(0);

  useEffect(() => {
    setSt(initial(ep));
    // 에피소드가 새로 열릴 때만 처음부터(편집 중 내용 변경은 위치 유지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ep?.startSceneId]);

  const scene: StoryScene | undefined = byId.get(st.sceneId) ?? ep?.scenes[0];

  const goScene = useCallback(
    (id: string | undefined) => {
      setSt((s) => {
        if (!id || !byId.get(id)) {
          const total = Object.keys(s.choices).length;
          const correct = Object.values(s.choices).filter((c) => c.correct).length;
          return { ...s, playing: false, finished: true, outcome: ep ? outcomeFor(ep, correct, total) : null };
        }
        const next = byId.get(id)!;
        const finished = next.beat === 'ending';
        const total = Object.keys(s.choices).length;
        const correct = Object.values(s.choices).filter((c) => c.correct).length;
        return { ...s, sceneId: id, lineIndex: 0, lineStartedAt: performance.now(), awaitingChoice: false, picked: null, path: [...s.path, id], outcome: finished && ep ? outcomeFor(ep, correct, total) : s.outcome, finished: false };
      });
    },
    [byId, ep],
  );

  const next = useCallback(() => {
    setSt((s) => {
      const sc = byId.get(s.sceneId);
      if (!sc || s.awaitingChoice) return s;
      if (s.lineIndex < sc.lines.length - 1) return { ...s, lineIndex: s.lineIndex + 1, lineStartedAt: performance.now() };
      if (sc.choice) return { ...s, awaitingChoice: true };
      if (sc.beat === 'ending' || !sc.nextSceneId) {
        const total = Object.keys(s.choices).length;
        const correct = Object.values(s.choices).filter((c) => c.correct).length;
        return { ...s, playing: false, finished: true, outcome: ep ? outcomeFor(ep, correct, total) : null };
      }
      const n = byId.get(sc.nextSceneId);
      if (!n) return { ...s, playing: false, finished: true };
      return { ...s, sceneId: n.id, lineIndex: 0, lineStartedAt: performance.now(), path: [...s.path, n.id] };
    });
  }, [byId, ep]);

  const prev = useCallback(() => {
    setSt((s) => (s.lineIndex > 0 ? { ...s, lineIndex: s.lineIndex - 1, lineStartedAt: performance.now() } : s));
  }, []);

  const choose = useCallback(
    (option: ChoiceOption) => {
      setSt((s) => ({ ...s, picked: option, choices: { ...s.choices, [s.sceneId]: { optionId: option.id, correct: option.correct } } }));
    },
    [],
  );

  const continueAfterChoice = useCallback(() => {
    const opt = st.picked;
    if (opt) goScene(opt.nextSceneId);
  }, [st.picked, goScene]);

  const togglePlay = useCallback(() => {
    setSt((s) => {
      if (s.playing) {
        pausedElapsed.current = performance.now() - s.lineStartedAt;
        return { ...s, playing: false };
      }
      return { ...s, playing: true, lineStartedAt: performance.now() - pausedElapsed.current };
    });
  }, []);

  const restart = useCallback(() => setSt({ ...initial(ep), playing: true }), [ep]);

  const jump = useCallback((sceneId: string, lineIndex = 0) => setSt((s) => ({ ...s, sceneId, lineIndex, lineStartedAt: performance.now(), awaitingChoice: false, picked: null, finished: false })), []);

  /** 외부(함께 보기 방장)에서 받은 상태를 적용 */
  const applyRemote = useCallback((sceneId: string, lineIndex: number, startedAtLocal: number, playing: boolean) => {
    setSt((s) => ({ ...s, sceneId, lineIndex, lineStartedAt: startedAtLocal, playing, awaitingChoice: false, finished: false, picked: s.sceneId === sceneId ? s.picked : null, path: s.path[s.path.length - 1] === sceneId ? s.path : [...s.path, sceneId] }));
  }, []);

  // 자동 진행
  useEffect(() => {
    if (!scene || !st.playing || !optsRef.current.auto || st.awaitingChoice || st.finished) return;
    const line = scene.lines[st.lineIndex];
    if (!line) return;
    const dur = lineDurationMs(line, optsRef.current.speed);
    const remaining = Math.max(0, dur - (performance.now() - st.lineStartedAt));
    let timer = setTimeout(function tick() {
      if (optsRef.current.holdUntil?.()) {
        timer = setTimeout(tick, 200);
        return;
      }
      next();
    }, remaining);
    return () => clearTimeout(timer);
  }, [scene, st.playing, st.lineIndex, st.sceneId, st.awaitingChoice, st.finished, st.lineStartedAt, next, opts.auto, opts.speed]);

  const sceneProgress = (now: number) => {
    if (!scene) return 0;
    const total = sceneDurationMs(scene, opts.speed) || 1;
    const before = scene.lines.slice(0, st.lineIndex).reduce((a, l) => a + lineDurationMs(l, opts.speed), 0);
    return Math.min(1, (before + (st.playing ? now - st.lineStartedAt : 0)) / total);
  };

  return { st, scene, next, prev, choose, continueAfterChoice, togglePlay, restart, jump, applyRemote, sceneProgress, setSt };
}

function initial(ep: StoryEpisode | undefined): PlaybackState {
  return { sceneId: ep?.startSceneId ?? '', lineIndex: 0, lineStartedAt: performance.now(), playing: false, awaitingChoice: false, picked: null, path: ep ? [ep.startSceneId] : [], choices: {}, finished: false, outcome: null };
}
