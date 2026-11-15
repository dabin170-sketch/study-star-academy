# 데이터 구조와 학습 알고리즘

## 1. 저장소(IndexedDB, `apps/web/src/storage/db.ts`)

모든 엔터티는 `id(UUID) · createdAt · updatedAt · schemaVersion`을 가집니다. 타입 정의는 `packages/shared/src/types.ts`.

| 테이블 | 엔터티 | 주요 관계 |
|---|---|---|
| profile | UserProfile(설정 포함) | |
| subjects | StudySubject(시험 날짜·범위 메모) | 1:N documents |
| documents / blobs | StudyDocument / 원본 파일 | 1:N pages, chunks, concepts |
| pages, chunks | DocumentPage, DocumentChunk(문단·제목 경로) | |
| concepts, evidence | Concept, ConceptEvidence(문단 ID·시작 위치·원문 인용) | Concept 1:N Evidence |
| relations | ConceptRelation | (지식 그래프용, 개발 예정) |
| flashcards, reviewLogs | Flashcard(FSRS 상태), ReviewLog(전·후 상태, 알고리즘·파라미터 해시) | Concept 1:N Flashcard |
| questions | Question(정답·근거·루브릭, 자동/직접 구분) | Concept 1:N Question |
| exams, attempts | Exam, ExamAttempt(답안·다시 보기·자기채점) | |
| answers | AnswerRecord(문항별 기록) | Question 1:N AnswerRecord |
| mistakes | MistakeRecord(원인·메모·재도전일) | |
| sessions, goals | StudySession(공부 시간), StudyGoal | |
| blankReviews | BlankReviewAttempt(개념별 판정) | |
| xpEvents, achievements, inventory | 보상(고유 sourceKey), 업적, 장식 | |
| rooms | 친구 광장 복구 정보 | |
| storyProjects | StoryProject(에피소드 전체, 형식·컷 레이아웃, 개념 스냅숏) | Document 1:N StoryProject |
| castCustomizations | CastCustomization(캐릭터 이름·색 변경) | |
| playbackProgress | PlaybackProgress(마지막 장면·선택 기록·완료 여부) | StoryProject 1:1 |

### 삭제 정책
자료를 지우면 원본·문단·개념·근거·자동 생성 카드/문항·그 문항의 오답이 지워지고, **정답 기록·복습 기록·공부 시간은 통계를 위해 남습니다.** 직접 만든 문항은 출처 연결만 끊깁니다. 개념을 ‘제외’하면 자동 문항은 지우고 카드는 기록 보존을 위해 ‘보류’ 처리합니다.

### 이야기 극장 데이터 이전(비파괴)
DB `version(2)`는 위 세 테이블을 **추가만** 하고 기존 테이블은 건드리지 않습니다. 백업 형식은 v3이며, v2 백업을 가져오면 `migrateV2toV3`가 빈 테이블을 채워 넣습니다(테스트 포함).

### 스키마 변경
Dexie `version(n+1).stores(...).upgrade(...)`로 옮기고, 백업 형식은 `packages/shared/src/backup.ts`의 `MIGRATIONS`에 단계를 추가합니다(테스트 포함).

## 2. 근거 기반 개념 추출(`packages/learning-engine/src/extract.ts`)

1. 문서 → 문단(제목·문단·목록·표)으로 구조화. PDF는 두 단을 먼저 나눈 뒤 줄을 만들어 문장이 섞이지 않게 합니다.
2. 문장 패턴: “X(이)란 …”, “X은 … 말한다/의미한다/정의된다”, “…을 X라고 한다”, “X의 유형에는 …이 있다”, “X은 …하는 [명사]이다”, “A와 B의 차이”, “용어: 설명”, 영문 정의, ‘~절차/단계’ 제목 아래 목록.
3. 개념의 설명(statement)은 **원문 문장 그대로**이고, 근거의 `quote`는 항상 `chunk.text.slice(start, start + quote.length)`와 같습니다(테스트로 보장).
4. 신뢰도 0.7 미만, 스캔 의심 페이지, 정의 없이 제목에만 나온 용어 → **확인 필요**(문항 생성 제외).
5. 중요도: 제목에 있거나 4회 이상 등장 → 3, 2회 이상 → 2.
6. 사용자가 고친 개념은 `userEdited`로 표시되고, 이후 카드·문항이 고친 내용으로 다시 만들어집니다(카드 복습 일정은 유지).

## 3. 문항 생성과 채점

- 객관식: 근거 문장에서 용어를 가리고(○○) 같은 종류의 다른 개념을 오답 보기로 사용 → 정답이 항상 원문에서 결정됩니다.
- 빈칸·단답: 가린 용어가 정답, 괄호 속 영문 별칭도 정답 인정. 띄어쓰기·문장부호·끝 조사 하나는 무시.
- 참·거짓: 원문 그대로(O) / 다른 개념의 원문에 용어만 바꿔 넣은 문장(X, 해설에 출처 명시).
- 서술형: 루브릭 = 용어 사용(1점) + 원문 핵심어 두 묶음(각 2점). 핵심어 포함 여부는 ‘참고 점수’로만 보여 주고, 확정 점수는 사용자가 정합니다.

