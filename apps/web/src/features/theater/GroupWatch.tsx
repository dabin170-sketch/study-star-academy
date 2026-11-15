/**
 * 친구 광장 함께 보기.
 * 방장의 재생 엔진이 장면·대사 순번·대사 시작 시각을 서버로 보내고(타임라인 이벤트), 참가자는 같은 장면을
 * 자기 기기에서 실시간으로 그린다. 영상 스트리밍이 아니다. 선택지는 모두가 투표해 다수결로 정한다.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { RoomState, StoryEpisode } from '@academy/shared';
import { db } from '../../storage/db';
import { Card, InfoBox } from '../../components/ui';
import { Stage } from './Stage';
import { usePlayback } from './usePlayback';
import { useCastProfiles } from './storyService';
import type { useRoomConnection } from '../../realtime/client';

type Conn = ReturnType<typeof useRoomConnection>;

export function GroupWatch({ conn, state, isHost, myId }: { conn: Conn; state: RoomState; isHost: boolean; myId: string }) {
  const profiles = useCastProfiles();
  const projects = useLiveQuery(() => db.storyProjects.orderBy('updatedAt').reverse().toArray(), []);
  const remote = state.playback;
  const episode = (remote && conn.playEpisode?.version === remote.version ? (conn.playEpisode.episode as StoryEpisode) : undefined) ?? undefined;
  const pb = usePlayback(episode, { speed: 1, auto: isHost });
  const lastSent = useRef('');

  // 방장: 재생 상태가 바뀔 때마다 서버로 보낸다(대사 단위 이벤트)
  useEffect(() => {
    if (!isHost || !episode || !pb.scene) return;
    const lineIndex = pb.st.awaitingChoice ? pb.scene.lines.length : pb.st.lineIndex;
    const key = `${pb.st.sceneId}:${lineIndex}:${pb.st.playing}`;
    if (key === lastSent.current) return;
    lastSent.current = key;
    conn.playControl(pb.st.sceneId, lineIndex, pb.st.playing, performance.now() - pb.st.lineStartedAt);
  }, [isHost, episode, pb.scene, pb.st.sceneId, pb.st.lineIndex, pb.st.playing, pb.st.awaitingChoice, pb.st.lineStartedAt, conn]);

  // 참가자: 서버 상태를 따라간다(서버 시각과의 차이를 보정)
  useEffect(() => {
    if (isHost || !remote || !episode) return;
    const serverAgo = conn.serverNow() - remote.lineStartedAt;
    pb.applyRemote(remote.sceneId, remote.lineIndex, performance.now() - serverAgo, remote.playing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, remote?.sceneId, remote?.lineIndex, remote?.playing, remote?.lineStartedAt, episode]);

  // 방장: 투표 결과가 나오면 그 선택으로 진행
  useEffect(() => {
    if (!isHost || !remote?.decision || !pb.scene?.choice || remote.decision.sceneId !== pb.scene.id || pb.st.picked) return;
    const opt = pb.scene.choice.options.find((o) => o.id === remote.decision!.optionId);
    if (opt) pb.choose(opt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, remote?.decision, pb.scene?.id]);

  const scene = pb.scene;
  const showChoice = !!scene?.choice && (isHost ? pb.st.awaitingChoice : remote?.lineIndex === scene.lines.length);
  const decision = remote?.decision && remote.decision.sceneId === scene?.id ? remote.decision : null;
  const decidedOpt = decision ? scene?.choice?.options.find((o) => o.id === decision.optionId) : null;
  const myVote = useMemo(() => (remote?.votes?.voters.includes(myId) ? true : false), [remote?.votes, myId]);

  if (!remote) {
    return (
      <Card className="space-y-2" as="section">
        <h2 className="font-bold">함께 보기 — 이야기 극장</h2>
        {isHost ? (
          projects && projects.length ? (
            <>
              <p className="text-sm text-ink-soft">내 작품을 골라 친구들과 같은 장면을 함께 봐요. 원본 자료가 아니라 작품 대본(대사·장면)만 서버로 보내요.</p>
              <div className="flex flex-wrap gap-2">
                {projects.map((p) => (
                  <button key={p.id} className="btn-ghost btn-sm" onClick={() => conn.playLoad(p.title, p.episode)}>
                    ▶ {p.title}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-soft">이야기 극장에서 작품을 먼저 만들어 주세요.</p>
          )
        ) : (
          <p className="text-sm text-ink-soft">방장이 작품을 고르면 여기에서 함께 볼 수 있어요.</p>
        )}
      </Card>
    );
  }

  if (!episode || !scene)
    return (
      <Card>
        <p className="text-sm">‘{remote.title}’ 대본을 받는 중…</p>
      </Card>
    );

  return (
    <Card className="space-y-2" as="section" >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-bold">함께 보기: {remote.title}</h2>
        <span className="chip bg-mint">{remote.playing ? '재생 중' : '일시정지'}</span>
        {isHost && (
          <>
            <button className="btn-primary btn-sm" onClick={pb.togglePlay}>
              {pb.st.playing ? '⏸ 일시정지' : '▶ 함께 재생'}
            </button>
            <button className="btn-ghost btn-sm" onClick={pb.next} disabled={pb.st.awaitingChoice}>
              다음 ⏭
            </button>
            <button className="btn-ghost btn-sm" onClick={conn.playStop}>
              그만 보기
            </button>
          </>
        )}
      </div>
      <div data-testid="group-stage">
        <Stage scene={scene} lineIndex={Math.min(pb.st.lineIndex, scene.lines.length - 1)} lineElapsed={0} sceneProgress={pb.sceneProgress(performance.now())} profiles={profiles} quality="high" running />
      </div>
      {showChoice && scene.choice && (
        <div className="space-y-2 rounded-lg bg-lavender-soft p-3">
          <p className="font-bold">{scene.choice.prompt}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {scene.choice.options.map((o) => (
              <button
                key={o.id}
                disabled={!!decision}
                onClick={() => conn.playVote(scene.id, o.id)}
                className={`rounded-lg border-2 px-3 py-2 text-left font-bold ${decision?.optionId === o.id ? (o.correct ? 'border-mint-deep bg-mint' : 'border-pink-deep bg-pink') : 'border-ink/30 bg-white hover:bg-lavender'}`}
              >
                {o.text} {remote.votes?.counts[o.id] ? <span className="text-xs font-normal">· {remote.votes.counts[o.id]}표</span> : null}
              </button>
            ))}
          </div>
          {!decision && <p className="text-xs text-ink-soft">{myVote ? '투표했어요. 다른 친구들을 기다리는 중…' : '모두 투표하거나 20초가 지나면 다수결로 정해져요.'}</p>}
          {decidedOpt && (
            <div className={`rounded p-2 text-sm ${decidedOpt.correct ? 'bg-mint-soft' : 'bg-pink-soft'}`} role="status">
              <b>함께 고른 답: {decidedOpt.text}</b> — {decidedOpt.feedback}
              {isHost && (
                <button className="btn-primary btn-sm ml-2" onClick={pb.continueAfterChoice}>
                  이야기 계속하기
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <InfoBox tone="milk">연결이 끊겼다 돌아오면 지금 장면으로 다시 맞춰져요. 역할극·번갈아 설명하기 모드는 개발 예정이에요.</InfoBox>
    </Card>
  );
}
