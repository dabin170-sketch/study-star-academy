/**
 * IndexedDB(Dexie) — 개인 학습 데이터의 기본 저장소.
 * 스키마를 바꿀 때는 version(n+1)을 추가하고 upgrade()로 기존 데이터를 옮긴다(데이터 삭제 금지).
 */
import Dexie, { type Table } from 'dexie';
import {
  SCHEMA_VERSION,
  type Achievement,
  type AnswerRecord,
  type BaseEntity,
  type BlankReviewAttempt,
  type Concept,
  type ConceptEvidence,
  type ConceptRelation,
  type DocumentChunk,
  type DocumentPage,
  type Exam,
  type ExamAttempt,
  type Flashcard,
  type MistakeRecord,
  type Question,
  type ReviewLog,
  type StudyDocument,
  type StudyGoal,
  type StudyRoomLocal,
  type StudySession,
  type StudySubject,
  type UserProfile,
  type XpEvent,
} from '@academy/shared';

export interface BlobRow {
  id: string; // documentId
  blob: Blob;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export interface InventoryItem extends BaseEntity {
  itemKey: string;
  placed: boolean;
}

export class AcademyDB extends Dexie {
  profile!: Table<UserProfile, string>;
  subjects!: Table<StudySubject, string>;
  documents!: Table<StudyDocument, string>;
  blobs!: Table<BlobRow, string>;
  pages!: Table<DocumentPage, string>;
  chunks!: Table<DocumentChunk, string>;
  concepts!: Table<Concept, string>;
  evidence!: Table<ConceptEvidence, string>;
  relations!: Table<ConceptRelation, string>;
  flashcards!: Table<Flashcard, string>;
  reviewLogs!: Table<ReviewLog, string>;
  questions!: Table<Question, string>;
  exams!: Table<Exam, string>;
  attempts!: Table<ExamAttempt, string>;
  answers!: Table<AnswerRecord, string>;
  mistakes!: Table<MistakeRecord, string>;
  sessions!: Table<StudySession, string>;
  goals!: Table<StudyGoal, string>;
  blankReviews!: Table<BlankReviewAttempt, string>;
  xpEvents!: Table<XpEvent, string>;
  achievements!: Table<Achievement, string>;
  rooms!: Table<StudyRoomLocal, string>;
  inventory!: Table<InventoryItem, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'study-star-academy') {
    super(name);
    this.version(1).stores({
      profile: 'id',
      subjects: 'id, updatedAt',
      documents: 'id, subjectId, updatedAt',
      blobs: 'id',
      pages: 'id, documentId, [documentId+pageNumber]',
      chunks: 'id, documentId, [documentId+index]',
      concepts: 'id, documentId, subjectId, status, term',
      evidence: 'id, conceptId, documentId',
      relations: 'id, fromId, toId',
      flashcards: 'id, subjectId, conceptId, documentId, sched.due',
      reviewLogs: 'id, cardId, conceptId, reviewedAt',
      questions: 'id, subjectId, conceptId, documentId, origin',
      exams: 'id, subjectId, createdAt',
      attempts: 'id, examId, status, startedAt',
      answers: 'id, questionId, conceptId, subjectId, answeredAt, attemptId',
      mistakes: 'id, questionId, conceptId, subjectId, resolved, retryAt',
      sessions: 'id, startedAt, activity, subjectId',
      goals: 'id',
      blankReviews: 'id, documentId, subjectId, createdAt',
      xpEvents: 'id, &sourceKey, createdAt',
      achievements: 'id, &key',
      rooms: 'id, code',
      inventory: 'id, itemKey',
      meta: 'key',
    });
  }
}

export let db = new AcademyDB();

/** 테스트에서 격리된 DB를 쓰기 위해 */
export function useDatabase(name: string) {
  db = new AcademyDB(name);
  return db;
}

export const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

/** 공통 필드를 채운 새 엔터티 */
export function entity<T extends object>(data: T, now = Date.now()): T & BaseEntity {
  return { id: uuid(), createdAt: now, updatedAt: now, schemaVersion: SCHEMA_VERSION, ...data };
}

export function touch<T extends BaseEntity>(row: T, patch: Partial<T>, now = Date.now()): T {
  return { ...row, ...patch, updatedAt: now };
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value });
}

export async function getDeviceId(): Promise<string> {
  let id = await getMeta<string | null>('deviceId', null);
  if (!id) {
    id = uuid();
    await setMeta('deviceId', id);
  }
  return id;
}

export class StorageError extends Error {}

/** 저장 실패(용량 부족 등)를 사용자에게 설명 가능한 오류로 바꾼다. */
export function explainStorageError(e: unknown): string {
  const name = (e as { name?: string; inner?: { name?: string } })?.name ?? '';
  const inner = (e as { inner?: { name?: string } })?.inner?.name ?? '';
  if (name === 'QuotaExceededError' || inner === 'QuotaExceededError')
    return '브라우저 저장 공간이 부족합니다. 설정 → 백업에서 데이터를 내보낸 뒤, 오래된 자료의 원본 파일을 삭제해 공간을 확보해 주세요.';
  if (name === 'InvalidStateError' || name === 'DatabaseClosedError')
    return '브라우저 저장소를 열 수 없습니다. 시크릿 모드이거나 저장소가 차단되어 있을 수 있습니다. 일반 창에서 다시 열어 주세요.';
  return `저장 중 문제가 생겼습니다(${name || '알 수 없는 오류'}). 페이지를 새로고침한 뒤 다시 시도해 주세요. 계속되면 설정 → 백업으로 데이터를 내보내 두세요.`;
}

export async function storageEstimate(): Promise<{ usage: number; quota: number; persisted: boolean } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  const persisted = (await navigator.storage.persisted?.()) ?? false;
  return { usage, quota, persisted };
}

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* 지원하지 않는 브라우저 */
  }
  return false;
}
