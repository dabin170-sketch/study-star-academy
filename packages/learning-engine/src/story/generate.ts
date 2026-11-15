/**
 * 템플릿 기반 학습 스토리 생성기(로컬, AI 없이 동작).
 *
 * 서사: 사건 발생 → 오해 → 시도 → 잘못된 판단의 결과 → (선택지) → 단서 발견 → 핵심 개념 이해 → 해결 → 정리
 *
 * 원칙
 *  - 학습 내용을 말하는 대사(fact: source/derived)는 원문 근거를 반드시 가진다.
 *    source는 원문 문장 그대로, derived는 원문에서 기계적으로 뽑은 핵심어·용어다.
 *  - 이야기를 위한 대사(fact: fiction)는 사실 주장이 아니며 화면에 ‘이야기 설정’으로 표시된다.
 *  - 오개념 대사는 다른 개념의 용어를 일부러 잘못 갖다 쓰는 것으로 만들고, 바로 다음 장면에서 원문으로 바로잡는다.
 *  - 선택지는 정답·오답 모두 다음 본 장면으로 다시 합류한다(분기가 끝없이 늘어나지 않음).
 *  - 같은 개념이라도 seed에 따라 대사 변형·화자·순서가 달라져 매번 같은 패턴을 반복하지 않는다.
 */
import type {
  BackgroundId,
  CastId,
  CastPlacement,
  ConceptKind,
  DialogueEvidence,
  DialogueLine,
  Emotion,
  MotionId,
  StoryEpisode,
  StoryLength,
  StoryScene,
  StoryStyle,
} from '@academy/shared';
import { keywordsOf, seededRandom, shuffle } from '../text';
import { maskTerm } from '../questions';
import { quoted } from './josa';

export interface StoryConcept {
  id: string;
  term: string;
  aliases: string[];
  kind: ConceptKind;
  statement: string;
  status: 'auto' | 'verified' | 'needs-check' | 'rejected';
  section: string;
  evidence?: DialogueEvidence;
}

export interface StoryOptions {
  style: StoryStyle | 'auto';
  length: StoryLength;
  cast: CastId[];
  seed: string;
  title?: string;
}

/** 길이별 개념 수와 장면 구성 */
export const LENGTH_PLAN: Record<StoryLength, { concepts: number; full: boolean; clue: boolean }> = {
  30: { concepts: 1, full: false, clue: false },
  60: { concepts: 1, full: false, clue: true },
  180: { concepts: 2, full: true, clue: true },
  300: { concepts: 3, full: true, clue: true },
  600: { concepts: 6, full: true, clue: true },
};

export const LENGTH_LABEL: Record<StoryLength, string> = { 30: '30초 핵심 설명', 60: '1분 요약', 180: '3분 개념 학습', 300: '5분 심화 학습', 600: '10분 학습 에피소드' };

/** 개념 내용으로 이야기 스타일 고르기(규칙 명시) */
export function pickStyle(concepts: StoryConcept[]): StoryStyle {
  const text = concepts.map((c) => `${c.term} ${c.statement} ${c.section}`).join(' ');
  if (/(법|법령|조항|제\s?\d+\s?조|규정|권리|의무|위원회|시행령|판례)/.test(text)) return 'courtroom';
  if (/(조선|고려|삼국|왕조|시대|세기|전쟁|운동|임금|왕이|역사)/.test(text)) return 'time-travel';
  if (/(실험|물질|반응|세포|에너지|화학|생물|물리|관찰)/.test(text)) return 'lab';
  if (/(공식|방정식|함수|도형|계산|확률|비례)/.test(text)) return 'adventure';
  if (concepts.some((c) => c.kind === 'classification') || /(유형|종류|분류)/.test(text)) return 'sorting';
  if (/(행동|중재|강화|기능평가|문제행동|원인)/.test(text)) return 'detective';
  if (concepts.some((c) => c.kind === 'procedure')) return 'adventure';
  return 'classroom';
}