## 4. 간격 반복(FSRS-4.5, `fsrs.ts`)

공개 FSRS-4.5 수식과 기본 파라미터 17개를 사용합니다. 목표 기억 유지율(기본 90%)은 설정에서 바꿀 수 있고, 복습 기록마다 알고리즘 이름과 파라미터 해시를 저장합니다. 처음 보는 카드의 ‘다시/어려움’은 1분/6분 학습 단계, 잊은 카드는 10분 뒤 다시 배우기.

## 5. 숙련도와 추천(`mastery.ts`)

- 정확도: 최근 기록일수록 큰 가중치(1, 0.8, 0.64 …).
- 숙련도 = 정확도 × (0.6 + 0.4 × min(1, 기록 수/5)) × (0.5 + 0.5 × 카드 평균 기억 확률)
- 상태: 기록 없음 → 처음 보는 개념 / 마지막 2회 연속 오답 → 반복 오답 / 정확도 85%↑·3회↑ → 숙달 / 객관식은 잘하는데 회상이 약함 → 암기 부족 / 회상은 되는데 서술형이 약함 → 적용 부족 / 그 외 학습 중
- 추천 점수 = w취약×(1−숙련도) + w초과×min(1, 초과일/7) + w중요×(중요도−1)/2 + w시험×임박도(30일 전부터). 가중치는 설정에서 조절하고, 추천마다 이유 문장을 보여 줍니다.

## 6. 보상(`rewards.ts`)

- 카드 복습: 1~4 XP, 같은 카드는 하루 1회만(sourceKey 고유 제약).
- 시험: 문항 수 × 3 × 정답률(+90% 이상이면 10).
- 백지 복습: 회상률 × 20, 오답 극복: 8, 던전: 첫 시도 정답만 3(같은 문항 하루 1회).
- 레벨 L 도달 누적 XP = 50 × L × (L−1) / 2. 식물 단계는 누적량 기준이라 쉬어도 줄지 않습니다.

## 7. 실시간 프로토콜(`packages/shared/src/room.ts`)

REST: `GET /health`, `POST /api/rooms`, `POST /api/rooms/:code/join`, `GET /api/rooms/:code/state`, `POST /api/rooms/:code/leave`, `POST /api/rooms/:code/quiz/start`, `POST /api/rooms/:code/quiz/submit`, `GET /api/rooms/:code/results` (입장 이후 요청은 `x-participant-id`, `x-recovery-token` 헤더 필요)

Socket.IO: `room:join`, `room:reconnect`, `room:leave`, `room:participant-update`, `room:state`, `room:error`, `timer:start|pause|resume|reset|sync`, `quiz:start`, `quiz:answer`, `quiz:result`

공부 시간은 `누적 시간 + (서버 현재 시각 − 공부 시작 시각)`으로 계산하고, 클라이언트는 서버 시각과의 차이를 보정해 표시합니다. 상태에는 순번(seq)이 있어 늦게 도착한 오래된 상태를 버립니다.

## 8. 이야기 극장(`packages/learning-engine/src/story`, `packages/animation-engine`)

- **생성**: 선택한 개념마다 사건 → 오해 → 시도 → 결과 → 선택(정답/오답 피드백 장면) → 단서 → 이해 → 해결 뼈대를 만들고, 마지막에 요약·결말을 붙입니다. 피드백 장면은 다음 본편 장면으로 합류합니다. 시드 난수로 배역·대사 변형을 고릅니다.
- **대사 구분**: `source`(원문 그대로 + 근거), `derived`(원문의 용어·핵심어로 만든 요약 + 근거), `fiction`(이야기 설정). 화면에 노란색/파란색/보라색 표시로 구분합니다.
- **검증**(`validateEpisode`): 근거 없음, 원문 대사 수정, 인용 불일치, 자료 변경, 개념 삭제, 정답 개수, 끊긴 링크, 도달 불가 장면, 순환, 결말 없음, 정답 충돌.
- **리그**: 고정 관절 위치(어깨·팔꿈치·손목·엉덩이·무릎·발목) 순운동학. 뼈 길이는 모든 동작·시각에서 일정하고(테스트), 각도는 관절 범위로 제한합니다. 동작 전환은 300ms 보간.
- **카메라**: SVG viewBox 이동, 흔들림 최대 3px.
- **함께 보기 프로토콜**: `play:load`(방장, 에피소드 ≤ 300KB) → 서버가 `play:episode` 방송, `play:control {sceneId, lineIndex, playing, elapsedMs}`(방장만), `play:vote`(참가자당 1표, 변경 가능, 20초 또는 전원 투표 시 결정, 다수결·동점은 방장 표), `play:stop`. 재접속하면 서버가 현재 에피소드를 다시 보냅니다.
