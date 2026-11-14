import { useNavigate } from 'react-router-dom';
import { BUILDINGS } from '../features/academy/buildings';
import { RecommendationList, TodayCards, useToday } from '../features/academy/TodaySummary';
import { PixelBuilding } from '../components/PixelBuilding';
import { PixelCharacter } from '../components/PixelCharacter';
import { LinkButton, StatusChip, EmptyState } from '../components/ui';
import { useProfile } from '../hooks/data';
import { updateProfile } from '../learning/profile';

function AcademyMap() {
  const navigate = useNavigate();
  const profile = useProfile();
  return (
    <section aria-label="아카데미 지도" className="relative overflow-hidden rounded-2xl border-2 border-ink/70 bg-[#d9f2c9] p-3 shadow-pixel-lg sm:p-5">
      {/* 바닥 길(장식) */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/3 h-6 bg-[#f3e2b8]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-2/3 h-6 bg-[#f3e2b8]" />
      <div aria-hidden="true" className="pointer-events-none absolute right-4 top-2 font-pixel text-lg text-butter-deep anim-twinkle">
        ★
      </div>
      <div className="relative grid grid-cols-2 gap-3 sm:grid-cols-4">
        {BUILDINGS.map((b) => (
          <button
            key={b.id}
            onClick={() => navigate(b.route)}
            className="group flex flex-col items-center rounded-xl border-2 border-transparent bg-white/70 p-2 text-center transition hover:-translate-y-1 hover:border-ink/60 hover:bg-white focus-visible:border-ink"
            style={{ order: b.row * 4 + b.col }}
            aria-label={`${b.name} — ${b.role} (${b.status === 'ready' ? '사용 가능' : b.status === 'partial' ? '일부 지원' : '개발 예정'})`}
          >
            <PixelBuilding roof={b.roof} wall={b.wall} size={76} />
            <span className="mt-1 font-pixel text-sm font-bold">{b.name}</span>
            <span className="text-[11px] text-ink-soft">{b.role}</span>
            <span className="mt-1">
              <StatusChip status={b.status} />
            </span>
          </button>
        ))}
        <div className="flex flex-col items-center justify-end rounded-xl p-2" style={{ order: 99 }}>
          <PixelCharacter id={profile?.characterId ?? 'byeol'} size={72} />
          <span className="font-pixel text-xs">{profile?.nickname || '나'}</span>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const profile = useProfile();
  const today = useToday();
  const view = profile?.settings.viewMode ?? 'map';
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{profile?.nickname ? `${profile.nickname}님, 어서 오세요!` : '공부별 아카데미'}</h1>
          {profile?.goal && <p className="text-sm text-ink-soft">나의 목표: {profile.goal}</p>}
        </div>
        <div className="flex gap-2" role="group" aria-label="보기 방식">
          <button className={`btn-sm btn ${view === 'map' ? 'bg-lavender' : 'bg-white'}`} onClick={() => updateProfile({ settings: { viewMode: 'map' } })} aria-pressed={view === 'map'}>
            지도 보기
          </button>
          <button className={`btn-sm btn ${view === 'dashboard' ? 'bg-lavender' : 'bg-white'}`} onClick={() => updateProfile({ settings: { viewMode: 'dashboard' } })} aria-pressed={view === 'dashboard'}>
            대시보드 보기
          </button>
        </div>
      </div>

      {today && today.docs === 0 && (
        <EmptyState
          title="아직 학습 자료가 없어요"
          desc="강의 PDF·PPTX·DOCX·TXT를 올리면 원문 근거가 연결된 개념, 카드, 문제를 만들어 드려요. 파일이 없다면 예시 자료로 먼저 체험해 보세요."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <LinkButton to="/library?upload=1">자료 올리기</LinkButton>
              <LinkButton to="/library?sample=1" tone="ghost">
                예시 자료로 체험
              </LinkButton>
            </div>
          }
        />
      )}

      <TodayCards />
      {view === 'map' ? (
        <>
          <AcademyMap />
          <RecommendationList />
        </>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <RecommendationList />
          <div className="card p-4">
            <h2 className="mb-3 text-lg font-bold">바로가기</h2>
            <div className="grid grid-cols-2 gap-2">
              {BUILDINGS.map((b) => (
                <LinkButton key={b.id} to={b.route} tone="ghost" small>
                  {b.name}
                  {b.status !== 'ready' && <span className="text-[10px] text-ink-soft">({b.status === 'partial' ? '일부' : '예정'})</span>}
                </LinkButton>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