const STYLE_BG: Record<StoryStyle, { main: BackgroundId; alt: BackgroundId; board: BackgroundId }> = {
  detective: { main: 'office', alt: 'classroom', board: 'office' },
  sorting: { main: 'library', alt: 'classroom', board: 'classroom' },
  courtroom: { main: 'courtroom', alt: 'library', board: 'courtroom' },
  'time-travel': { main: 'village', alt: 'library', board: 'library' },
  lab: { main: 'lab', alt: 'classroom', board: 'lab' },
  adventure: { main: 'park', alt: 'classroom', board: 'classroom' },
  classroom: { main: 'classroom', alt: 'library', board: 'classroom' },
};

/** 스타일별 사건 문장(창작). {term} {section} {other} 자리표시 */
const INCIDENT: Record<StoryStyle, string[]> = {
  detective: ['탐정 사무소에 새 사건 의뢰가 들어왔다. 단서는 쪽지 한 장, “{section}”.', '수상한 사건 메모가 책상 위에 놓여 있었다. 제목은 “{section}”.'],
  sorting: ['도서관 개념 상자가 뒤죽박죽 섞여 버렸다. 오늘 안에 제자리를 찾아 줘야 한다.', '분류 카드 더미가 바닥에 쏟아졌다. 어떤 카드가 어디에 들어가야 할까?'],
  courtroom: ['모의 재판이 열렸다. 오늘의 쟁점은 “{section}”.', '재판정에 의문의 사건 기록이 제출되었다. 판단의 기준을 찾아야 한다.'],
  'time-travel': ['시간 여행 시계가 덜컥 멈췄다. 이곳은 “{section}”의 한가운데!', '눈을 떠 보니 낯선 옛 마을. 사람들은 “{section}” 이야기로 시끌시끌하다.'],
  lab: ['실험실 비커에서 예상과 다른 결과가 나왔다. 무엇을 놓친 걸까?', '실험 기록장에 이상한 메모가 남아 있었다. 제목은 “{section}”.'],
  adventure: ['보물 지도의 다음 관문이 잠겨 있다. 열쇠를 찾으려면 “{section}”을 알아야 한다.', '모험길 앞에 수수께끼 문이 나타났다. 문에 새겨진 글자는 “{section}”.'],
  classroom: ['수업 종이 울리기 직전, 칠판에 낯선 낱말이 하나 적혀 있었다.', '쪽지 시험지를 받아 든 순간, 첫 문제에서 손이 멈췄다.'],
};

