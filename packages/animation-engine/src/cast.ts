/**
 * 이야기 극장 캐릭터 6명. 모두 같은 리그(비율)를 쓰고 머리 모양·색·소품·말투로 구별한다.
 * 캐릭터 ID로 디자인 프로필을 찾으므로 컷마다 외형이 바뀌지 않는다.
 */
import type { CastId, Emotion, MotionId } from '@academy/shared';

export type HairStyle = 'bob' | 'spiky' | 'curly' | 'ponytail' | 'short' | 'sidepart';
export type Accessory = 'star-pin' | 'cap' | 'none' | 'glasses' | 'goggles' | 'headband';

export interface CastProfile {
  id: CastId;
  name: string;
  role: string;
  personality: string;
  skin: string;
  hair: string;
  outfit: string;
  accent: string;
  hairStyle: HairStyle;
  accessory: Accessory;
  /** 키 배율(비율은 그대로, 전체 크기만 다름) */
  scale: number;
  /** 말투 설명 */
  speech: string;
  /** 즐겨 하는 동작·표정(같은 장면에서도 성격이 드러나게) */
  habitMotion: MotionId;
  habitEmotion: Emotion;
  /** 브라우저 음성 높낮이·속도 */
  voice: { pitch: number; rate: number };
}

export const CAST: Record<CastId, CastProfile> = {
  hana: {
    id: 'hana',
    name: '하나 선생님',
    role: '친절한 설명 담당',
    personality: '차분하고 다정하며, 정답보다 생각의 과정을 먼저 묻는다.',
    skin: '#ffe2cf',
    hair: '#5b4636',
    outfit: '#c7b5ff',
    accent: '#9b83e6',
    hairStyle: 'bob',
    accessory: 'star-pin',
    scale: 1.05,
    speech: '부드러운 해요체',
    habitMotion: 'explain',
    habitEmotion: 'joy',
    voice: { pitch: 1.05, rate: 0.98 },
  },
  doto: {
    id: 'doto',
    name: '도토',
    role: '질문 많은 호기심 담당',
    personality: '궁금한 건 못 참고 “왜?”를 입에 달고 산다.',
    skin: '#ffe8d6',
    hair: '#8a5a3b',
    outfit: '#ffc9da',
    accent: '#f08fb0',
    hairStyle: 'curly',
    accessory: 'cap',
    scale: 0.92,
    speech: '밝은 반말, 질문이 많음',
    habitMotion: 'raise-hand',
    habitEmotion: 'curious',
    voice: { pitch: 1.35, rate: 1.08 },
  },
  mungchi: {
    id: 'mungchi',
    name: '뭉치',
    role: '오개념을 던지는 사고뭉치',
    personality: '자신만만하게 먼저 말하고, 틀리면 금방 인정한다.',
    skin: '#f6d2b0',
    hair: '#2f2a3a',
    outfit: '#ffeea0',
    accent: '#e8c13d',
    hairStyle: 'spiky',
    accessory: 'none',
    scale: 0.96,
    speech: '자신만만한 반말',
    habitMotion: 'laugh',
    habitEmotion: 'confident',
    voice: { pitch: 0.95, rate: 1.12 },
  },
  seoyun: {
    id: 'seoyun',
    name: '서윤',
    role: '침착한 분석 담당',
    personality: '말수가 적지만 근거를 꼭 짚고 넘어간다.',
    skin: '#ffe4d4',
    hair: '#1f2f4f',
    outfit: '#cfe6ff',
    accent: '#6fa8e8',
    hairStyle: 'ponytail',
    accessory: 'glasses',
    scale: 0.98,
    speech: '차분한 반말, “근거는…”',
    habitMotion: 'think',
    habitEmotion: 'focused',
    voice: { pitch: 1.0, rate: 0.95 },
  },
  rio: {
    id: 'rio',
    name: '리오',
    role: '실험·시연 담당',
    personality: '직접 해 봐야 직성이 풀리고, 예시를 보여 주는 걸 좋아한다.',
    skin: '#e9c29e',
    hair: '#c0672e',
    outfit: '#c4f0dc',
    accent: '#4fbf93',
    hairStyle: 'short',
    accessory: 'goggles',
    scale: 1.0,
    speech: '씩씩한 반말, “직접 해 보자!”',
    habitMotion: 'pick-up',
    habitEmotion: 'joy',
    voice: { pitch: 1.1, rate: 1.05 },
  },
  kangha: {
    id: 'kangha',
    name: '강하',
    role: '문제를 내는 라이벌',
    personality: '도도하지만 공정하다. 잘 맞히면 솔직하게 인정한다.',
    skin: '#ffe0cc',
    hair: '#6b2f4f',
    outfit: '#f0eaff',
    accent: '#7b5ea7',
    hairStyle: 'sidepart',
    accessory: 'headband',
    scale: 1.02,
    speech: '도도한 반말, 도전적인 질문',
    habitMotion: 'angry',
    habitEmotion: 'doubt',
    voice: { pitch: 0.9, rate: 1.0 },
  },
};

export const CAST_IDS = Object.keys(CAST) as CastId[];
