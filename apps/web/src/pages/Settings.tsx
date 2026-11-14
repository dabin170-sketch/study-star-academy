import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { DEFAULT_WEIGHTS, FSRS_VERSION } from '@academy/learning-engine';
import { BackupError, type RecommendWeights } from '@academy/shared';
import { db, entity, storageEstimate, getMeta } from '../storage/db';
import { downloadJson, exportBackup, importBackup, wipeAllData } from '../storage/backup';
import { Card, ErrorBox, InfoBox, Modal, PageHeader } from '../components/ui';
import { CHARACTERS, PixelCharacter } from '../components/PixelCharacter';
import { updateProfile } from '../learning/profile';
import { useProfile } from '../hooks/data';
import { toast } from '../stores/ui';

const WEIGHT_LABEL: Record<keyof RecommendWeights, string> = {
  weakness: '취약도(1 − 숙련도)',
  overdue: '복습 예정일 초과',
  importance: '개념 중요도',
  examUrgency: '시험 임박도',
};

export default function Settings() {
  const profile = useProfile();
  const [est, setEst] = useState<Awaited<ReturnType<typeof storageEstimate>>>(null);
  const [includeFiles, setIncludeFiles] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeText, setWipeText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const goal = useLiveQuery(() => db.goals.filter((g) => g.active).first(), []);
  const conflicts = useLiveQuery(() => getMeta<unknown[]>('importConflicts', []), []);

  useEffect(() => {
    storageEstimate().then(setEst);
  }, []);

  if (!profile) return null;
  const s = profile.settings;
  const setW = (k: keyof RecommendWeights, v: number) => updateProfile({ settings: { recommendWeights: { ...s.recommendWeights, [k]: v } } });

  return (
    <div className="space-y-4">
      <PageHeader title="설정" subtitle="내 정보, 접근성, 학습 기준, 백업을 관리해요." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="text-lg font-bold">내 정보</h2>
          <label className="block">
            <span className="label">닉네임</span>
            <input className="input" defaultValue={profile.nickname} maxLength={12} onBlur={(e) => updateProfile({ nickname: e.target.value.trim() })} />
          </label>
          <label className="block">
            <span className="label">학습 목표</span>
            <input className="input" defaultValue={profile.goal} maxLength={60} onBlur={(e) => updateProfile({ goal: e.target.value.trim() })} />
          </label>
          <label className="block">
            <span className="label">하루 공부 목표(분)</span>
            <input
              className="input w-32"
              type="number"
              min={10}
              max={720}
              defaultValue={goal?.minutesPerDay ?? 60}
              onBlur={async (e) => {
                const v = Math.max(10, Math.min(720, Number(e.target.value) || 60));
                await db.goals.clear();
                await db.goals.add(entity({ title: '하루 공부 목표', minutesPerDay: v, active: true }));
              }}
            />
          </label>
          <div>
            <span className="label">캐릭터</span>
            <div className="flex gap-2" role="radiogroup" aria-label="캐릭터">
              {CHARACTERS.map((c) => (
                <button key={c.id} role="radio" aria-checked={profile.characterId === c.id} className={`rounded-lg border-2 p-1 ${profile.characterId === c.id ? 'border-lavender-deep bg-lavender' : 'border-ink/20 bg-white'}`} onClick={() => updateProfile({ characterId: c.id })} aria-label={c.name}>
                  <PixelCharacter id={c.id} size={48} animate={false} />
                </button>
              ))}
            </div>
          </div>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-bold">접근성</h2>
          <label className="block">
            <span className="label">글자 크기: {Math.round(s.fontScale * 100)}%</span>
            <input type="range" min={0.9} max={1.4} step={0.05} value={s.fontScale} onChange={(e) => updateProfile({ settings: { fontScale: Number(e.target.value) } })} className="w-full" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.reduceMotion} onChange={(e) => updateProfile({ settings: { reduceMotion: e.target.checked } })} /> 애니메이션 줄이기
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.sound} onChange={(e) => updateProfile({ settings: { sound: e.target.checked } })} /> 알림음 켜기
          </label>
          <label className="block">
            <span className="label">시험 시간 배율: ×{s.timeLimitMultiplier}</span>
            <input type="range" min={1} max={2} step={0.25} value={s.timeLimitMultiplier} onChange={(e) => updateProfile({ settings: { timeLimitMultiplier: Number(e.target.value) } })} className="w-full" />
            <span className="text-xs text-ink-soft">시간 제한이 부담된다면 늘려 주세요. 새로 시작하는 시험부터 적용돼요.</span>
          </label>
        </Card>

        <Card className="space-y-3" as="section">
          <h2 id="recommend" className="text-lg font-bold">
            학습 추천 기준
          </h2>
          <p className="text-xs text-ink-soft">추천 점수 = 취약도×가중치 + 복습 초과(7일 이상이면 최대)×가중치 + 중요도×가중치 + 시험 임박도(30일 전부터)×가중치. 0이면 그 기준을 쓰지 않아요.</p>
          {(Object.keys(WEIGHT_LABEL) as (keyof RecommendWeights)[]).map((k) => (
            <label key={k} className="block">
              <span className="label">
                {WEIGHT_LABEL[k]}: {s.recommendWeights[k].toFixed(1)}
              </span>
              <input type="range" min={0} max={2} step={0.1} value={s.recommendWeights[k]} onChange={(e) => setW(k, Number(e.target.value))} className="w-full" />
            </label>
          ))}
          <button className="btn-ghost btn-sm" onClick={() => updateProfile({ settings: { recommendWeights: DEFAULT_WEIGHTS } })}>
            기본값으로
          </button>
          <label className="block">
            <span className="label">간격 반복 목표 기억 유지율: {Math.round(s.desiredRetention * 100)}%</span>
            <input type="range" min={0.75} max={0.97} step={0.01} value={s.desiredRetention} onChange={(e) => updateProfile({ settings: { desiredRetention: Number(e.target.value) } })} className="w-full" />
            <span className="text-xs text-ink-soft">높을수록 더 자주 복습해요. 알고리즘: {FSRS_VERSION}</span>
          </label>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-bold">백업과 복원</h2>
          <InfoBox tone="milk">모든 학습 데이터는 이 브라우저에만 저장돼요. 브라우저 데이터를 지우거나 기기를 바꾸기 전에 꼭 백업 파일을 내보내 두세요.</InfoBox>
          {est && (
            <p className="text-sm">
              사용 중: {(est.usage / 1024 / 1024).toFixed(1)}MB / 가능 {(est.quota / 1024 / 1024 / 1024).toFixed(1)}GB · {est.persisted ? '영구 저장 허용됨' : '브라우저가 공간이 부족하면 지울 수 있음'}
            </p>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeFiles} onChange={(e) => setIncludeFiles(e.target.checked)} /> 원본 PDF 파일도 포함(파일이 커져요)
          </label>
          <button
            className="btn-primary"
            onClick={async () => {
              const data = await exportBackup(includeFiles);
              downloadJson(data, `공부별아카데미-백업-${new Date().toISOString().slice(0, 10)}.json`);
              toast('백업 파일을 내보냈어요.', 'success');
            }}
          >
            백업 파일 내보내기
          </button>
          <div>
            <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
              백업 파일 가져오기
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                setImportErr(null);
                setImportMsg(null);
                try {
                  const r = await importBackup(JSON.parse(await f.text()));
                  setImportMsg(`가져오기 완료: 새 항목 ${r.added}개, 더 최신으로 갱신 ${r.updated}개, 기존이 더 최신이라 유지 ${r.conflicts}개, 원본 파일 ${r.files}개. 지금 데이터는 지워지지 않았어요.`);
                } catch (err) {
                  setImportErr(err instanceof BackupError ? err.message : err instanceof SyntaxError ? 'JSON 파일 형식이 아닙니다.' : `가져오지 못했어요: ${(err as Error).message}`);
                }
              }}
            />
          </div>
          {importMsg && <InfoBox tone="mint">{importMsg}</InfoBox>}
          {importErr && <ErrorBox>{importErr}</ErrorBox>}
          {!!conflicts?.length && <p className="text-xs text-ink-soft">가져오기 중 밀려난 이전 버전 {conflicts.length}건은 자동 삭제하지 않고 보관함에 남겨 두었어요(백업 파일에도 포함).</p>}
          <hr className="border-ink/10" />
          <button className="btn-pink btn-sm" onClick={() => setWipeOpen(true)}>
            모든 데이터 삭제
          </button>
        </Card>
      </div>

      <Modal open={wipeOpen} onClose={() => setWipeOpen(false)} title="모든 데이터를 삭제할까요?">
        <p className="text-sm">자료, 개념, 카드, 시험 기록, 성장 기록이 모두 지워지고 되돌릴 수 없어요. 먼저 백업을 내보내 두세요.</p>
        <label className="mt-3 block text-sm">
          확인하려면 <b>삭제합니다</b>를 입력하세요.
          <input className="input mt-1" value={wipeText} onChange={(e) => setWipeText(e.target.value)} />
        </label>
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setWipeOpen(false)}>
            취소
          </button>
          <button
            className="btn-pink"
            disabled={wipeText !== '삭제합니다'}
            onClick={async () => {
              await wipeAllData();
              location.href = '/welcome';
            }}
          >
            영구 삭제
          </button>
        </div>
      </Modal>
    </div>
  );
}
