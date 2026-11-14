/**
 * 소크라테스식 질문 템플릿(로컬 AI 모델 없이 동작).
 * 질문은 개념의 원문 근거와 종류에 따라 고른다. 답을 대신 써 주지 않고 스스로 설명하도록 유도한다.
 */
import type { ConceptKind } from '@academy/shared';

export type TutorMode = 'beginner' | 'college' | 'exam' | 'example' | 'compare' | 'teach';

export const TUTOR_MODE_LABEL: Record<TutorMode, string> = {
  beginner: '초보자 설명',
  college: '대학 강의 수준',
  exam: '임용시험 수준',
  example: '예시 중심',
  compare: '비교 중심',
  teach: '친구에게 가르치기',
};

export function socraticQuestions(term: string, kind: ConceptKind, mode: TutorMode, related: string[] = []): string[] {
  const other = related[0];
  const base: Record<TutorMode, string[]> = {
    beginner: [
      `‘${term}’을(를) 처음 듣는 사람에게 한 문장으로 말한다면 어떻게 말하겠어요?`,
      `‘${term}’에서 가장 중요한 단어 하나를 고른다면 무엇이고, 왜 그런가요?`,
      `일상생활에서 ‘${term}’과 비슷한 장면을 하나 떠올려 볼까요?`,
    ],
    college: [
      `‘${term}’의 정의를 구성하는 요소를 나누어 말해 보세요. 각 요소가 빠지면 어떤 문제가 생기나요?`,
      `‘${term}’이(가) 성립하기 위한 조건은 무엇인가요?`,
      `이 개념이 강의 전체 흐름에서 어떤 역할을 하는지 설명해 보세요.`,
    ],
    exam: [
      `‘${term}’을(를) 서술형 답안으로 쓴다면 반드시 들어가야 할 핵심어 3개는 무엇인가요?`,
      `학교 현장 사례에서 ‘${term}’을(를) 적용해야 하는 상황을 하나 구성하고, 그 근거를 설명해 보세요.`,
      `채점자가 ‘${term}’ 답안에서 감점할 만한 흔한 오류는 무엇일까요?`,
    ],
    example: [
      `‘${term}’에 해당하는 예시 하나와, 비슷해 보이지만 해당하지 않는 예시 하나를 들어 보세요.`,
      `내가 든 예시가 ‘${term}’에 해당한다고 판단한 근거는 정의의 어느 부분인가요?`,
    ],
    compare: [
      other ? `‘${term}’과(와) ‘${other}’은(는) 무엇이 같고 무엇이 다른가요?` : `‘${term}’과(와) 가장 헷갈리는 개념은 무엇이고, 어떻게 구별하나요?`,
      `두 개념을 구별하는 기준을 하나만 고른다면 무엇인가요?`,
    ],
    teach: [
      `이 개념을 모르는 친구가 “그래서 그게 왜 중요해?”라고 묻는다면 뭐라고 답할까요?`,
      `친구가 ‘${term}’을(를) 잘못 이해할 만한 지점은 어디일까요? 미리 바로잡아 주세요.`,
      `설명을 마친 뒤 친구에게 낼 확인 질문을 하나 만들어 보세요.`,
    ],
  };
  const extra: Partial<Record<ConceptKind, string>> = {
    classification: `‘${term}’의 하위 유형을 모두 말할 수 있나요? 유형을 나누는 기준은 무엇인가요?`,
    procedure: `‘${term}’의 단계를 순서대로 말해 보세요. 순서가 바뀌면 무슨 일이 생기나요?`,
    principle: `‘${term}’이(가) 적용되는 장면과 적용되지 않는 장면을 구별해 보세요.`,
    'person-theory': `이 이론이 설명하려는 문제는 무엇이었고, 한계는 무엇인가요?`,
    comparison: `비교하는 두 대상의 차이를 표로 정리한다면 어떤 기준으로 칸을 나누겠어요?`,
  };
  return extra[kind] ? [...base[mode], extra[kind]!] : base[mode];
}
