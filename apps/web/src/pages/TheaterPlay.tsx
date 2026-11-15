import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { estimateEpisodeMs } from '@academy/learning-engine';
import { STORY_STYLE_LABEL, type CastId, type DialogueLine } from '@academy/shared';
import { db, touch } from '../storage/db';
import { Card, EmptyState, InfoBox, Loading, PageHeader } from '../components/ui';
import { Stage, type Quality } from '../features/theater/Stage';
import { usePlayback } from '../features/theater/usePlayback';
import { EvidenceModal } from '../features/theater/EvidenceModal';
import { recordProgress, useCastProfiles } from '../features/theater/storyService';
import { speak, speechSupported, stopSpeaking, useKoreanVoices } from '../features/theater/tts';
import { useNow, useProfile } from '../hooks/data';
import { logSession } from '../learning/services';

export function ChoicePanel({ pb, onPicked }: { pb: ReturnType<typeof usePlayback>; onPicked?: (optionId: string) => void }) {
  const scene = pb.scene;
  if (!scene?.choice || !pb.st.awaitingChoice) return null;
  const picked = pb.st.picked;
  return (
    <Card className="space-y-3 border-lavender-deep bg-lavender-soft" as="section">
      <h2 className="font-pixel text-lg font-bold">{scene.choice.prompt}</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {scene.choice.options.map((o) => (
          <button
            key={o.id}
            disabled={!!picked}
            onClick={() => {
              pb.choose(o);
              onPicked?.(o.id);
            }}
            className={`rounded-lg border-2 px-3 py-3 text-left font-bold ${picked?.id === o.id ? (o.correct ? 'border-mint-deep bg-mint' : 'border-pink-deep bg-pink') : picked && o.correct ? 'border-mint-deep bg-mint-soft' : 'border-ink/40 bg-white hover:bg-lavender'}`}
          >
            {o.text}
          </button>
        ))}
      </div>
      {picked && (
        <div className={`rounded-lg p-3 text-sm ${picked.correct ? 'bg-mint-soft' : 'bg-pink-soft'}`} role="status">
          <p className="font-bold">{picked.correct ? '근거에 맞는 선택이에요!' : '다른 개념을 골랐어요. 괜찮아요, 차이를 확인해 봐요.'}</p>
          <p className="mt-1">{picked.feedback}</p>
          <button className="btn-primary btn-sm mt-2" onClick={pb.continueAfterChoice}>
            이야기 계속하기 →
          </button>
        </div>
      )}
    </Card>
  );
}

