import { useLiveQuery } from 'dexie-react-hooks';
import { ACHIEVEMENTS, XP_RULES, levelFromXp, plantStage } from '@academy/learning-engine';
import { db, entity } from '../storage/db';
import { Card, InfoBox, PageHeader, Progress, formatDateTime } from '../components/ui';
import { PixelBuilding } from '../components/PixelBuilding';
import { PixelCharacter } from '../components/PixelCharacter';
import { useProfile } from '../hooks/data';
import { toast } from '../stores/ui';

/** 픽셀 식물 — 단계(0~4)마다 같은 화분 틀 위에서 줄기·잎·꽃이 자란다. 단계는 줄지 않는다. */
function PixelPlant({ stage, flower }: { stage: number; flower: string }) {
  const ink = '#4a3f5c';
  const leaf = '#4fbf93';
  return (
    <svg viewBox="0 0 16 16" width={72} height={72} className="pixelated" role="img" aria-label={`성장 ${stage}단계`}>
      <g className={stage >= 2 ? 'anim-sway' : undefined}>
        {stage === 0 && <rect x="7" y="10" width="2" height="1" fill="#8a6240" />}
        {stage >= 1 && <rect x="7" y={stage >= 3 ? 4 : 8} width="2" height={stage >= 3 ? 7 : 3} fill={leaf} />}
        {stage >= 1 && <rect x="5" y="9" width="2" height="1" fill={leaf} />}
        {stage >= 2 && <rect x="9" y="7" width="3" height="1" fill={leaf} />}
        {stage >= 2 && <rect x="4" y="7" width="2" height="1" fill={leaf} />}
        {stage >= 3 && <rect x="9" y="5" width="2" height="1" fill={leaf} />}
        {stage >= 4 && (
          <>
            <rect x="6" y="1" width="4" height="1" fill={flower} />
            <rect x="5" y="2" width="6" height="2" fill={flower} />
            <rect x="7" y="2" width="2" height="2" fill="#ffd84d" />
            <rect x="6" y="4" width="4" height="1" fill={flower} />
          </>
        )}
      </g>
      <rect x="4" y="11" width="8" height="1" fill={ink} />
      <rect x="4" y="12" width="8" height="3" fill="#e7b88a" />
      <rect x="4" y="12" width="1" height="3" fill={ink} />
      <rect x="11" y="12" width="1" height="3" fill={ink} />
      <rect x="5" y="15" width="6" height="1" fill={ink} />
    </svg>
  );
}

const SHOP = [
  { key: 'lamp', name: '별빛 가로등', price: 30 },
  { key: 'bench', name: '나무 벤치', price: 50 },
  { key: 'fountain', name: '작은 분수', price: 120 },
  { key: 'statue', name: '부엉이 조각상', price: 200 },
];

