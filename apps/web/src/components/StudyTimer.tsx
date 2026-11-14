/**
 * 개인 공부 타이머. 시작 시각을 저장해 두고 (현재 시각 − 시작 시각)으로 계산하므로
 * 새로고침하거나 탭이 잠들어도 시간이 틀어지지 않는다. 서버 없이 작동한다.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getMeta, setMeta } from '../storage/db';
import { logSession } from '../learning/services';
import { useNow } from '../hooks/data';
import { toast } from '../stores/ui';

interface TimerState {
  startedAt: number | null;
  subjectId?: string;
}

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h > 0 ? `${h}:` : ''}${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function StudyTimer({ compact }: { compact?: boolean }) {
  const state = useLiveQuery(async () => (await db.meta.get('timer'))?.value as TimerState | undefined, []);
  const now = useNow(1000);
  const running = !!state?.startedAt;

  const start = async () => {
    await setMeta('timer', { startedAt: Date.now() });
  };
  const stop = async () => {
    const cur = await getMeta<TimerState>('timer', { startedAt: null });
    if (!cur.startedAt) return;
    const s = await logSession('timer', cur.startedAt, Date.now(), cur.subjectId);
    await setMeta('timer', { startedAt: null });
    toast(s ? `공부 시간 ${Math.round(s.durationMs / 60000)}분을 기록했어요.` : '5초 미만은 기록하지 않아요.', 'success');
  };

  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'card px-3 py-2'}`}>
      <span className="font-pixel text-sm tabular-nums" aria-live="off" aria-label="공부 타이머">
        ⏱ {running ? fmt(now - state!.startedAt!) : '00:00'}
      </span>
      {running ? (
        <button className="btn-pink btn-sm" onClick={stop}>
          멈추고 기록
        </button>
      ) : (
        <button className="btn-mint btn-sm" onClick={start}>
          공부 시작
        </button>
      )}
    </div>
  );
}
