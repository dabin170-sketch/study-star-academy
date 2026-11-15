import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { ROOM_MAX_PARTICIPANTS, type CharacterId, type PublicParticipant, type StudyRoomLocal } from '@academy/shared';
import { db, uuid } from '../storage/db';
import { Card, ErrorBox, InfoBox, PageHeader, formatDuration } from '../components/ui';
import { PixelBuilding } from '../components/PixelBuilding';
import { CHARACTERS, PixelCharacter } from '../components/PixelCharacter';
import { ApiError, SERVER_URL, checkHealth, createRoom, joinRoom, useRoomConnection } from '../realtime/client';
import { logSession } from '../learning/services';
import { useCurrentSubject, useNow, useProfile } from '../hooks/data';
import { GroupWatch } from '../features/theater/GroupWatch';
import { toast } from '../stores/ui';

const STATUS_LABEL = { studying: '공부 중', break: '휴식 중', idle: '대기' } as const;

function ConnBadge({ status }: { status: ReturnType<typeof useRoomConnection>['status'] }) {
  const map = {
    connecting: ['bg-butter', '연결 중…'],
    connected: ['bg-mint', '실시간 연결됨'],
    reconnecting: ['bg-pink', '연결 끊김 — 다시 연결하는 중'],
    disconnected: ['bg-ink-faint/40', '연결 안 됨'],
    'room-lost': ['bg-pink', '방이 사라졌어요'],
  } as const;
  const [cls, text] = map[status];
  return (
    <span className={`chip ${cls}`} role="status" aria-live="polite">
      {text}
    </span>
  );
}

function ParticipantCard({ p, now, me }: { p: PublicParticipant; now: number; me: boolean }) {
  const studied = p.accumulatedMs + (p.studyingSince ? Math.max(0, now - p.studyingSince) : 0);
  return (
    <div className={`card flex flex-col items-center p-3 text-center ${!p.connected ? 'opacity-60' : ''} ${me ? 'ring-2 ring-lavender-deep' : ''}`}>
      <PixelCharacter id={p.characterId} size={56} animate={p.status === 'studying'} />
      <div className="font-pixel font-bold">
        {p.nickname} {p.isHost && <span title="방장">👑</span>} {me && <span className="text-xs">(나)</span>}
      </div>
      <div className="text-xs">{p.connected ? STATUS_LABEL[p.status] : '연결 끊김'}</div>
      {p.activity && <div className="text-xs text-ink-soft">{p.activity}</div>}
      <div className="mt-1 text-xs">공부 {formatDuration(studied)}</div>
      <div className="mt-1 w-full text-[11px] text-ink-soft">진행률 {p.progress}% · 목표 {p.goalRate}%</div>
    </div>
  );
}