const CURIOUS_Q = ['{term}? 그게 뭐야? 왜 이 사건이랑 상관있어?', '잠깐, 아까부터 {term} 얘기가 계속 나오는데… 정확히 무슨 뜻이지?', '{term}… 들어 본 것 같은데 설명은 못 하겠어. 뭘까?'];
const MISCONCEPTION = ['내 생각엔 이건 분명 {other} 이야기야! 딱 보면 알지.', '간단해! 이건 {other} 때문이야. 내가 장담할게.', '에이, {termIgo} 뭐고 결국 {otherRang} 같은 거잖아?'];
const ATTEMPT = ['좋아, 그럼 {otherIra}고 생각하고 직접 해 보자!', '일단 {other} 방법대로 따라 해 볼게. 지켜봐!'];
const CONSEQUENCE_INTRO = ['잠깐. {other}의 뜻을 자료에서 다시 확인해 볼게.', '이상하네. 자료에 적힌 {other}의 설명은 이랬어.'];
const CONSEQUENCE_OUTRO = ['지금 상황이랑은 안 맞아. 다른 개념이 필요해.', '그러니까 {otherRo}는 이 사건이 설명되지 않아.'];
const CLUE_INTRO = ['찾았다! 자료 {page}에 결정적인 단서가 있어.', '이걸 봐. 원문 {page}에 이렇게 적혀 있어.'];
const EXPLAIN_INTRO = ['자, {term}의 원문 설명을 그대로 읽어 볼게요.', '좋아요. 원문에 적힌 설명을 함께 볼까요?'];
const KEYWORDS_LINE = ['핵심어만 뽑으면 {keywords}. 이 말들이 빠지면 설명이 흔들려요.', '꼭 기억할 단어는 {keywords}예요.'];
const CURIOUS_RECAP = ['아하, {k1}부터 떠올리면 되는구나!', '그러니까 {k1}, {k2} 같은 말이 빠지면 안 되는 거네!'];
const RESOLUTION: Record<StoryStyle, string[]> = {
  detective: ['사건 해결! 진짜 범인은 {termEul} 제대로 몰랐던 모두의 착각이었다.', '마침내 사건 기록에 정확한 개념이 적혔다.'],
  sorting: ['드디어 {term} 카드가 제자리를 찾았다!', '상자 정리 끝! 이제 카드들이 제 칸에 들어갔다.'],
  courtroom: ['판결: 이번 사건의 판단 기준은 {term}입니다. 탕탕탕!', '쟁점이 정리되었습니다. 기준은 {term}.'],
  'time-travel': ['시계가 다시 째깍거린다. {termEul} 이해하자 돌아갈 길이 열렸다!', '마을 사람들이 고개를 끄덕였다. 이제 현재로 돌아갈 시간이다.'],
  lab: ['실험 결과가 이제야 설명된다! 열쇠는 바로 {term}!', '기록장 정리 완료. 다음 실험은 훨씬 수월할 것 같다.'],
  adventure: ['철컥! {termEul} 말하자 관문이 열렸다.', '수수께끼 문이 스르르 열렸다. 다음 모험으로!'],
  classroom: ['이제 그 문제는 자신 있게 풀 수 있을 것 같다.', '칠판의 낱말이 더는 낯설지 않다.'],
};
const ADMIT = ['내가 {otherRang} 헷갈렸네. 다음엔 근거부터 볼게!', '하하, 내가 너무 서둘렀다. {term}, 이제 확실히 기억할게!'];
const RIVAL_CHALLENGE = ['좋아. 그럼 내가 문제 하나 낼게. 맞혀 봐.', '말로만 아는 건지 확인해 볼까? 문제 나간다.'];
const CORRECT_FEEDBACK = ['정답! 원문 설명과 정확히 맞아.', '흠, 제법인데? 근거까지 딱 맞아.'];
const WRONG_FEEDBACK = ['괜찮아요. 헷갈리기 쉬운 개념이에요. 자료를 다시 보면 차이가 보여요.', '아쉽지만 괜찮아. 고른 개념의 원문 설명을 같이 확인해 보자.'];

type Role = 'explainer' | 'curious' | 'misconception' | 'analyst' | 'demo' | 'rival';
const ROLE_PREF: Record<Role, CastId[]> = {
  explainer: ['hana', 'seoyun', 'rio', 'kangha', 'doto', 'mungchi'],
  curious: ['doto', 'mungchi', 'rio', 'seoyun', 'kangha', 'hana'],
  misconception: ['mungchi', 'doto', 'rio', 'kangha', 'seoyun', 'hana'],
  analyst: ['seoyun', 'hana', 'kangha', 'rio', 'doto', 'mungchi'],
  demo: ['rio', 'mungchi', 'doto', 'seoyun', 'hana', 'kangha'],
  rival: ['kangha', 'seoyun', 'hana', 'rio', 'doto', 'mungchi'],
};

export function assignRoles(cast: CastId[]): Record<Role, CastId> {
  const available = cast.length ? cast : (['hana', 'doto', 'mungchi'] as CastId[]);
  const out = {} as Record<Role, CastId>;
  for (const role of Object.keys(ROLE_PREF) as Role[]) out[role] = ROLE_PREF[role].find((c) => available.includes(c)) ?? available[0];
  return out;
}

