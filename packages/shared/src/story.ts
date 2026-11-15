/**
 * 이야기 극장 — 만화·애니메이션 학습 데이터 구조.
 * 에피소드 하나는 JSON 한 덩어리(대본·장면·분기·엔딩)로 저장되며, 대사·표정·포즈·배경·카메라·자막·장면 길이를
 * 각각 별도 필드로 가진다. (명세의 AnimationScene·Dialogue·DialogueEvidence·StoryBranch·StoryChoice·StoryOutcome·
 * LearningObjective·SceneConceptLink 등은 아래 타입으로 표현된다.)
 */
import type { BaseEntity } from './types';

export const STORY_SCHEMA_VERSION = 1;

/** 이야기 극장 전용 캐릭터 6명 */
export type CastId = 'hana' | 'doto' | 'mungchi' | 'seoyun' | 'rio' | 'kangha';

export type Emotion =
  | 'joy'
  | 'confident'
  | 'surprised'
  | 'doubt'
  | 'flustered'
  | 'sad'
  | 'angry'
  | 'focused'
  | 'curious'
  | 'shy'
  | 'confused';

export type MotionId =
  | 'idle'
  | 'breathe'
  | 'walk'
  | 'run'
  | 'sit'
  | 'stand-up'
  | 'raise-hand'
  | 'nod'
  | 'shake-head'
  | 'explain'
  | 'point-board'
  | 'read-book'
  | 'write'
  | 'surprised'
  | 'laugh'
  | 'angry'
  | 'sad'
  | 'flustered'
  | 'think'
  | 'pick-up';

export type BackgroundId = 'classroom' | 'library' | 'lab' | 'courtroom' | 'office' | 'village' | 'park';
export type PropId = 'book' | 'pencil' | 'magnifier' | 'flask' | 'gavel' | 'paper' | 'none';

export type StoryStyle = 'detective' | 'sorting' | 'courtroom' | 'time-travel' | 'lab' | 'adventure' | 'classroom';

export type StoryBeat =
  | 'incident'
  | 'misunderstanding'
  | 'attempt'
  | 'consequence'
  | 'clue'
  | 'understanding'
  | 'resolution'
  | 'summary'
  | 'choice'
  | 'feedback'
  | 'ending';

/**
 * source  : 원문 문장을 그대로 말함(근거 필수)
 * derived : 원문에서 기계적으로 뽑은 내용(핵심어·용어). 근거 필수
 * fiction : 이야기를 위한 창작 대사(사실 주장이 아님)
 */
export type FactKind = 'source' | 'derived' | 'fiction';

export interface DialogueEvidence {
  conceptId: string;
  documentId: string;
  chunkId: string;
  pageNumber: number;
  quote: string;
}

export interface DialogueLine {
  id: string;
  speaker: CastId | 'narrator';
  kind: 'speech' | 'thought' | 'narration' | 'sfx' | 'concept-box';
  text: string;
  emotion: Emotion;
  motion: MotionId;
  prop?: PropId;
  fact: FactKind;
  evidence?: DialogueEvidence;
  /** 사용자가 직접 고친 대사 */
  edited?: boolean;
  /** 일부러 틀린 말을 하는 오개념 대사(바로 다음 장면에서 원문으로 바로잡음) */
  misconception?: boolean;
  /** 자동 진행 시 이 대사를 보여 주는 시간(없으면 글자 수로 계산) */
  durationMs?: number;
}

export type CameraKind = 'static' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'focus-speaker' | 'board';

export interface CameraMove {
  kind: CameraKind;
  /** 0 없음, 1 약하게(강도 제한) */
  shake: 0 | 1;
}

export interface CastPlacement {
  id: CastId;
  slot: 'left' | 'center' | 'right';
  facing: 1 | -1;
}

export interface ChoiceOption {
  id: string;
  text: string;
  correct: boolean;
  feedback: string;
  /** 고른 뒤 이동할 장면 */
  nextSceneId: string;
  evidence?: DialogueEvidence;
}

export interface StoryChoice {
  prompt: string;
  type: 'single' | 'judgement';
  options: ChoiceOption[];
  conceptId?: string;
}

