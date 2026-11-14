/**
 * 백업 파일 형식과 마이그레이션.
 *
 * 스키마 이력
 *  v1 : 초기 형식. concepts에 `definition` 필드, `status` 없음.
 *       flashcards에 `due`, `interval`, `ease`(SM-2 계열) 필드.
 *  v2 : concepts.definition → statement, status/confidence/userNote 추가.
 *       flashcards는 FSRS 스케줄 상태(sched)로 변환.
 *
 * 마이그레이션은 데이터를 지우지 않는다. 알 수 없는 필드는 그대로 둔다.
 */
import { SCHEMA_VERSION } from './types';

export const BACKUP_APP_ID = 'study-star-academy';
export const BACKUP_VERSION = SCHEMA_VERSION;

export const BACKUP_TABLES = [
  'profile',
  'subjects',
  'documents',
  'pages',
  'chunks',
  'concepts',
  'evidence',
  'relations',
  'flashcards',
  'reviewLogs',
  'questions',
  'exams',
  'attempts',
  'answers',
  'mistakes',
  'sessions',
  'goals',
  'blankReviews',
  'xpEvents',
  'achievements',
  'rooms',
  'inventory',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  backupVersion: number;
  exportedAt: string;
  tables: Partial<Record<BackupTable, Record<string, unknown>[]>>;
}

export class BackupError extends Error {}

type AnyRow = Record<string, unknown>;

const DAY = 86_400_000;

function migrateV1toV2(file: BackupFile): BackupFile {
  const tables = { ...file.tables };
  tables.concepts = (tables.concepts ?? []).map((c: AnyRow) => {
    const { definition, ...rest } = c;
    return {
      statement: typeof definition === 'string' ? definition : '',
      status: 'needs-check', // v1에는 근거 검증 정보가 없었으므로 확인 필요로 표시
      confidence: 0.5,
      userNote: '',
      userEdited: false,
      aliases: [],
      ...rest,
      schemaVersion: 2,
    };
  });
  tables.flashcards = (tables.flashcards ?? []).map((f: AnyRow) => {
    if (f.sched) return { ...f, schemaVersion: 2 };
    const { due, interval, ease, ...rest } = f as AnyRow & { due?: number; interval?: number; ease?: number };
    const intervalDays = typeof interval === 'number' ? interval : 0;
    const easeVal = typeof ease === 'number' ? ease : 2.5;
    return {
      ...rest,
      algorithm: 'fsrs-4.5',
      suspended: false,
      sched: {
        due: typeof due === 'number' ? due : Date.now(),
        // SM-2 간격을 안정도의 근사값으로 사용(간격 = 90% 유지율에서의 안정도)
        stability: Math.max(intervalDays, 0.1),
        // ease 1.3~2.5+ 를 난이도 10~1 로 선형 변환
        difficulty: Math.min(10, Math.max(1, 10 - ((easeVal - 1.3) / 1.2) * 9)),
        reps: intervalDays > 0 ? 1 : 0,
        lapses: 0,
        state: intervalDays > 0 ? 'review' : 'new',
        lastReview: typeof due === 'number' && intervalDays > 0 ? due - intervalDays * DAY : undefined,
      },
      schemaVersion: 2,
    };
  });
  return { ...file, backupVersion: 2, tables };
}

const MIGRATIONS: Record<number, (f: BackupFile) => BackupFile> = {
  1: migrateV1toV2,
};

/** 백업 JSON을 검증하고 현재 버전으로 올린다. */
export function migrateBackup(raw: unknown): BackupFile {
  if (!raw || typeof raw !== 'object') throw new BackupError('백업 파일 형식이 아닙니다.');
  const file = raw as BackupFile;
  if (file.app !== BACKUP_APP_ID) throw new BackupError('공부별 아카데미에서 만든 백업 파일이 아닙니다.');
  if (typeof file.backupVersion !== 'number' || file.backupVersion < 1)
    throw new BackupError('백업 버전 정보가 없습니다.');
  if (file.backupVersion > BACKUP_VERSION)
    throw new BackupError('더 새로운 버전에서 만든 백업입니다. 앱을 새로고침해 최신 버전으로 업데이트한 뒤 다시 시도해 주세요.');
  if (!file.tables || typeof file.tables !== 'object') throw new BackupError('백업에 데이터가 없습니다.');
  for (const [name, rows] of Object.entries(file.tables)) {
    if (!(BACKUP_TABLES as readonly string[]).includes(name)) continue;
    if (!Array.isArray(rows)) throw new BackupError(`${name} 데이터 형식이 잘못되었습니다.`);
    for (const row of rows) {
      if (!row || typeof row !== 'object' || typeof (row as AnyRow).id !== 'string')
        throw new BackupError(`${name} 항목에 id가 없습니다.`);
    }
  }
  let current = file;
  while (current.backupVersion < BACKUP_VERSION) {
    const step = MIGRATIONS[current.backupVersion];
    if (!step) throw new BackupError(`버전 ${current.backupVersion}에서 올리는 방법이 없습니다.`);
    current = step(current);
  }
  return current;
}

/**
 * 가져오기 충돌 처리: 같은 id가 있으면 updatedAt이 더 최신인 쪽을 남긴다.
 * 어느 쪽 데이터도 조용히 사라지지 않도록, 밀려난 기존 행은 conflicts로 돌려준다.
 */
export function mergeRows<T extends { id: string; updatedAt?: number }>(
  existing: T[],
  incoming: T[],
): { merged: T[]; conflicts: { kept: T; replaced: T }[] } {
  const map = new Map(existing.map((r) => [r.id, r]));
  const conflicts: { kept: T; replaced: T }[] = [];
  for (const row of incoming) {
    const old = map.get(row.id);
    if (!old) {
      map.set(row.id, row);
      continue;
    }
    const oldTime = old.updatedAt ?? 0;
    const newTime = row.updatedAt ?? 0;
    if (newTime >= oldTime) {
      if (JSON.stringify(old) !== JSON.stringify(row)) conflicts.push({ kept: row, replaced: old });
      map.set(row.id, row);
    } else {
      conflicts.push({ kept: old, replaced: row });
    }
  }
  return { merged: [...map.values()], conflicts };
}
