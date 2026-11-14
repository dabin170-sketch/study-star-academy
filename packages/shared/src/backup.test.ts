import { describe, expect, it } from 'vitest';
import { BackupError, BACKUP_VERSION, mergeRows, migrateBackup } from './backup';

describe('migrateBackup', () => {
  it('v1 백업의 개념을 v2 형식으로 올리고 데이터는 보존한다', () => {
    const v1 = {
      app: 'study-star-academy',
      backupVersion: 1,
      exportedAt: '2026-01-01',
      tables: {
        concepts: [{ id: 'c1', term: '강화', definition: '행동의 빈도를 높이는 것', custom: 'keep' }],
        flashcards: [{ id: 'f1', front: 'Q', back: 'A', due: 1_700_000_000_000, interval: 6, ease: 2.5 }],
      },
    };
    const out = migrateBackup(v1);
    expect(out.backupVersion).toBe(BACKUP_VERSION);
    const c = out.tables.concepts![0] as Record<string, unknown>;
    expect(c.statement).toBe('행동의 빈도를 높이는 것');
    expect(c.status).toBe('needs-check');
    expect(c.custom).toBe('keep');
    expect(c).not.toHaveProperty('definition');
    const f = out.tables.flashcards![0] as { sched: { stability: number; difficulty: number; state: string } };
    expect(f.sched.stability).toBe(6);
    expect(f.sched.state).toBe('review');
    expect(f.sched.difficulty).toBeCloseTo(1, 5);
  });

  it('다른 앱의 파일과 미래 버전을 거부한다', () => {
    expect(() => migrateBackup({ app: 'x', backupVersion: 1, tables: {} })).toThrow(BackupError);
    expect(() =>
      migrateBackup({ app: 'study-star-academy', backupVersion: 99, tables: {} }),
    ).toThrow(/새로운 버전/);
  });

  it('id 없는 행을 거부한다', () => {
    expect(() =>
      migrateBackup({ app: 'study-star-academy', backupVersion: 2, tables: { concepts: [{ term: 'x' }] } }),
    ).toThrow(/id/);
  });
});

describe('mergeRows', () => {
  it('최신 행을 남기고 밀려난 행을 충돌 목록으로 돌려준다', () => {
    const { merged, conflicts } = mergeRows(
      [{ id: 'a', updatedAt: 5, v: 1 }, { id: 'b', updatedAt: 1, v: 1 }],
      [{ id: 'a', updatedAt: 3, v: 2 }, { id: 'b', updatedAt: 9, v: 2 }, { id: 'c', updatedAt: 1, v: 1 }],
    );
    expect(merged.find((r) => r.id === 'a')!.v).toBe(1);
    expect(merged.find((r) => r.id === 'b')!.v).toBe(2);
    expect(merged).toHaveLength(3);
    expect(conflicts).toHaveLength(2);
  });
});