export default function TheaterPlay() {
  const { id = '' } = useParams();
  const project = useLiveQuery(() => db.storyProjects.get(id), [id]);
  const profiles = useCastProfiles();
  const profile = useProfile();
  const [speed, setSpeed] = useState(1);
  const [auto, setAuto] = useState(true);
  const [quality, setQuality] = useState<Quality>('high');
  const [ttsOn, setTtsOn] = useState(false);
  const [voiceName, setVoiceName] = useState('');
  const [rate, setRate] = useState(1);
  const [evidence, setEvidence] = useState<DialogueLine | null>(null);
  const { voices, ready } = useKoreanVoices();
  const speaking = useRef(false);
  const pb = usePlayback(project?.episode, { speed, auto, holdUntil: () => speaking.current });
  const now = useNow(250);
  const startedAt = useRef(Date.now());
  const saved = useRef(false);

  useEffect(() => {
    if (profile?.settings.reduceMotion) setQuality('low');
  }, [profile?.settings.reduceMotion]);
  useEffect(() => {
    if (project) db.storyProjects.put(touch(project, { lastOpenedAt: Date.now() }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);
  useEffect(() => () => {
    stopSpeaking();
    logSession('reading', startedAt.current, Date.now(), project?.subjectId);
  }, [project?.subjectId]);

  const ttsAvailable = speechSupported() && voices.length > 0;
  const voice = voices.find((v) => v.name === voiceName) ?? voices[0];

  // 대사가 바뀔 때 음성으로 읽기(지원할 때만)
  const line = pb.scene?.lines[pb.st.lineIndex];
  useEffect(() => {
    if (!ttsOn || !ttsAvailable || !pb.st.playing || !line || pb.st.awaitingChoice) return;
    speaking.current = true;
    const vp = line.speaker === 'narrator' ? { pitch: 1, rate: 1 } : profiles[line.speaker as CastId].voice;
    const cancel = speak(line.text, voice, { rate: vp.rate * rate * speed, pitch: vp.pitch }, () => {
      speaking.current = false;
    });
    return () => {
      speaking.current = false;
      cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line?.id, pb.st.sceneId, pb.st.playing, ttsOn]);

  useEffect(() => {
    if (pb.st.outcome && project && !saved.current) {
      saved.current = true;
      recordProgress(project.id, { path: pb.st.path, choices: pb.st.choices, finishedAt: Date.now(), outcome: pb.st.outcome.id });
    }
  }, [pb.st.outcome, project, pb.st.path, pb.st.choices]);

  if (project === undefined) return <Loading />;
  if (!project) return <EmptyState title="작품을 찾을 수 없어요" action={<Link className="btn-primary" to="/theater">이야기 극장으로</Link>} />;
  const ep = project.episode;
  const scene = pb.scene!;

  return (
    <div className="space-y-3">
      <PageHeader
        title={project.title}
        subtitle={`${STORY_STYLE_LABEL[ep.style]} · 예상 ${Math.round(estimateEpisodeMs(ep, speed) / 6000) / 10}분 · ${ep.objectives.map((o) => o.term).join(', ')}`}
        actions={
          <>
            <Link className="btn-ghost btn-sm" to="/theater">
              ← 보관함
            </Link>
            <Link className="btn-ghost btn-sm" to={`/theater/${id}/comic`}>
              만화로 보기
            </Link>
            <Link className="btn-ghost btn-sm" to={`/theater/${id}/edit`}>
              편집
            </Link>
            <Link className="btn-pink btn-sm" to={`/theater/${id}/review`}>
              복습하기
            </Link>
          </>
        }
      />
      <InfoBox tone="milk">
        <b>템플릿 모드</b>로 만든 작품이에요. 이야기 장면과 대사 틀은 미리 만든 템플릿에서 고르고, 학습 내용은 원문 문장을 그대로 씁니다. 말풍선의 <span className="chip bg-butter">원문</span> 표시를 누르면 출처를 볼 수 있어요. (AI 확장 모드는 개발 예정)
      </InfoBox>

      <Stage scene={scene} lineIndex={pb.st.lineIndex} lineElapsed={now - pb.st.lineStartedAt} sceneProgress={pb.sceneProgress(performance.now())} profiles={profiles} quality={quality} running onEvidence={setEvidence} markers />

      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-ghost btn-sm" onClick={pb.prev} aria-label="이전 대사">
          ⏮
        </button>
        <button className="btn-primary" onClick={pb.togglePlay} aria-label={pb.st.playing ? '일시정지' : '재생'}>
          {pb.st.playing ? '⏸ 일시정지' : '▶ 재생'}
        </button>
        <button className="btn-ghost btn-sm" onClick={pb.next} disabled={pb.st.awaitingChoice} aria-label="다음 대사">
          ⏭
        </button>
        <button className="btn-ghost btn-sm" onClick={pb.restart}>
          처음부터
        </button>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 자동 진행
        </label>
        <label className="flex items-center gap-1 text-sm">
          속도
          <select className="input w-auto py-1" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {[0.75, 1, 1.25, 1.5].map((v) => (
              <option key={v} value={v}>
                ×{v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-sm">
          화질
          <select className="input w-auto py-1" value={quality} onChange={(e) => setQuality(e.target.value as Quality)}>
            <option value="high">부드럽게</option>
            <option value="low">가볍게(저사양)</option>
          </select>
        </label>
        <span className="ml-auto text-xs text-ink-soft">
          장면 {ep.scenes.findIndex((s) => s.id === scene.id) + 1}/{ep.scenes.length} · {scene.title}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="tts-controls">
        {ready && !ttsAvailable ? (
          <span className="chip bg-butter" data-testid="subtitle-mode">
            자막 모드 — 이 브라우저에는 한국어 음성이 없어 자막으로 보여 드려요
          </span>
        ) : (
          <>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={ttsOn} onChange={(e) => setTtsOn(e.target.checked)} disabled={!ttsAvailable} /> 음성으로 듣기
            </label>
            {ttsOn && (
              <>
                <select className="input w-auto py-1" value={voice?.name} onChange={(e) => setVoiceName(e.target.value)} aria-label="음성 선택">
                  {voices.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1">
                  음성 속도
                  <input type="range" min={0.7} max={1.4} step={0.05} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
                </label>
              </>
            )}
          </>
        )}
      </div>

      <ChoicePanel pb={pb} />

      {pb.st.finished || pb.st.outcome ? (
        <Card className="space-y-2 text-center">
          <h2 className="font-pixel text-xl font-bold">{pb.st.outcome?.title ?? '이야기 끝'}</h2>
          <p className="text-sm">{pb.st.outcome?.message}</p>
          <ul className="text-left text-sm">
            {ep.objectives.map((o) => (
              <li key={o.conceptId}>🎯 {o.text}</li>
            ))}
          </ul>
          <p className="text-xs text-ink-soft">시청만으로는 숙달로 기록하지 않아요. 복습 활동에서 직접 떠올리고 적용해 봐야 숙련도에 반영돼요.</p>
          <div className="flex justify-center gap-2">
            <Link className="btn-pink" to={`/theater/${id}/review`}>
              복습하러 가기
            </Link>
            <button className="btn-ghost" onClick={() => { saved.current = false; pb.restart(); }}>
              다시 보기
            </button>
          </div>
        </Card>
      ) : null}

      <EvidenceModal line={evidence} onClose={() => setEvidence(null)} sceneTitle={scene.title} />
    </div>
  );
}
