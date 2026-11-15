/** 장면 편집기: 장면 순서·배경·카메라·길이·효과·출연, 대사·표정·포즈·선택지를 고치고 즉시 미리 본다. 자동 저장. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CAST_IDS, IMPLEMENTED_MOTIONS, suggestEmotion, suggestMotion } from '@academy/animation-engine';
import { estimateEpisodeMs, sceneDurationMs, validateEpisode, type StoryIssue } from '@academy/learning-engine';
import { BACKGROUND_LABEL, CAMERA_LABEL, EMOTION_LABEL, MOTION_LABEL, type BackgroundId, type CameraKind, type CastId, type DialogueLine, type Emotion, type MotionId, type StoryEpisode, type StoryScene } from '@academy/shared';
import { db, uuid } from '../storage/db';
import { Card, EmptyState, InfoBox, Loading, PageHeader } from '../components/ui';
import { Stage, FACT_BADGE } from '../features/theater/Stage';
import { EvidenceModal } from '../features/theater/EvidenceModal';
import { saveEpisode, useCastProfiles } from '../features/theater/storyService';
import { useNow } from '../hooks/data';

export default function TheaterEdit() {
  const { id = '' } = useParams();
  const project = useLiveQuery(() => db.storyProjects.get(id), [id]);
  const profiles = useCastProfiles();
  const [ep, setEp] = useState<StoryEpisode | null>(null);
  const [sel, setSel] = useState(0);
  const [lineSel, setLineSel] = useState(0);
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved');
  const [issues, setIssues] = useState<StoryIssue[]>([]);
  const [evidence, setEvidence] = useState<DialogueLine | null>(null);
  const [previewAt, setPreviewAt] = useState(() => performance.now());
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const now = useNow(1000);

  useEffect(() => {
    if (project && !ep) setEp(structuredClone(project.episode));
  }, [project, ep]);

  useEffect(() => {
    if (!ep || !project) return;
    (async () => {
      const concepts = await db.concepts.where('subjectId').equals(project.subjectId).toArray();
      const bank = await db.questions.where('conceptId').anyOf(ep.objectives.map((o) => o.conceptId)).toArray();
      setIssues(validateEpisode(ep, concepts, bank));
    })();
  }, [ep, project]);

  const update = (fn: (draft: StoryEpisode) => void) => {
    setEp((prev) => {
      if (!prev) return prev;
      const draft = structuredClone(prev);
      fn(draft);
      setSaveState('saving');
      clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        await saveEpisode(id, draft, { title: draft.title });
        setSaveState('saved');
      }, 500);
      return draft;
    });
    setPreviewAt(performance.now());
  };

  const scene = ep?.scenes[sel];
  const sceneErrors = useMemo(() => new Map(ep?.scenes.map((s) => [s.id, issues.filter((i) => i.sceneId === s.id).length]) ?? []), [ep, issues]);

  if (project === undefined) return <Loading />;
  if (!project || !ep || !scene) return <EmptyState title="작품을 찾을 수 없어요" action={<Link className="btn-primary" to="/theater">이야기 극장으로</Link>} />;

  const setScene = (patch: Partial<StoryScene>) => update((d) => Object.assign(d.scenes[sel], patch));
  const setLine = (i: number, patch: Partial<DialogueLine>) =>
    update((d) => {
      const l = d.scenes[sel].lines[i];
      if (patch.text !== undefined && patch.text !== l.text && l.fact !== 'fiction') patch.edited = true;
      Object.assign(l, patch);
    });
  const referenced = (sid: string) => ep.scenes.some((s) => s.nextSceneId === sid || s.choice?.options.some((o) => o.nextSceneId === sid)) || ep.startSceneId === sid;
  const line = scene.lines[Math.min(lineSel, scene.lines.length - 1)];

  return (
    <div className="space-y-3">
      <PageHeader
        title="장면 편집기"
        subtitle={`${project.title} · 예상 ${Math.round(estimateEpisodeMs(ep) / 6000) / 10}분`}
        actions={
          <>
            <span className="chip bg-white" aria-live="polite">
              {saveState === 'saving' ? '저장 중…' : '✓ 자동 저장됨'}
            </span>
            <Link className="btn-ghost btn-sm" to={`/theater/${id}/play`}>
              재생
            </Link>
            <Link className="btn-ghost btn-sm" to={`/theater/${id}/comic`}>
              만화
            </Link>
          </>
        }
      />
      <label className="block max-w-xl">
        <span className="label">작품 제목</span>
        <input className="input" value={ep.title} maxLength={60} onChange={(e) => update((d) => (d.title = e.target.value))} />
      </label>

      {issues.length > 0 ? (
        <div className="rounded-xl border-2 border-pink-deep bg-pink-soft p-3 text-sm" role="alert" data-testid="story-issues">
          <p className="font-bold">검증 결과 {issues.filter((i) => i.level === 'error').length}개 오류 · {issues.filter((i) => i.level === 'warning').length}개 확인 필요</p>
          <ul className="mt-1 space-y-0.5">
            {issues.map((i, k) => (
              <li key={k}>
                <button className="text-left underline-offset-2 hover:underline" onClick={() => i.sceneId && setSel(Math.max(0, ep.scenes.findIndex((s) => s.id === i.sceneId)))}>
                  {i.level === 'error' ? '⛔' : '⚠'} {i.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <InfoBox tone="mint">검증 통과 — 학습 대사는 모두 원문 근거가 있고, 모든 분기가 엔딩으로 이어져요.</InfoBox>
      )}

      <div className="grid gap-3 xl:grid-cols-[220px_1fr_360px]">
        <Card className="max-h-[75vh] overflow-y-auto p-2">
          <ol className="space-y-1">
            {ep.scenes.map((s, i) => (
              <li key={s.id}>
                <button onClick={() => { setSel(i); setLineSel(0); }} className={`w-full rounded-lg px-2 py-1.5 text-left text-xs ${i === sel ? 'bg-lavender font-bold' : 'hover:bg-lavender-soft'}`}>
                  {i + 1}. {s.title} {sceneErrors.get(s.id) ? <span className="text-pink-deep">⚠{sceneErrors.get(s.id)}</span> : null}
                  <span className="block font-normal text-ink-soft">{s.beat}{s.choice ? ' · 선택지' : ''}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="mt-2 flex flex-wrap gap-1">
            <button className="btn-ghost btn-sm" disabled={sel === 0} onClick={() => { update((d) => { const [x] = d.scenes.splice(sel, 1); d.scenes.splice(sel - 1, 0, x); }); setSel(sel - 1); }} aria-label="장면 위로">↑</button>
            <button className="btn-ghost btn-sm" disabled={sel === ep.scenes.length - 1} onClick={() => { update((d) => { const [x] = d.scenes.splice(sel, 1); d.scenes.splice(sel + 1, 0, x); }); setSel(sel + 1); }} aria-label="장면 아래로">↓</button>
            <button
              className="btn-ghost btn-sm"
              onClick={() =>
                update((d) => {
                  const src = d.scenes[sel];
                  const copy: StoryScene = { ...structuredClone(src), id: `s-${uuid().slice(0, 8)}`, title: `${src.title} (사본)`, choice: undefined, beat: src.beat === 'choice' ? 'understanding' : src.beat };
                  copy.lines = copy.lines.map((l) => ({ ...l, id: `l-${uuid().slice(0, 8)}` }));
                  copy.nextSceneId = src.choice ? undefined : src.nextSceneId;
                  if (!src.choice) src.nextSceneId = copy.id;
                  d.scenes.splice(sel + 1, 0, copy);
                })
              }
            >
              + 장면 복제
            </button>
            <button
              className="btn-ghost btn-sm"
              disabled={referenced(scene.id) && !(ep.scenes.filter((s) => s.nextSceneId === scene.id).length === 1 && !scene.choice)}
              title="다른 장면이 선택지로 가리키는 장면은 지울 수 없어요"
              onClick={() => {
                update((d) => {
                  const target = d.scenes[sel];
                  for (const s of d.scenes) if (s.nextSceneId === target.id) s.nextSceneId = target.nextSceneId;
                  if (d.startSceneId === target.id && target.nextSceneId) d.startSceneId = target.nextSceneId;
                  d.scenes.splice(sel, 1);
                });
                setSel(Math.max(0, sel - 1));
              }}
            >
              장면 삭제
            </button>
          </div>
          <p className="mt-2 text-[10px] text-ink-soft">재생 순서는 ‘다음 장면’ 연결을 따릅니다. 목록 순서는 편집 편의를 위한 것이에요.</p>
        </Card>

        <div className="space-y-2">
          <Stage scene={scene} lineIndex={lineSel} lineElapsed={now - previewAt} sceneProgress={0.6} profiles={profiles} quality="high" running onEvidence={setEvidence} />
          <p className="text-xs text-ink-soft">대사를 누르면 그 대사로 미리 보기가 바뀌어요. 장면 길이: {Math.round(sceneDurationMs(scene) / 100) / 10}초</p>
        </div>

        <Card className="max-h-[75vh] space-y-3 overflow-y-auto">
          <h2 className="font-bold">장면 설정</h2>
          <label className="block text-sm">
            <span className="label">제목</span>
            <input className="input py-1" value={scene.title} onChange={(e) => setScene({ title: e.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label>
              <span className="label">배경</span>
              <select className="input py-1" value={scene.background} onChange={(e) => setScene({ background: e.target.value as BackgroundId })}>
                {(Object.keys(BACKGROUND_LABEL) as BackgroundId[]).map((b) => (
                  <option key={b} value={b}>
                    {BACKGROUND_LABEL[b]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">카메라</span>
              <select className="input py-1" value={scene.camera.kind} onChange={(e) => setScene({ camera: { ...scene.camera, kind: e.target.value as CameraKind } })}>
                {(Object.keys(CAMERA_LABEL) as CameraKind[]).map((c) => (
                  <option key={c} value={c}>
                    {CAMERA_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">효과</span>
              <select className="input py-1" value={scene.effect ?? 'none'} onChange={(e) => setScene({ effect: e.target.value as StoryScene['effect'] })}>
                <option value="none">없음</option>
                <option value="sparkle">반짝임</option>
                <option value="question">물음표</option>
                <option value="flash">강조</option>
              </select>
            </label>
            <label className="flex items-end gap-1 pb-2">
              <input type="checkbox" checked={scene.camera.shake === 1} onChange={(e) => setScene({ camera: { ...scene.camera, shake: e.target.checked ? 1 : 0 } })} /> 약한 흔들림
            </label>
            <label className="col-span-2">
              <span className="label">장면 길이(초, 비우면 대사량으로 자동)</span>
              <input className="input py-1" type="number" min={2} max={120} value={scene.durationMs ? scene.durationMs / 1000 : ''} onChange={(e) => setScene({ durationMs: e.target.value ? Number(e.target.value) * 1000 : undefined })} />
            </label>
          </div>
          <div>
            <span className="label">출연(최대 3명)</span>
            <div className="flex flex-wrap gap-1">
              {CAST_IDS.map((c) => {
                const on = scene.cast.some((x) => x.id === c);
                return (
                  <button
                    key={c}
                    className={`btn btn-sm ${on ? 'bg-lavender' : 'bg-white'}`}
                    disabled={!on && scene.cast.length >= 3}
                    onClick={() =>
                      update((d) => {
                        const s = d.scenes[sel];
                        const ids = on ? s.cast.filter((x) => x.id !== c).map((x) => x.id) : [...s.cast.map((x) => x.id), c];
                        const slots = ids.length === 1 ? ['center'] : ids.length === 2 ? ['left', 'right'] : ['left', 'center', 'right'];
                        s.cast = ids.map((id, i) => ({ id, slot: slots[i] as 'left', facing: slots[i] === 'right' ? -1 : 1 }));
                      })
                    }
                  >
                    {profiles[c].name}
                  </button>
                );
              })}
            </div>
          </div>

          <h2 className="font-bold">대사</h2>
          {scene.lines.map((l, i) => (
            <div key={l.id} data-fact={l.fact} className={`space-y-1 rounded-lg border-2 p-2 ${i === lineSel ? 'border-lavender-deep bg-lavender-soft' : 'border-ink/15'}`} onFocus={() => setLineSel(i)} onClick={() => setLineSel(i)}>
              <div className="flex flex-wrap items-center gap-1 text-xs">
                <select className="input w-auto py-0.5 text-xs" value={l.speaker} onChange={(e) => setLine(i, { speaker: e.target.value as CastId | 'narrator', kind: e.target.value === 'narrator' ? 'narration' : l.kind === 'narration' ? 'speech' : l.kind })} aria-label="말하는 사람">
                  <option value="narrator">해설</option>
                  {CAST_IDS.map((c) => (
                    <option key={c} value={c}>
                      {profiles[c].name}
                    </option>
                  ))}
                </select>
                <select className="input w-auto py-0.5 text-xs" value={l.kind} onChange={(e) => setLine(i, { kind: e.target.value as DialogueLine['kind'] })} aria-label="대사 종류">
                  <option value="speech">말풍선</option>
                  <option value="thought">생각 풍선</option>
                  <option value="narration">해설·독백</option>
                  <option value="concept-box">개념 상자</option>
                </select>
                <span className={`chip ${FACT_BADGE[l.fact].cls}`}>{FACT_BADGE[l.fact].label}</span>
                {l.edited && l.fact !== 'fiction' && <span className="chip bg-pink">검증 안 됨</span>}
                {l.misconception && <span className="chip bg-pink-soft">오개념 대사</span>}
              </div>
              <textarea className="input py-1 text-sm" rows={2} value={l.text} onChange={(e) => setLine(i, { text: e.target.value })} aria-label="대사" />
              <div className="flex flex-wrap items-center gap-1 text-xs">
                <select className="input w-auto py-0.5 text-xs" value={l.emotion} onChange={(e) => setLine(i, { emotion: e.target.value as Emotion })} aria-label="표정">
                  {(Object.keys(EMOTION_LABEL) as Emotion[]).map((e) => (
                    <option key={e} value={e}>
                      {EMOTION_LABEL[e]}
                    </option>
                  ))}
                </select>
                <select className="input w-auto py-0.5 text-xs" value={l.motion} onChange={(e) => setLine(i, { motion: e.target.value as MotionId })} aria-label="포즈">
                  {IMPLEMENTED_MOTIONS.map((m) => (
                    <option key={m} value={m}>
                      {MOTION_LABEL[m]}
                    </option>
                  ))}
                </select>
                <button className="btn-ghost btn-sm" onClick={() => { const e = suggestEmotion(l.text, l.emotion); setLine(i, { emotion: e, motion: suggestMotion(l.text, e) }); }}>
                  표정 자동 추천
                </button>
                {l.fact !== 'fiction' && (
                  <button className="btn-ghost btn-sm" onClick={() => setLine(i, { fact: 'fiction', evidence: undefined, edited: false })} title="학습 내용이 아니라 이야기 대사로 표시">
                    이야기 설정으로
                  </button>
                )}
                {l.evidence && (
                  <button className="btn-ghost btn-sm" onClick={() => setEvidence(l)}>
                    원문
                  </button>
                )}
                <button className="btn-ghost btn-sm ml-auto" onClick={() => update((d) => { d.scenes[sel].lines.splice(i, 1); })} disabled={scene.lines.length <= 1} aria-label="대사 삭제">
                  ✕
                </button>
              </div>
            </div>
          ))}
          <button
            className="btn-ghost btn-sm"
            onClick={() => update((d) => d.scenes[sel].lines.push({ id: `l-${uuid().slice(0, 8)}`, speaker: scene.cast[0]?.id ?? 'narrator', kind: 'speech', text: '새 대사', emotion: 'joy', motion: 'idle', fact: 'fiction' }))}
          >
            + 대사 추가(이야기 설정)
          </button>

          {scene.choice && (
            <div className="space-y-2 rounded-lg border-2 border-butter-deep/60 bg-butter-soft p-2">
              <h3 className="font-bold">선택지</h3>
              <input className="input py-1 text-sm" value={scene.choice.prompt} onChange={(e) => update((d) => (d.scenes[sel].choice!.prompt = e.target.value))} aria-label="선택지 질문" />
              {scene.choice.options.map((o, oi) => (
                <div key={o.id} className="space-y-1 rounded bg-white p-1.5">
                  <div className="flex items-center gap-1">
                    <input type="radio" name="correct" checked={o.correct} onChange={() => update((d) => d.scenes[sel].choice!.options.forEach((x, k) => (x.correct = k === oi)))} aria-label={`${o.text}을 정답으로`} />
                    <input className="input py-0.5 text-sm" value={o.text} onChange={(e) => update((d) => (d.scenes[sel].choice!.options[oi].text = e.target.value))} aria-label="선택지 문구" />
                  </div>
                  <textarea className="input py-0.5 text-xs" rows={2} value={o.feedback} onChange={(e) => update((d) => (d.scenes[sel].choice!.options[oi].feedback = e.target.value))} aria-label="피드백" />
                </div>
              ))}
            </div>
          )}
          {line && <p className="text-[11px] text-ink-soft">선택한 대사: {line.text.slice(0, 40)}</p>}
        </Card>
      </div>
      <EvidenceModal line={evidence} onClose={() => setEvidence(null)} sceneTitle={scene.title} />
    </div>
  );
}