export interface StoryScene {
  id: string;
  title: string;
  beat: StoryBeat;
  background: BackgroundId;
  camera: CameraMove;
  cast: CastPlacement[];
  lines: DialogueLine[];
  /** 선택지가 없는 장면의 다음 장면(없으면 에피소드 끝) */
  nextSceneId?: string;
  choice?: StoryChoice;
  conceptIds: string[];
  /** 장면 전체 길이를 직접 정했을 때 */
  durationMs?: number;
  effect?: 'none' | 'sparkle' | 'question' | 'flash';
}

export interface LearningObjective {
  conceptId: string;
  term: string;
  text: string;
}

export interface StoryOutcome {
  id: 'full' | 'partial' | 'more';
  title: string;
  message: string;
  /** 이 비율 이상 정답이면 이 엔딩 */
  minRatio: number;
}

export interface StoryEpisode {
  schema: number;
  title: string;
  style: StoryStyle;
  mode: 'template' | 'ai';
  objectives: LearningObjective[];
  cast: CastId[];
  startSceneId: string;
  scenes: StoryScene[];
  outcomes: StoryOutcome[];
  /** 생성에 쓴 개념 상태 스냅숏 — 원문 변경 감지용 */
  conceptSnapshot: Record<string, string>;
}

export type StoryLength = 30 | 60 | 180 | 300 | 600;

export interface StoryProject extends BaseEntity {
  subjectId: string;
  documentId: string;
  title: string;
  format: 'comic' | 'animation' | 'story';
  length: StoryLength;
  episode: StoryEpisode;
  comicLayout: ComicLayoutKind;
  lastOpenedAt: number;
}

export type ComicLayoutKind = '1' | '4' | '8' | '12' | 'webtoon' | 'chapter';

export interface CastCustomization extends BaseEntity {
  castId: CastId;
  name: string;
  hair: string;
  outfit: string;
}

export interface PlaybackProgress extends BaseEntity {
  projectId: string;
  /** 지나온 장면 순서 */
  path: string[];
  choices: Record<string, { optionId: string; correct: boolean }>;
  finishedAt?: number;
  outcome?: StoryOutcome['id'];
}

export const STORY_STYLE_LABEL: Record<StoryStyle, string> = {
  detective: '탐정 사건',
  sorting: '분류 소동',
  courtroom: '모의 재판',
  'time-travel': '시간 여행',
  lab: '실험실 사건',
  adventure: '문제 해결 모험',
  classroom: '교실 수업',
};

export const EMOTION_LABEL: Record<Emotion, string> = {
  joy: '기쁨',
  confident: '자신감',
  surprised: '놀람',
  doubt: '의심',
  flustered: '당황',
  sad: '슬픔',
  angry: '분노',
  focused: '집중',
  curious: '호기심',
  shy: '부끄러움',
  confused: '혼란',
};

export const MOTION_LABEL: Record<MotionId, string> = {
  idle: '대기',
  breathe: '호흡',
  walk: '걷기',
  run: '달리기',
  sit: '앉기',
  'stand-up': '일어나기',
  'raise-hand': '손들기',
  nod: '고개 끄덕이기',
  'shake-head': '고개 젓기',
  explain: '손짓하며 설명',
  'point-board': '칠판 가리키기',
  'read-book': '책 읽기',
  write: '필기하기',
  surprised: '놀라기',
  laugh: '웃기',
  angry: '화내기',
  sad: '슬퍼하기',
  flustered: '당황하기',
  think: '고민하기',
  'pick-up': '물건 집기',
};

export const BACKGROUND_LABEL: Record<BackgroundId, string> = {
  classroom: '교실',
  library: '도서관',
  lab: '실험실',
  courtroom: '법정',
  office: '탐정 사무소',
  village: '옛 마을',
  park: '공원',
};

export const CAMERA_LABEL: Record<CameraKind, string> = {
  static: '고정',
  'zoom-in': '줌인',
  'zoom-out': '줌아웃',
  'pan-left': '왼쪽으로 이동',
  'pan-right': '오른쪽으로 이동',
  'focus-speaker': '말하는 인물 추적',
  board: '칠판·자료 확대',
};
