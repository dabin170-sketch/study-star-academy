/**
 * 백업 내보내기·가져오기. 가져올 때 기존 데이터를 지우지 않고 병합하며,
 * 같은 항목이 다르면 더 최근에 수정된 쪽을 남기고 밀려난 쪽은 충돌 보관함(meta)에 저장한다.
 */
import { BACKUP_APP_ID, BACKUP_TABLES, BACKUP_VERSION, mergeRows, migrateBackup, type BackupFile, type BackupTable } from '@academy/shared';
import { db, setMeta, getMeta } from './db';

type AnyTable = { toArray(): Promise<unknown[]>; bulkPut(rows: unknown[]): Promise<unknown> };

function table(name: BackupTable): AnyTable {
  return (db as unknown as Record<string, AnyTable>)[name];
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

function base64ToBlob(b64: string, type = 'application/octet-stream'): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

export interface BackupWithFiles extends BackupFile {
  files?: { id: string; type: string; data: string }[];
}

export async function exportBackup(includeOriginals: boolean): Promise<BackupWithFiles> {
  const tables: BackupFile['tables'] = {};
  for (const name of BACKUP_TABLES) tables[name] = (await table(name).toArray()) as Record<string, unknown>[];
  const out: BackupWithFiles = { app: BACKUP_APP_ID, backupVersion: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables };
  if (includeOriginals) {
    out.files = [];
    for (const b of await db.blobs.toArray()) out.files.push({ id: b.id, type: b.blob.type, data: await blobToBase64(b.blob) });
  }
  return out;
}

export function downloadJson(data: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export interface ImportSummary {
  added: number;
  updated: number;
  conflicts: number;
  files: number;
}

export async function importBackup(raw: unknown): Promise<ImportSummary> {
  const file = migrateBackup(raw) as BackupWithFiles;
  const summary: ImportSummary = { added: 0, updated: 0, conflicts: 0, files: 0 };
  const conflictStore = await getMeta<unknown[]>('importConflicts', []);
  await db.transaction('rw', db.tables, async () => {
    for (const name of BACKUP_TABLES) {
      const incoming = (file.tables[name] ?? []) as { id: string; updatedAt?: number }[];
      if (!incoming.length) continue;
      const existing = (await table(name).toArray()) as { id: string; updatedAt?: number }[];
      const existingIds = new Set(existing.map((r) => r.id));
      const { merged, conflicts } = mergeRows(existing, incoming);
      const incomingSet = new Set<unknown>(incoming);
      summary.added += incoming.filter((r) => !existingIds.has(r.id)).length;
      summary.updated += conflicts.filter((c) => incomingSet.has(c.kept)).length;
      summary.conflicts += conflicts.filter((c) => !incomingSet.has(c.kept)).length;
      for (const c of conflicts) conflictStore.push({ table: name, kept: c.kept.id, replaced: c.replaced, at: Date.now() });
      // xpEvents/achievements는 고유 키가 있어 bulkPut 대신 하나씩 넣는다
      if (name === 'xpEvents' || name === 'achievements') {
        for (const r of merged) {
          try {
            await table(name).bulkPut([r]);
          } catch {
            /* 같은 보상·업적이 다른 id로 이미 있음 */
          }
        }
      } else {
        await table(name).bulkPut(merged);
      }
    }
    for (const f of file.files ?? []) {
      await db.blobs.put({ id: f.id, blob: base64ToBlob(f.data, f.type) });
      summary.files++;
    }
  });
  await setMeta('importConflicts', conflictStore.slice(-500));
  return summary;
}

/** 모든 개인 데이터 삭제(사용자가 확인 문구를 입력한 경우에만 호출) */
export async function wipeAllData() {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
}
