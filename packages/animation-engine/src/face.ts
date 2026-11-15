/**
 * 표정: 감정마다 눈썹·눈·입·볼·땀·눈물 상태를 정한다.
 * 대사의 말투·문장부호로 감정과 모션을 추천하지만, 편집기에서 언제든 바꿀 수 있다.
 */
import type { Emotion, MotionId } from '@academy/shared';

export type EyeShape = 'open' | 'happy' | 'wide' | 'narrow' | 'closed' | 'swirl' | 'look-up';
export type MouthShape = 'smile' | 'grin' | 'open' | 'o' | 'frown' | 'flat' | 'wavy' | 'smirk' | 'shout';

export interface FaceParams {
  /** 눈썹 기울기(°, +는 바깥쪽이 올라감)와 높이(px, −가 위) */
  browAngle: number;
  browY: number;
  eyes: EyeShape;
  mouth: MouthShape;
  blush: boolean;
  sweat: boolean;
  tear: boolean;
  anger: boolean;
}

export const FACES: Record<Emotion, FaceParams> = {
  joy: { browAngle: 6, browY: -2, eyes: 'happy', mouth: 'grin', blush: true, sweat: false, tear: false, anger: false },
  confident: { browAngle: -10, browY: 0, eyes: 'narrow', mouth: 'smirk', blush: false, sweat: false, tear: false, anger: false },
  surprised: { browAngle: 4, browY: -7, eyes: 'wide', mouth: 'o', blush: false, sweat: false, tear: false, anger: false },
  doubt: { browAngle: -14, browY: 0, eyes: 'narrow', mouth: 'flat', blush: false, sweat: false, tear: false, anger: false },
  flustered: { browAngle: 14, browY: -3, eyes: 'swirl', mouth: 'wavy', blush: true, sweat: true, tear: false, anger: false },
  sad: { browAngle: 18, browY: -1, eyes: 'closed', mouth: 'frown', blush: false, sweat: false, tear: true, anger: false },
  angry: { browAngle: -22, browY: 2, eyes: 'narrow', mouth: 'shout', blush: false, sweat: false, tear: false, anger: true },
  focused: { browAngle: -8, browY: 1, eyes: 'open', mouth: 'flat', blush: false, sweat: false, tear: false, anger: false },
  curious: { browAngle: 8, browY: -4, eyes: 'wide', mouth: 'smile', blush: false, sweat: false, tear: false, anger: false },
  shy: { browAngle: 12, browY: -1, eyes: 'happy', mouth: 'wavy', blush: true, sweat: false, tear: false, anger: false },
  confused: { browAngle: 16, browY: -2, eyes: 'look-up', mouth: 'wavy', blush: false, sweat: true, tear: false, anger: false },
};

const RULES: [RegExp, Emotion][] = [
  [/(헉|으악|뭐라고|세상에|진짜\?!|어\?!|!\?|\?!)/, 'surprised'],
  [/(미안|어떡|어쩌지|아차|앗|헷갈려서)/, 'flustered'],
  [/(흥|말도 안 돼|왜 안|화가)/, 'angry'],
  [/(아쉽|슬프|속상|실패)/, 'sad'],
  [/(부끄|쑥스)/, 'shy'],
  [/(근거|살펴보|분석|정리하면|핵심어|단서)/, 'focused'],
  [/(아닌 것 같|정말 그럴까|이상한데|의심|틀린)/, 'doubt'],
  [/(음+\.\.\.|음…|글쎄|모르겠|헷갈)/, 'confused'],
  [/(내가 맞|확실|당연|자신 있|내 생각엔)/, 'confident'],
  [/(\?$|궁금|뭘까|왜\?|어떻게)/, 'curious'],
  [/(좋아|맞아|알겠|그렇구나|해냈|정답|고마워|대단)/, 'joy'],
];

export function suggestEmotion(text: string, fallback: Emotion = 'focused'): Emotion {
  for (const [re, e] of RULES) if (re.test(text)) return e;
  return fallback;
}

export function suggestMotion(text: string, emotion: Emotion): MotionId {
  if (/(칠판|여기 보|이걸 보|화면을)/.test(text)) return 'point-board';
  if (/(적어|메모|필기)/.test(text)) return 'write';
  if (/(책|자료를 펼|읽어)/.test(text)) return 'read-book';
  if (/(저요|손을 들|질문 있)/.test(text)) return 'raise-hand';
  if (/(맞아|그래|응,)/.test(text)) return 'nod';
  if (/(아니야|아니에요|그건 아니)/.test(text)) return 'shake-head';
  const byEmotion: Partial<Record<Emotion, MotionId>> = {
    surprised: 'surprised',
    flustered: 'flustered',
    angry: 'angry',
    sad: 'sad',
    confused: 'think',
    doubt: 'think',
    joy: 'laugh',
    focused: 'explain',
  };
  return byEmotion[emotion] ?? 'idle';
}
