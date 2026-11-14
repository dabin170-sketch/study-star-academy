/**
 * 자체 제작 예시 학습자료(체험용). 실제 강의 자료를 대신하지 않으며, 시험 대비는 본인 강의 자료로 해 주세요.
 */
import { parseMarkdown } from '@academy/document-parser';
import { db, entity } from '../storage/db';
import { saveParsedDocument } from '../features/import/importDocument';

export const SAMPLE_TITLE = '[예시 자료] 행동지원과 개별화교육 기초';

export const SAMPLE_MARKDOWN = `# 행동지원과 개별화교육 기초

이 자료는 공부별 아카데미 체험을 위해 직접 작성한 예시 자료입니다. 실제 시험 대비는 본인의 강의 자료로 해 주세요.

## 1. 응용행동분석의 기본 개념

응용행동분석(Applied Behavior Analysis, ABA)이란 행동의 원리를 활용하여 사회적으로 의미 있는 행동을 체계적으로 개선하는 과학적 접근이다.

강화란 행동 뒤에 따르는 결과로 인해 그 행동이 앞으로 일어날 가능성이 증가하는 현상을 말한다.

정적 강화(positive reinforcement)는 행동 직후에 자극을 제시하여 그 행동의 발생 빈도를 높이는 것을 의미한다.

부적 강화(negative reinforcement)는 행동 직후에 불쾌한 자극을 제거하여 그 행동의 발생 빈도를 높이는 것을 의미한다.

벌이란 행동 뒤에 따르는 결과로 인해 그 행동이 앞으로 일어날 가능성이 감소하는 현상을 말한다.

- 소거: 이전에 강화되던 행동에 더 이상 강화를 제공하지 않아 그 행동이 점차 줄어드는 과정
- 촉구(prompt): 학습자가 올바른 반응을 하도록 돕기 위해 추가로 제공하는 단서나 도움

강화계획의 유형에는 연속 강화계획과 간헐 강화계획이 있다.

## 2. 행동의 기능평가

기능평가란 문제행동이 어떤 목적을 위해 일어나는지 파악하기 위해 정보를 수집하고 분석하는 과정을 말한다.

문제행동의 주요 기능에는 관심 얻기, 회피하기, 원하는 물건이나 활동 얻기, 감각 자극 얻기가 있다.

## 3. 기능평가 절차

1) 문제행동을 관찰하고 측정할 수 있도록 조작적으로 정의한다.
2) 면담과 관찰로 행동 전후의 상황에 대한 정보를 수집한다.
3) 수집한 정보를 바탕으로 행동의 기능에 대한 가설을 세운다.
4) 가설에 근거하여 행동지원 계획을 수립하고 실행한다.

## 4. 개별화교육계획

개별화교육계획(Individualized Education Program, IEP)이란 특수교육대상자 개인의 능력과 요구에 맞추어 교육 목표, 방법, 내용, 관련 서비스 등을 담은 계획을 말한다.

현행 수준이란 학생이 현재 해당 영역에서 할 수 있는 것과 어려워하는 것을 구체적으로 기술한 것을 의미한다.

교육 목표는 관찰 가능하고 측정 가능한 행동으로 진술하는 것이 바람직하다.

## 5. 전환교육

전환교육이란 학생이 학교를 졸업한 이후 성인으로서의 삶을 준비할 수 있도록 지원하는 교육을 말한다.

전환교육의 주요 영역에는 직업 생활, 독립 생활, 지역사회 참여, 여가 생활이 있다.

지원고용은 장애인이 일반 사업장에서 일하면서 직무지도원 등의 지원을 받는 고용 형태를 의미한다.
`;

export async function ensureDefaultSubject(name = '특수교육'): Promise<string> {
  const first = await db.subjects.toCollection().first();
  if (first) return first.id;
  const s = entity({ name, color: '#ddd0ff' });
  await db.subjects.add(s);
  return s.id;
}

export async function createSubject(name: string, color = '#ddd0ff') {
  const s = entity({ name: name.trim() || '새 과목', color });
  await db.subjects.add(s);
  return s.id;
}

let pending: Promise<string> | null = null;

/** 예시 자료를 한 번만 만든다(동시에 여러 번 눌러도 중복 생성되지 않음). */
export function loadSampleDocument(subjectId?: string): Promise<string> {
  if (!pending) pending = createSample(subjectId).finally(() => (pending = null));
  return pending;
}

async function createSample(subjectId?: string): Promise<string> {
  const existing = await db.documents.filter((d) => d.fileType === 'sample').first();
  if (existing) return existing.id;
  const sid = subjectId ?? (await ensureDefaultSubject());
  const parsed = parseMarkdown(SAMPLE_MARKDOWN, SAMPLE_TITLE);
  parsed.warnings = ['공부별 아카데미가 직접 만든 체험용 예시 자료입니다.', ...parsed.warnings.filter((w) => !w.includes('구간 번호'))];
  return saveParsedDocument({ subjectId: sid, parsed, fileName: 'sample.md', fileType: 'sample', fileSize: SAMPLE_MARKDOWN.length });
}