function fill(t: string, vars: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

function usable(c: StoryConcept) {
  return (c.status === 'auto' || c.status === 'verified') && !!c.evidence;
}

export function generateEpisode(selected: StoryConcept[], pool: StoryConcept[], opts: StoryOptions): StoryEpisode {
  const plan = LENGTH_PLAN[opts.length];
  const targets = selected.filter(usable).slice(0, plan.concepts);
  if (!targets.length) throw new Error('원문 근거가 확인된 개념이 있어야 이야기를 만들 수 있어요.');
  const style = opts.style === 'auto' ? pickStyle(targets) : opts.style;
  const roles = assignRoles(opts.cast);
  const rand = seededRandom(`${opts.seed}:${targets.map((t) => t.id).join(',')}`);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const bg = STYLE_BG[style];
  const others = pool.filter((p) => usable(p) && !targets.some((t) => t.id === p.id));

  let seq = 0;
  const sid = () => `s${++seq}`;
  let lid = 0;
  const line = (speaker: DialogueLine['speaker'], text: string, emotion: Emotion, motion: MotionId, fact: DialogueLine['fact'], extra: Partial<DialogueLine> = {}): DialogueLine => ({
    id: `l${++lid}`,
    speaker,
    kind: speaker === 'narrator' ? 'narration' : 'speech',
    text,
    emotion,
    motion,
    fact,
    ...extra,
  });
  const castOf = (...ids: CastId[]): CastPlacement[] => {
    const uniq = [...new Set(ids)].slice(0, 3);
    const slots: CastPlacement['slot'][] = uniq.length === 1 ? ['center'] : uniq.length === 2 ? ['left', 'right'] : ['left', 'center', 'right'];
    return uniq.map((id, i) => ({ id, slot: slots[i], facing: slots[i] === 'right' ? -1 : 1 }));
  };

  const scenes: StoryScene[] = [];
  const intro: StoryScene = {
    id: sid(),
    title: '오프닝',
    beat: 'incident',
    background: bg.main,
    camera: { kind: 'zoom-out', shake: 0 },
    cast: castOf(roles.explainer, roles.curious, roles.misconception),
    conceptIds: targets.map((t) => t.id),
    lines: [line('narrator', fill(pick(INCIDENT[style]), { section: targets[0].section || targets[0].term, term: targets[0].term }), 'curious', 'idle', 'fiction')],
    effect: 'question',
  };
  scenes.push(intro);

  targets.forEach((c, idx) => {
    const ev = c.evidence!;
    const other = shuffle(others.filter((o) => o.kind === c.kind).length ? others.filter((o) => o.kind === c.kind) : others, rand)[0];
    const otherTerm = other?.term ?? '다른 개념';
    const pageLabel = `${ev.pageNumber}쪽(구간)`;
    const vars = {
      term: quoted(c.term),
      termEul: quoted(c.term, '을/를'),
      termIgo: quoted(c.term, '이고/고'),
      other: quoted(otherTerm),
      otherRang: quoted(otherTerm, '이랑/랑'),
      otherRo: quoted(otherTerm, '으로/로'),
      otherIra: quoted(otherTerm, '이라/라'),
      section: c.section || c.term,
      page: pageLabel,
    };
    const actScenes: StoryScene[] = [];
    const mk = (s: Omit<StoryScene, 'id' | 'conceptIds'>): StoryScene => ({ ...s, id: sid(), conceptIds: [c.id] });

    // 1. 사건 속 질문
    actScenes.push(
      mk({
        title: `${c.term} — 수수께끼`,
        beat: 'incident',
        background: idx % 2 ? bg.alt : bg.main,
        camera: { kind: idx % 2 ? 'pan-right' : 'focus-speaker', shake: 0 },
        cast: castOf(roles.curious, roles.explainer),
        lines: [
          line(roles.curious, fill(pick(CURIOUS_Q), vars), 'curious', pick(['raise-hand', 'think']), 'fiction'),
          line(roles.explainer, pick(['좋은 질문이에요. 섣불리 답하지 말고 단서를 모아 봐요.', '그걸 알아내는 게 오늘 사건의 열쇠예요.']), 'joy', 'nod', 'fiction'),
        ],
      }),
    );
    // 2. 오해(오개념) — 다른 개념이 있을 때만
    if (other) {
      actScenes.push(
        mk({
          title: '섣부른 추측',
          beat: 'misunderstanding',
          background: idx % 2 ? bg.alt : bg.main,
          camera: { kind: 'zoom-in', shake: 0 },
          cast: castOf(roles.misconception, roles.curious, roles.analyst),
          lines: [
            line(roles.misconception, fill(pick(MISCONCEPTION), vars), 'confident', pick(['laugh', 'explain']), 'fiction', { misconception: true }),
            line(roles.curious, pick(['정말? 그럼 바로 해결이네!', '오, 그럴듯한데?']), 'joy', 'nod', 'fiction'),
          ],
        }),
      );
      if (plan.full) {
        // 3. 시도 4. 잘못된 판단의 결과(다른 개념의 원문으로 바로잡기)
        actScenes.push(
          mk({
            title: '시도',
            beat: 'attempt',
            background: bg.main,
            camera: { kind: 'pan-left', shake: 0 },
            cast: castOf(roles.demo, roles.misconception),
            lines: [line(roles.demo, fill(pick(ATTEMPT), vars), 'joy', pick(['pick-up', 'walk']), 'fiction'), line('narrator', pick(['…그런데 결과가 영 이상하다.', '…하지만 아무것도 맞아떨어지지 않았다.']), 'confused', 'idle', 'fiction')],
            effect: 'flash',
          }),
        );
        actScenes.push(
          mk({
            title: '어긋난 결과',
            beat: 'consequence',
            background: bg.main,
            camera: { kind: 'static', shake: 1 },
            cast: castOf(roles.analyst, roles.misconception),
            lines: [
              line(roles.analyst, fill(pick(CONSEQUENCE_INTRO), vars), 'doubt', 'think', 'fiction'),
              line(roles.analyst, other.statement, 'focused', 'read-book', 'source', { kind: 'concept-box', evidence: other.evidence }),
              line(roles.analyst, fill(pick(CONSEQUENCE_OUTRO), vars), 'focused', 'shake-head', 'fiction'),
              line(roles.misconception, pick(['어… 내가 성급했나?', '앗, 그럼 뭐지?']), 'flustered', 'flustered', 'fiction'),
            ],
          }),
        );
      }
    }

    // 5. 선택지(정답·오답 모두 '이해' 장면으로 합류)
    const masked = maskTerm(c.statement, c.term, c.aliases);
    const distractors = shuffle(others.filter((o) => o.term !== c.term), rand).slice(0, opts.length >= 180 ? 3 : 2);
    if (masked && distractors.length) {
      const correctFb = mk({
        title: '정답!',
        beat: 'feedback',
        background: bg.main,
        camera: { kind: 'focus-speaker', shake: 0 },
        cast: castOf(roles.rival, roles.curious),
        lines: [line(roles.rival, pick(CORRECT_FEEDBACK), 'joy', 'nod', 'fiction')],
        effect: 'sparkle',
      });
      const wrongFb = mk({
        title: '다시 보기',
        beat: 'feedback',
        background: bg.main,
        camera: { kind: 'static', shake: 0 },
        cast: castOf(roles.explainer, roles.curious),
        lines: [line(roles.explainer, pick(WRONG_FEEDBACK), 'joy', 'explain', 'fiction')],
      });
      const options = shuffle(
        [
          { id: `o${c.id}-c`, text: c.term, correct: true, feedback: `맞아요. 원문: “${c.statement}”`, nextSceneId: correctFb.id, evidence: ev },
          ...distractors.map((d, i) => ({
            id: `o${c.id}-${i}`,
            text: d.term,
            correct: false,
            feedback: `${quoted(d.term, '은/는')} 원문에서 “${d.statement}”라고 설명해요. 빈칸의 설명과는 달라요.`,
            nextSceneId: wrongFb.id,
            evidence: d.evidence,
          })),
        ],
        rand,
      );
      actScenes.push(
        mk({
          title: '어떤 개념일까?',
          beat: 'choice',
          background: bg.board,
          camera: { kind: 'board', shake: 0 },
          cast: castOf(roles.rival, roles.curious, roles.misconception),
          lines: [line(roles.rival, pick(RIVAL_CHALLENGE), 'confident', 'point-board', 'fiction'), line(roles.rival, masked, 'focused', 'point-board', 'derived', { kind: 'concept-box', evidence: ev })],
          choice: { prompt: `칠판의 ○○에 들어갈 개념은 무엇일까요?`, type: 'single', options, conceptId: c.id },
        }),
        correctFb,
        wrongFb,
      );
    }

    // 6. 단서 발견
    if (plan.clue) {
      actScenes.push(
        mk({
          title: '단서 발견',
          beat: 'clue',
          background: bg.board,
          camera: { kind: 'zoom-in', shake: 0 },
          cast: castOf(roles.analyst, roles.demo),
          lines: [line(roles.analyst, fill(pick(CLUE_INTRO), vars), 'surprised', pick(['pick-up', 'point-board']), 'fiction', { prop: 'magnifier' })],
          effect: 'sparkle',
        }),
      );
    }

    // 7. 핵심 개념 이해(원문 그대로 + 원문 핵심어)
    const kws = keywordsOf(c.statement, c.term, 4);
    const understanding = mk({
      title: `${c.term} 이해하기`,
      beat: 'understanding',
      background: bg.board,
      camera: { kind: 'board', shake: 0 },
      cast: castOf(roles.explainer, roles.curious),
      lines: [
        line(roles.explainer, fill(pick(EXPLAIN_INTRO), vars), 'joy', 'explain', 'fiction'),
        line(roles.explainer, c.statement, 'focused', 'point-board', 'source', { kind: 'concept-box', evidence: ev }),
        ...(kws.length >= 2
          ? [
              line(roles.explainer, fill(pick(KEYWORDS_LINE), { keywords: kws.map((k) => `‘${k}’`).join(', ') }), 'focused', 'explain', 'derived', { evidence: ev }),
              line(roles.curious, fill(pick(CURIOUS_RECAP), { k1: quoted(kws[0]), k2: quoted(kws[1]) }), 'joy', 'nod', 'derived', { evidence: ev }),
            ]
          : []),
      ],
    });
    actScenes.push(understanding);

    // 8. 해결
    if (plan.full || opts.length === 60) {
      actScenes.push(
        mk({
          title: '해결',
          beat: 'resolution',
          background: bg.main,
          camera: { kind: 'zoom-out', shake: 0 },
          cast: castOf(roles.explainer, roles.misconception, roles.curious),
          lines: [line('narrator', fill(pick(RESOLUTION[style]), vars), 'joy', 'idle', 'fiction'), ...(other ? [line(roles.misconception, fill(pick(ADMIT), vars), 'shy', 'flustered', 'fiction')] : [])],
          effect: 'sparkle',
        }),
      );
    }

    // 장면 연결: 선택지 뒤 정답·오답 피드백 두 장면은 모두 다음 본 장면(단서 또는 이해)으로 합류한다
    for (let i = 0; i < actScenes.length; i++) {
      const s = actScenes[i];
      if (s.choice) continue;
      const next = actScenes.slice(i + 1).find((n) => n.beat !== 'feedback');
      if (next) s.nextSceneId = next.id;
    }
    scenes.push(...actScenes);
  });

  // 정리 장면
  const summary: StoryScene = {
    id: sid(),
    title: '오늘의 정리',
    beat: 'summary',
    background: bg.board,
    camera: { kind: 'board', shake: 0 },
    cast: castOf(roles.explainer, roles.analyst, roles.rival),
    conceptIds: targets.map((t) => t.id),
    lines: [
      line(roles.explainer, pick(['오늘 배운 개념을 정리해 볼까요?', '마지막으로 원문 문장을 한 번 더 확인해요.']), 'joy', 'explain', 'fiction'),
      ...targets.map((c) => line(roles.explainer, c.statement, 'focused', 'point-board', 'source' as const, { kind: 'concept-box' as const, evidence: c.evidence })),
    ],
  };
  const ending: StoryScene = {
    id: sid(),
    title: '엔딩',
    beat: 'ending',
    background: bg.main,
    camera: { kind: 'zoom-out', shake: 0 },
    cast: castOf(roles.explainer, roles.curious, roles.misconception),
    conceptIds: targets.map((t) => t.id),
    lines: [line('narrator', '이야기는 여기까지. 이제 직접 떠올려 볼 차례예요.', 'joy', 'idle', 'fiction')],
  };
  scenes.push(summary, ending);

  // 본 흐름 연결: 각 장면의 다음 장면이 없으면(막의 끝) 다음 막/정리로
  for (let i = 0; i < scenes.length - 1; i++) {
    const s = scenes[i];
    if (s.choice || s.nextSceneId || s.beat === 'ending') continue;
    const next = scenes.slice(i + 1).find((n) => n.beat !== 'feedback');
    if (next) s.nextSceneId = next.id;
  }

  return {
    schema: 1,
    title: opts.title ?? `${targets.map((t) => t.term).join('·')} — ${STYLE_TITLE[style]}`,
    style,
    mode: 'template',
    objectives: targets.map((t) => ({ conceptId: t.id, term: t.term, text: `${quoted(t.term, '을/를')} 원문 설명대로 말하고, 비슷한 개념과 구별할 수 있다.` })),
    cast: [...new Set(Object.values(roles))],
    startSceneId: intro.id,
    scenes,
    outcomes: [
      { id: 'full', title: '개념 완전 이해', message: '선택지를 모두 근거에 맞게 골랐어요. 이제 퀴즈와 백지 복습으로 정말 기억났는지 확인해 봐요.', minRatio: 0.8 },
      { id: 'partial', title: '일부 개념 이해', message: '절반 넘게 맞혔어요. 헷갈린 개념은 원문을 한 번 더 보고 카드로 복습해 봐요.', minRatio: 0.5 },
      { id: 'more', title: '조금 더 알아보기', message: '처음엔 누구나 헷갈려요. 원문 설명을 다시 읽고 이야기를 한 번 더 보면 차이가 잘 보일 거예요.', minRatio: 0 },
    ],
    conceptSnapshot: Object.fromEntries(targets.map((t) => [t.id, t.statement])),
  };
}

const STYLE_TITLE: Record<StoryStyle, string> = {
  detective: '사라진 단서 사건',
  sorting: '뒤죽박죽 분류 소동',
  courtroom: '모의 재판',
  'time-travel': '시간 여행 수업',
  lab: '실험실의 수수께끼',
  adventure: '관문을 열어라',
  classroom: '칠판 위의 낱말',
};

/* ---------------- 길이·진행 ---------------- */

/** 대사 한 줄 표시 시간(ms) — 글자 수 기반, 재생 속도로 나눔 */
export function lineDurationMs(l: Pick<DialogueLine, 'text' | 'durationMs' | 'kind'>, speed = 1): number {
  if (l.durationMs) return l.durationMs / speed;
  const base = Math.min(9000, Math.max(1800, 1400 + l.text.length * 85));
  return (l.kind === 'concept-box' ? base * 1.15 : base) / speed;
}

export function sceneDurationMs(s: StoryScene, speed = 1): number {
  if (s.durationMs) return s.durationMs / speed;
  return s.lines.reduce((a, l) => a + lineDurationMs(l, speed), 0);
}

/** 정답 경로 기준 장면 순서 */
export function mainPath(ep: StoryEpisode): StoryScene[] {
  const byId = new Map(ep.scenes.map((s) => [s.id, s]));
  const out: StoryScene[] = [];
  const seen = new Set<string>();
  let cur = byId.get(ep.startSceneId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.push(cur);
    const nextId = cur.choice ? cur.choice.options.find((o) => o.correct)?.nextSceneId : cur.nextSceneId;
    cur = nextId ? byId.get(nextId) : undefined;
  }
  return out;
}

/** 예상 길이(선택지 대기 시간 8초 포함) */
export function estimateEpisodeMs(ep: StoryEpisode, speed = 1): number {
  return mainPath(ep).reduce((a, s) => a + sceneDurationMs(s, speed) + (s.choice ? 8000 : 0), 0);
}

export function outcomeFor(ep: StoryEpisode, correct: number, total: number) {
  const ratio = total ? correct / total : 1;
  return [...ep.outcomes].sort((a, b) => b.minRatio - a.minRatio).find((o) => ratio >= o.minRatio) ?? ep.outcomes[ep.outcomes.length - 1];
}
