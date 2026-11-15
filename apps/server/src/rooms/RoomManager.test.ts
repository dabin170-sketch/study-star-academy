import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { REVEAL_DELAY_MS, RoomError, RoomManager, STALE_PARTICIPANT_MS, VOTE_WINDOW_MS, generateRoomCode } from './RoomManager';
import { ROOM_CODE_ALPHABET } from '@academy/shared';

function setup() {
  let t = 1_000_000;
  const clock = { now: () => t, advance: (ms: number) => (t += ms) };
  const m = new RoomManager({ maxRooms: 3, idleRoomTtlMs: 30 * 60_000, maxRoomAgeMs: 24 * 3_600_000, now: clock.now });
  const who = (nickname: string) => ({ nickname, characterId: 'byeol' as const, deviceId: randomUUID() });
  return { m, clock, who };
}

const expectCode = (fn: () => unknown, code: string) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(RoomError);
    expect((e as RoomError).code).toBe(code);
    return;
  }
  throw new Error(`${code} 오류가 발생해야 합니다`);
};

describe('RoomManager', () => {
  it('초대 코드는 지정된 문자만 쓰는 6자리', () => {
    for (let i = 0; i < 50; i++) {
      const c = generateRoomCode();
      expect(c).toHaveLength(6);
      for (const ch of c) expect(ROOM_CODE_ALPHABET).toContain(ch);
    }
  });

  it('방장 포함 최대 4명, 5번째는 거절', () => {
    const { m, who } = setup();
    const host = m.createRoom(who('호스트'));
    expect(host.state.participants[0].isHost).toBe(true);
    for (const n of ['둘', '셋', '넷']) m.joinRoom(host.code, who(n));
    expectCode(() => m.joinRoom(host.code, who('다섯')), 'ROOM_FULL');
  });

  it('오래 끊긴 참가자 자리는 새 참가자에게 넘어간다', () => {
    const { m, who, clock } = setup();
    const host = m.createRoom(who('호스트'));
    const others = ['둘', '셋', '넷'].map((n) => m.joinRoom(host.code, who(n)));
    m.attachSocket(host.code, host.participantId, 's0');
    others.forEach((o, i) => m.attachSocket(host.code, o.participantId, `s${i + 1}`));
    m.detachSocket('s3');
    clock.advance(STALE_PARTICIPANT_MS + 1000);
    const late = m.joinRoom(host.code, who('다섯'));
    expect(late.state.participants.map((p) => p.nickname)).toContain('다섯');
  });

  it('복구 토큰 없이는 인증되지 않고, 공개 상태에 토큰이 없다', () => {
    const { m, who } = setup();
    const r = m.createRoom(who('a'));
    expect(m.authenticate(r.code, r.participantId, r.recoveryToken).id).toBe(r.participantId);
    expectCode(() => m.authenticate(r.code, r.participantId, 'f'.repeat(64)), 'UNAUTHORIZED');
    expect(JSON.stringify(m.state(r.code))).not.toContain(r.recoveryToken);
  });

  it('같은 닉네임으로 들어와도 다른 참가자로 구분된다(닉네임 사칭 불가)', () => {
    const { m, who } = setup();
    const a = m.createRoom(who('민정'));
    const b = m.joinRoom(a.code, who('민정'));
    expect(b.participantId).not.toBe(a.participantId);
    expect(b.state.participants.map((p) => p.nickname)).toEqual(['민정', '민정2']);
    expectCode(() => m.authenticate(a.code, a.participantId, b.recoveryToken), 'UNAUTHORIZED');
  });

  it('공부 시간은 시작 시각 기준으로 누적되고, 연결이 끊기면 그 시점까지만 센다', () => {
    const { m, who, clock } = setup();
    const r = m.createRoom(who('a'));
    m.attachSocket(r.code, r.participantId, 's1');
    m.updateParticipant(r.code, r.participantId, { status: 'studying' });
    clock.advance(10 * 60_000);
    m.updateParticipant(r.code, r.participantId, { status: 'break' });
    clock.advance(5 * 60_000);
    m.updateParticipant(r.code, r.participantId, { status: 'studying' });
    clock.advance(3 * 60_000);
    m.detachSocket('s1');
    clock.advance(60 * 60_000);
    const p = m.state(r.code).participants[0];
    expect(p.accumulatedMs).toBe(13 * 60_000);
    expect(p.connected).toBe(false);
    expect(p.studyingSince).toBeNull();
  });

  it('함께 집중 타이머는 방장만 조작하고, 일시정지 시 남은 시간을 보존한다', () => {
    const { m, who, clock } = setup();
    const host = m.createRoom(who('host'));
    const guest = m.joinRoom(host.code, who('guest'));
    expectCode(() => m.focusStart(host.code, guest.participantId, 25), 'NOT_HOST');
    m.focusStart(host.code, host.participantId, 25);
    clock.advance(5 * 60_000);
    m.focusPause(host.code, host.participantId);
    expect(m.state(host.code).focus).toMatchObject({ phase: 'paused', remainingMs: 20 * 60_000 });
    m.focusResume(host.code, host.participantId);
    expect(m.state(host.code).focus.phase).toBe('running');
  });

  it('퀴즈: 서버가 판정하고, 같은 문항 중복 제출은 무시하며, 정답은 공개 상태에 없다', () => {
    const { m, who, clock } = setup();
    const host = m.createRoom(who('host'));
    const guest = m.joinRoom(host.code, who('guest'));
    m.attachSocket(host.code, host.participantId, 'h');
    m.attachSocket(host.code, guest.participantId, 'g');
    m.quizStart(host.code, host.participantId, {
      questions: [
        { prompt: '강화는?', choices: ['증가', '감소'], answerIndex: 0 },
        { prompt: '벌은?', choices: ['증가', '감소'], answerIndex: 1 },
      ],
      secondsPerQuestion: 20,
    });
    const public0 = JSON.stringify(m.state(host.code).quiz);
    expect(public0).not.toContain('answerIndex');
    // 시작 전 제출은 받지 않음
    expect(m.quizAnswer(host.code, host.participantId, { questionIndex: 0, choice: 0, submissionId: randomUUID() }).accepted).toBe(false);
    clock.advance(REVEAL_DELAY_MS);
    const sub = randomUUID();
    expect(m.quizAnswer(host.code, host.participantId, { questionIndex: 0, choice: 0, submissionId: sub })).toEqual({ accepted: true, duplicate: false });
    expect(m.quizAnswer(host.code, host.participantId, { questionIndex: 0, choice: 1, submissionId: randomUUID() }).duplicate).toBe(true);
    expect(m.quizAnswer(host.code, host.participantId, { questionIndex: 0, choice: 0, submissionId: sub })).toEqual({ accepted: true, duplicate: true });
    m.quizAnswer(host.code, guest.participantId, { questionIndex: 0, choice: 1, submissionId: randomUUID() });
    const s = m.state(host.code).quiz!;
    expect(s.index).toBe(1);
    expect(s.lastReveal).toEqual({ index: 0, answerIndex: 0, correctBy: [host.participantId] });
    expect(s.scores[host.participantId]).toBe(150);
    expect(s.scores[guest.participantId]).toBe(0);
    // 시간 초과로 다음 진행
    clock.advance(REVEAL_DELAY_MS + 21_000);
    const { finishedQuizzes } = m.tick();
    expect(finishedQuizzes).toEqual([host.code]);
    expect(m.results(host.code).ranking[0].nickname).toBe('host');
  });

  it('방장만 퀴즈를 시작할 수 있다', () => {
    const { m, who } = setup();
    const host = m.createRoom(who('host'));
    const guest = m.joinRoom(host.code, who('guest'));
    expectCode(() => m.quizStart(host.code, guest.participantId, { questions: [{ prompt: 'q', choices: ['a', 'b'], answerIndex: 0 }], secondsPerQuestion: 10 }), 'NOT_HOST');
  });

  it('방장이 나가면 다음 사람이 방장이 되고, 모두 나가면 방이 사라진다', () => {
    const { m, who } = setup();
    const host = m.createRoom(who('host'));
    const guest = m.joinRoom(host.code, who('guest'));
    m.leave(host.code, host.participantId);
    expect(m.state(host.code).participants[0]).toMatchObject({ id: guest.participantId, isHost: true });
    m.leave(host.code, guest.participantId);
    expect(m.has(host.code)).toBe(false);
  });

  it('비어 있는 방은 일정 시간 뒤 정리되고, 방 개수 제한을 지킨다', () => {
    const { m, who, clock } = setup();
    const a = m.createRoom(who('a'));
    m.createRoom(who('b'));
    m.createRoom(who('c'));
    expectCode(() => m.createRoom(who('d')), 'SERVER_BUSY');
    clock.advance(31 * 60_000);
    m.tick();
    expect(m.has(a.code)).toBe(false);
    expect(() => m.createRoom(who('d'))).not.toThrow();
  });

  describe('함께 보기', () => {
    const episode = {
      startSceneId: 's1',
      scenes: [
        { id: 's1', nextSceneId: 's2' },
        { id: 's2', choice: { options: [{ id: 'a' }, { id: 'b' }] } },
        { id: 's3' },
      ],
    };

    it('방장만 대본을 올리고 재생 위치를 바꾸며, 위치는 서버 시각 기준으로 공유된다', () => {
      const { m, who, clock } = setup();
      const host = m.createRoom(who('host'));
      const guest = m.joinRoom(host.code, who('guest'));
      expectCode(() => m.playLoad(host.code, guest.participantId, { title: 't', episode }), 'NOT_HOST');
      m.playLoad(host.code, host.participantId, { title: '강화 사건', episode });
      expect(m.playEpisode(host.code)?.episode.startSceneId).toBe('s1');
      clock.advance(1000);
      m.playControl(host.code, host.participantId, { sceneId: 's2', lineIndex: 1, playing: true, elapsedMs: 400 });
      const pb = m.state(host.code).playback!;
      expect(pb).toMatchObject({ sceneId: 's2', lineIndex: 1, playing: true, title: '강화 사건' });
      expect(pb.lineStartedAt).toBe(clock.now() - 400);
      expect(JSON.stringify(m.state(host.code))).not.toContain('scenes'); // 상태에는 대본을 반복해서 싣지 않음
      expectCode(() => m.playControl(host.code, guest.participantId, { sceneId: 's1', lineIndex: 0, playing: true, elapsedMs: 0 }), 'NOT_HOST');
      expectCode(() => m.playControl(host.code, host.participantId, { sceneId: 'zz', lineIndex: 0, playing: true, elapsedMs: 0 }), 'INVALID_INPUT');
    });

    it('공동 선택은 모두 투표하면 다수결로, 동점이면 방장 표로 정하고, 시간이 지나면 받은 표로 정한다', () => {
      const { m, who, clock } = setup();
      const host = m.createRoom(who('host'));
      const g1 = m.joinRoom(host.code, who('g1'));
      const g2 = m.joinRoom(host.code, who('g2'));
      [host, g1, g2].forEach((p, i) => m.attachSocket(host.code, p.participantId, `s${i}`));
      m.playLoad(host.code, host.participantId, { title: 't', episode });
      m.playControl(host.code, host.participantId, { sceneId: 's2', lineIndex: 0, playing: true, elapsedMs: 0 });
      expectCode(() => m.playVote(host.code, g1.participantId, { sceneId: 's2', optionId: 'zz' }), 'INVALID_INPUT');
      expect(m.playVote(host.code, g1.participantId, { sceneId: 's2', optionId: 'a' }).decided).toBe(false);
      m.playVote(host.code, g1.participantId, { sceneId: 's2', optionId: 'b' }); // 표 바꾸기
      m.playVote(host.code, host.participantId, { sceneId: 's2', optionId: 'a' });
      expect(m.state(host.code).playback!.votes!.counts).toEqual({ b: 1, a: 1 });
      expect(m.playVote(host.code, g2.participantId, { sceneId: 's2', optionId: 'b' }).decided).toBe(true);
      expect(m.state(host.code).playback!.decision).toEqual({ sceneId: 's2', optionId: 'b', counts: { b: 2, a: 1 } });

      // 시간 초과: 한 명만 투표해도 마감 후 결정
      m.playControl(host.code, host.participantId, { sceneId: 's1', lineIndex: 0, playing: true, elapsedMs: 0 });
      m.playControl(host.code, host.participantId, { sceneId: 's2', lineIndex: 0, playing: true, elapsedMs: 0 });
      expect(m.state(host.code).playback!.decision).toBeNull();
      m.playVote(host.code, g2.participantId, { sceneId: 's2', optionId: 'a' });
      clock.advance(VOTE_WINDOW_MS + 100);
      m.tick();
      expect(m.state(host.code).playback!.decision?.optionId).toBe('a');
    });
  });
});