function Room({ local, onLeft }: { local: StudyRoomLocal; onLeft: () => void }) {
  const conn = useRoomConnection(local);
  const now = useNow(1000);
  const { subject } = useCurrentSubject();
  const [joinedAt] = useState(Date.now());
  const [progress, setProgress] = useState(0);
  const [activity, setActivity] = useState('');
  const [choice, setChoice] = useState<number | null>(null);
  const submissionIds = useRef(new Map<string, string>());
  const s = conn.state;
  const me = s?.participants.find((p) => p.id === local.participantId);
  const serverNow = conn.serverNow();

  const quizPool = useLiveQuery(async () => (subject ? (await db.questions.where('subjectId').equals(subject.id).toArray()).filter((q) => q.type === 'mcq' && q.choices && q.choices.length <= 5) : []), [subject?.id]);

  useEffect(() => setChoice(null), [s?.quiz?.index, s?.quiz?.id]);

  const leave = async () => {
    await conn.leave();
    await db.rooms.clear();
    await logSession('room', joinedAt, Date.now(), subject?.id);
    onLeft();
  };

  if (conn.status === 'room-lost')
    return (
      <Card className="space-y-3">
        <ErrorBox title="방에 다시 들어갈 수 없어요">
          {conn.error?.message ?? '방 정보가 서버에 없습니다.'} 무료 서버가 재시작되면 실시간 방은 사라질 수 있어요(개인 학습 기록은 이 기기에 그대로 있어요).
        </ErrorBox>
        <button
          className="btn-primary"
          onClick={async () => {
            await db.rooms.clear();
            onLeft();
          }}
        >
          새 방 만들기 / 다른 방 들어가기
        </button>
      </Card>
    );

  const focus = s?.focus;
  const focusRemaining = focus ? (focus.phase === 'running' && focus.startedAt ? Math.max(0, focus.remainingMs - (serverNow - focus.startedAt)) : focus.remainingMs) : 0;
  const quiz = s?.quiz;
  const qStarts = quiz ? quiz.questionStartedAt - serverNow : 0;
  const qLeft = quiz ? Math.max(0, quiz.secondsPerQuestion * 1000 - (serverNow - quiz.questionStartedAt)) : 0;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3">
        <div>
          <div className="text-xs text-ink-soft">초대 코드</div>
          <div className="font-pixel text-2xl font-bold tracking-widest">{local.code}</div>
        </div>
        <button className="btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(local.code).then(() => toast('초대 코드를 복사했어요.'))}>
          복사
        </button>
        <ConnBadge status={conn.status} />
        <span className="text-sm text-ink-soft">
          {s?.participants.length ?? 0}/{ROOM_MAX_PARTICIPANTS}명
        </span>
        <button className="btn-pink btn-sm ml-auto" onClick={leave}>
          방 나가기
        </button>
      </Card>
      {conn.status === 'reconnecting' && <InfoBox tone="butter">연결이 잠시 끊겼어요. 자동으로 다시 연결하고, 연결되면 방 상태를 다시 받아올게요. 그동안 내 공부 기록은 이 기기에 계속 저장돼요.</InfoBox>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {s?.participants.map((p) => <ParticipantCard key={p.id} p={p} now={serverNow} me={p.id === local.participantId} />)}
        {Array.from({ length: ROOM_MAX_PARTICIPANTS - (s?.participants.length ?? 0) }, (_, i) => (
          <div key={i} className="flex items-center justify-center rounded-xl border-2 border-dashed border-ink/30 p-3 text-xs text-ink-soft">
            빈자리 — 코드를 친구에게 알려 주세요
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="font-bold">내 상태</h2>
          <div className="flex gap-2" role="group" aria-label="내 공부 상태">
            {(['studying', 'break', 'idle'] as const).map((st) => (
              <button key={st} className={`btn btn-sm flex-1 ${me?.status === st ? 'bg-lavender' : 'bg-white'}`} onClick={() => conn.update({ status: st })} disabled={conn.status !== 'connected'}>
                {STATUS_LABEL[st]}
              </button>
            ))}
          </div>
          <label className="block text-sm">
            <span className="label">지금 하는 공부</span>
            <input className="input py-1" value={activity} maxLength={30} onChange={(e) => setActivity(e.target.value)} onBlur={() => conn.update({ activity })} placeholder="예: 행동지원 카드 복습" />
          </label>
          <label className="block text-sm">
            <span className="label">오늘 진행률 {progress}%</span>
            <input type="range" min={0} max={100} step={5} value={progress} onChange={(e) => setProgress(Number(e.target.value))} onMouseUp={() => conn.update({ progress, goalRate: progress })} onTouchEnd={() => conn.update({ progress, goalRate: progress })} onKeyUp={() => conn.update({ progress, goalRate: progress })} className="w-full" />
          </label>
          <p className="text-xs text-ink-soft">공부 시간은 ‘공부 중’을 누른 시각부터 서버 시각 기준으로 계산돼요(새로고침·잠깐 끊겨도 시간이 부풀지 않아요).</p>
        </Card>

        <Card className="space-y-3">
          <h2 className="font-bold">함께 집중 타이머</h2>
          <div className="text-center font-pixel text-4xl tabular-nums" role="timer">
            {String(Math.floor(focusRemaining / 60000)).padStart(2, '0')}:{String(Math.floor((focusRemaining % 60000) / 1000)).padStart(2, '0')}
          </div>
          <p className="text-center text-xs text-ink-soft">{focus?.phase === 'running' ? '모두 함께 집중 중!' : focus?.phase === 'paused' ? '일시정지' : '대기 중'}</p>
          {me?.isHost ? (
            <div className="flex flex-wrap justify-center gap-2">
              <button className="btn-mint btn-sm" onClick={() => conn.focusStart(25)}>
                25분 시작
              </button>
              <button className="btn-mint btn-sm" onClick={() => conn.focusStart(50)}>
                50분 시작
              </button>
              {focus?.phase === 'running' && (
                <button className="btn-ghost btn-sm" onClick={conn.focusPause}>
                  일시정지
                </button>
              )}
              {focus?.phase === 'paused' && (
                <button className="btn-ghost btn-sm" onClick={conn.focusResume}>
                  이어서
                </button>
              )}
              <button className="btn-ghost btn-sm" onClick={conn.focusReset}>
                초기화
              </button>
            </div>
          ) : (
            <p className="text-center text-xs text-ink-soft">타이머는 방장이 조작해요.</p>
          )}
        </Card>
      </div>

      {s && <GroupWatch conn={conn} state={s} isHost={!!me?.isHost} myId={local.participantId} />}

      <Card className="space-y-3">
        <h2 className="font-bold">실시간 퀴즈 대결</h2>
        <InfoBox tone="milk">원본 자료는 공유되지 않아요. 방장이 퀴즈를 시작하면 고른 객관식 문제의 지문·보기·정답만 서버로 보내지고, 정답 판정과 점수는 서버가 해요.</InfoBox>
        {!quiz || quiz.phase === 'finished' ? (
          <>
            {conn.result && (
              <div className="rounded-lg bg-butter-soft p-3">
                <p className="font-pixel font-bold">결과</p>
                <ol className="list-decimal pl-5 text-sm">
                  {conn.result.ranking.map((r) => (
                    <li key={r.participantId}>
                      {r.nickname} — {r.score}점
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {me?.isHost ? (
              <button
                className="btn-primary"
                disabled={!quizPool || quizPool.length < 1}
                onClick={() => {
                  const picked = [...(quizPool ?? [])].sort(() => Math.random() - 0.5).slice(0, 5);
                  conn.clearResult();
                  conn.quizStart({ questions: picked.map((q) => ({ prompt: q.prompt.slice(0, 500), choices: q.choices!.map((c) => c.slice(0, 200)), answerIndex: q.answer as number })), secondsPerQuestion: 20 });
                }}
              >
                내 객관식 문제 5개로 퀴즈 시작 {quizPool && `(${quizPool.length}개 중)`}
              </button>
            ) : (
              <p className="text-sm text-ink-soft">방장이 퀴즈를 시작하면 여기에 문제가 나와요.</p>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>
                {quiz.index + 1}/{quiz.total}
              </span>
              <span className="font-pixel">{qStarts > 0 ? `${Math.ceil(qStarts / 1000)}초 뒤 시작` : `남은 시간 ${Math.ceil(qLeft / 1000)}초`}</span>
            </div>
            {quiz.lastReveal && qStarts > 0 && (
              <p className="rounded bg-mint-soft p-2 text-sm">
                지난 문제 정답: {quiz.lastReveal.answerIndex + 1}번 · 맞힌 사람: {quiz.lastReveal.correctBy.map((id) => s?.participants.find((p) => p.id === id)?.nickname).filter(Boolean).join(', ') || '없음'}
              </p>
            )}
            {qStarts <= 0 && (
              <>
                <p className="whitespace-pre-wrap">{quiz.prompt}</p>
                <div className="grid gap-2">
                  {quiz.choices.map((c, i) => (
                    <button
                      key={i}
                      disabled={choice !== null || quiz.answeredBy.includes(local.participantId) || qLeft <= 0}
                      className={`rounded-lg border-2 px-3 py-2 text-left text-sm ${choice === i ? 'border-lavender-deep bg-lavender' : 'border-ink/30 bg-white hover:bg-lavender-soft'}`}
                      onClick={async () => {
                        setChoice(i);
                        const key = `${quiz.id}:${quiz.index}`;
                        if (!submissionIds.current.has(key)) submissionIds.current.set(key, uuid());
                        const ack = await conn.answer(quiz.index, i, submissionIds.current.get(key)!);
                        if (!ack) toast('답을 보내지 못했어요. 연결 상태를 확인해 주세요.', 'error');
                      }}
                    >
                      {i + 1}. {c}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-ink-soft">
                  답한 사람: {quiz.answeredBy.map((id) => s?.participants.find((p) => p.id === id)?.nickname).filter(Boolean).join(', ') || '아직 없음'}
                </p>
              </>
            )}
            <p className="text-sm">
              점수:{' '}
              {s?.participants.map((p) => `${p.nickname} ${quiz.scores[p.id] ?? 0}`).join(' · ')}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function Plaza() {
  const profile = useProfile();
  const local = useLiveQuery(() => db.rooms.toCollection().first(), []);
  const [nickname, setNickname] = useState('');
  const [character, setCharacter] = useState<CharacterId>('byeol');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const health = useQuery({ queryKey: ['health'], queryFn: checkHealth, enabled: !!SERVER_URL && !local, retry: 2, staleTime: 30_000 });

  useEffect(() => {
    if (profile) {
      setNickname((n) => n || profile.nickname || '');
      setCharacter(profile.characterId);
    }
  }, [profile]);

  if (!SERVER_URL)
    return (
      <div>
        <PageHeader title="친구 광장" subtitle="친구 최대 4명과 실시간으로 함께 공부해요." icon={<PixelBuilding roof="#f08fb0" wall="#eaf5ff" size={56} />} />
        <ErrorBox title="실시간 서버 주소가 설정되지 않았어요">
          친구 광장은 실시간 서버가 있어야 동작해요. 배포할 때 환경변수 <code>VITE_SERVER_URL</code>에 서버 주소를 넣어 주세요(자세한 방법은 README의 ‘Render 배포’ 참고). 다른 모든 개인 학습 기능은 서버 없이 그대로 쓸 수 있어요.
        </ErrorBox>
      </div>
    );

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '알 수 없는 오류가 발생했어요. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="친구 광장" subtitle="로그인 없이 초대 코드로 친구 최대 4명과 함께 공부해요." icon={<PixelBuilding roof="#f08fb0" wall="#eaf5ff" size={56} />} />
      {local ? (
        <Room local={local} onLeft={() => toast('방에서 나왔어요.')} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              서버 상태:
              {health.isLoading ? (
                <span className="chip bg-butter">확인 중… (무료 서버는 깨어나는 데 최대 1분 걸릴 수 있어요)</span>
              ) : health.isError ? (
                <span className="chip bg-pink">응답 없음</span>
              ) : (
                <span className="chip bg-mint">사용 가능</span>
              )}
              {health.isError && (
                <button className="btn-ghost btn-sm" onClick={() => health.refetch()}>
                  다시 확인
                </button>
              )}
            </div>
            <label className="block">
              <span className="label">닉네임</span>
              <input className="input" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={12} />
            </label>
            <div>
              <span className="label">캐릭터</span>
              <div className="flex gap-2" role="radiogroup" aria-label="캐릭터">
                {CHARACTERS.map((c) => (
                  <button key={c.id} role="radio" aria-checked={character === c.id} className={`rounded-lg border-2 p-1 ${character === c.id ? 'border-lavender-deep bg-lavender' : 'border-ink/20 bg-white'}`} onClick={() => setCharacter(c.id)} aria-label={c.name}>
                    <PixelCharacter id={c.id} size={40} animate={false} />
                  </button>
                ))}
              </div>
            </div>
            <button className="btn-primary w-full" disabled={busy || !nickname.trim()} onClick={() => act(() => createRoom(nickname.trim(), character))}>
              {busy ? '연결 중…' : '새 방 만들기'}
            </button>
            <div className="flex gap-2">
              <input className="input font-pixel uppercase tracking-widest" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="초대 코드 6자리" aria-label="초대 코드" />
              <button className="btn-mint" disabled={busy || code.length !== 6 || !nickname.trim()} onClick={() => act(() => joinRoom(code, nickname.trim(), character))}>
                입장
              </button>
            </div>
            {error && <ErrorBox>{error}</ErrorBox>}
          </Card>
          <Card className="space-y-2 text-sm">
            <h2 className="font-bold">알아 두세요</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>로그인 없이 이 기기 전용 복구 정보로 다시 들어올 수 있어요. 브라우저 데이터를 지우면 복구 정보도 사라져서 같은 방에 새 참가자로 다시 입장해야 해요.</li>
              <li>닉네임만으로는 다른 사람의 기록을 바꿀 수 없어요.</li>
              <li>무료 서버는 쉬고 있다가 깨어나거나 재시작될 수 있어요. 재시작되면 방이 사라질 수 있고, 그때는 새 방을 만들어 주세요.</li>
              <li>개인 학습 기록은 서버가 아니라 각자의 기기에 저장돼요.</li>
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