export default function Garden() {
  const profile = useProfile();
  const data = useLiveQuery(async () => {
    const events = await db.xpEvents.orderBy('createdAt').reverse().toArray();
    const xp = events.reduce((a, e) => a + e.xp, 0);
    const earned = events.reduce((a, e) => a + e.coins, 0);
    const inv = await db.inventory.toArray();
    const spent = inv.reduce((a, i) => a + (SHOP.find((s) => s.key === i.itemKey)?.price ?? 0), 0);
    const achievements = await db.achievements.toArray();
    const reviews = await db.reviewLogs.count();
    const exams = await db.attempts.filter((a) => a.status === 'graded').count();
    const blanks = await db.blankReviews.count();
    const resolved = await db.mistakes.filter((m) => m.resolved).count();
    return { events: events.slice(0, 12), xp, coins: earned - spent, inv, achievements, reviews, exams, blanks, resolved };
  }, []);
  if (!data) return null;
  const lv = levelFromXp(data.xp);
  const plants = [
    { name: '기억 해바라기', desc: '카드 복습', value: data.reviews, stage: plantStage(data.reviews), flower: '#ffd84d' },
    { name: '시험 튤립', desc: '채점한 시험 × 10', value: data.exams, stage: plantStage(data.exams * 10), flower: '#f08fb0' },
    { name: '회상 수국', desc: '백지 복습 × 10', value: data.blanks, stage: plantStage(data.blanks * 10), flower: '#9b83e6' },
    { name: '극복 데이지', desc: '해결한 오답 × 5', value: data.resolved, stage: plantStage(data.resolved * 5), flower: '#6fa8e8' },
  ];
  return (
    <div className="space-y-4">
      <PageHeader title="성장 정원" subtitle="실제로 공부한 만큼만 자라는 나의 정원이에요." icon={<PixelBuilding roof="#4fbf93" wall="#fff8d6" size={56} />} />
      <Card className="flex flex-wrap items-center gap-4">
        <PixelCharacter id={profile?.characterId ?? 'byeol'} size={80} />
        <div className="min-w-[200px] flex-1">
          <div className="font-pixel text-xl font-bold">Lv.{lv.level}</div>
          <Progress value={lv.current} max={lv.needed} label="경험치" />
          <div className="mt-1 text-xs text-ink-soft">
            경험치 {lv.current}/{lv.needed} · 누적 {data.xp} XP
          </div>
        </div>
        <div className="chip bg-butter text-base">🪙 {data.coins} 코인</div>
      </Card>
      <InfoBox tone="mint">
        경험치 기준: 카드 복습(같은 카드는 하루 1회) {XP_RULES.review[1]}~{XP_RULES.review[3]}, 시험은 문항당 최대 {XP_RULES.examPerQuestion}×정답률, 백지 복습 최대 {XP_RULES.blankReviewMax}, 오답 극복 {XP_RULES.mistakeResolved}. 버튼을 반복해서 누르는 것만으로는 경험치가 오르지 않아요. 공부를 쉬어도 식물은 시들지 않아요.
      </InfoBox>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {plants.map((p) => (
          <Card key={p.name} className="flex flex-col items-center bg-[#eaf8df] text-center">
            <PixelPlant stage={p.stage} flower={p.flower} />
            <div className="font-pixel font-bold">{p.name}</div>
            <div className="text-xs text-ink-soft">
              {p.desc} · {p.value} · {p.stage}/4단계
            </div>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-lg font-bold">업적</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {ACHIEVEMENTS.map((a) => {
              const got = data.achievements.find((x) => x.key === a.key);
              return (
                <li key={a.key} className={`rounded-lg border-2 p-2 text-sm ${got ? 'border-mint-deep bg-mint-soft' : 'border-ink/15 bg-white opacity-70'}`}>
                  <div className="font-bold">
                    {got ? '🏅' : '🔒'} {a.title}
                  </div>
                  <div className="text-xs text-ink-soft">{a.desc}</div>
                  {got && <div className="text-[11px] text-ink-soft">{formatDateTime(got.unlockedAt)}</div>}
                </li>
              );
            })}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 text-lg font-bold">정원 꾸미기</h2>
          <p className="mb-2 text-xs text-ink-soft">학습 코인으로 장식을 살 수 있어요. 실제 돈으로 사는 아이템은 없어요.</p>
          <ul className="space-y-2">
            {SHOP.map((s) => {
              const owned = data.inv.some((i) => i.itemKey === s.key);
              return (
                <li key={s.key} className="flex items-center justify-between rounded border-2 border-ink/15 p-2 text-sm">
                  <span>
                    {s.name} <span className="text-xs text-ink-soft">🪙{s.price}</span>
                  </span>
                  {owned ? (
                    <span className="chip bg-mint">보유 중</span>
                  ) : (
                    <button
                      className="btn-ghost btn-sm"
                      disabled={data.coins < s.price}
                      onClick={async () => {
                        await db.inventory.add(entity({ itemKey: s.key, placed: true }));
                        toast(`${s.name}을(를) 정원에 놓았어요!`, 'success');
                      }}
                    >
                      구매
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <h3 className="mb-1 mt-4 font-bold">최근 경험치</h3>
          <ul className="space-y-1 text-xs">
            {data.events.map((e) => (
              <li key={e.id} className="flex justify-between">
                <span>{e.reason}</span>
                <span>
                  +{e.xp} XP · {formatDateTime(e.createdAt)}
                </span>
              </li>
            ))}
            {data.events.length === 0 && <li className="text-ink-soft">아직 경험치가 없어요.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
