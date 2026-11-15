import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { levelFromXp } from '@academy/learning-engine';
import { db } from '../storage/db';
import { useOnline, useProfile } from '../hooks/data';
import { useUI } from '../stores/ui';
import { PixelCharacter } from './PixelCharacter';
import { StudyTimer } from './StudyTimer';

const NAV = [
  { to: '/', label: '아카데미', end: true },
  { to: '/library', label: '도서관' },
  { to: '/lecture', label: '강의실' },
  { to: '/greenhouse', label: '온실' },
  { to: '/tower', label: '시험의 탑' },
  { to: '/detective', label: '탐정' },
  { to: '/observatory', label: '관측소' },
  { to: '/theater', label: '극장' },
  { to: '/plaza', label: '광장' },
  { to: '/garden', label: '정원' },
  { to: '/settings', label: '설정' },
];

const MOBILE_NAV = [
  { to: '/', label: '홈', icon: '🏰', end: true },
  { to: '/library', label: '자료', icon: '📚' },
  { to: '/greenhouse', label: '카드', icon: '🌱' },
  { to: '/tower', label: '시험', icon: '🗼' },
];

function Toaster() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-3 sm:bottom-6" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto card max-w-md px-4 py-2 text-left text-sm ${t.tone === 'error' ? 'bg-pink-soft' : t.tone === 'success' ? 'bg-mint-soft' : 'bg-white'}`}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const profile = useProfile();
  const online = useOnline();
  const xp = useLiveQuery(async () => (await db.xpEvents.toArray()).reduce((a, e) => a + e.xp, 0), []) ?? 0;
  const lv = levelFromXp(xp);
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMoreOpen(false), [location.pathname]);

  useEffect(() => {
    const s = profile?.settings;
    if (!s) return;
    document.documentElement.style.setProperty('--font-scale', String(s.fontScale));
    document.documentElement.classList.toggle('reduce-motion', s.reduceMotion);
  }, [profile?.settings]);

  return (
    <div className="min-h-screen pb-20 sm:pb-6">
      <a href="#main" className="sr-only sr-only-focusable fixed left-2 top-2 z-[70] rounded bg-white p-2">
        본문으로 건너뛰기
      </a>
      <header className="sticky top-0 z-40 border-b-2 border-ink/70 bg-cream/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-2">
          <Link to="/" className="flex items-center gap-2" aria-label="공부별 아카데미 홈">
            <PixelCharacter id={profile?.characterId ?? 'byeol'} size={36} animate={false} label="내 캐릭터" />
            <span className="hidden font-pixel text-base font-bold sm:inline">공부별 아카데미</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {!online && (
              <span className="chip bg-butter" title="인터넷 연결 없음 — 개인 학습 기능은 그대로 쓸 수 있어요">
                오프라인
              </span>
            )}
            <Link to="/garden" className="chip bg-lavender-soft" title={`경험치 ${lv.current}/${lv.needed}`}>
              Lv.{lv.level}
            </Link>
            <div className="hidden md:block">
              <StudyTimer compact />
            </div>
          </div>
        </div>
        <nav className="mx-auto hidden max-w-6xl gap-1 overflow-x-auto px-3 pb-2 sm:flex" aria-label="주 메뉴">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-1 font-pixel text-sm ${isActive ? 'bg-lavender font-bold' : 'hover:bg-lavender-soft'}`}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-3 py-5">
        <div className="mb-4 md:hidden">
          <StudyTimer />
        </div>
        {children}
      </main>

      {/* 모바일 하단 메뉴 */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t-2 border-ink/70 bg-cream sm:hidden" aria-label="모바일 메뉴">
        {MOBILE_NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `flex flex-col items-center py-2 text-xs ${isActive ? 'bg-lavender font-bold' : ''}`}>
            <span aria-hidden="true">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
        <button className="flex flex-col items-center py-2 text-xs" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}>
          <span aria-hidden="true">☰</span>더보기
        </button>
      </nav>
      {moreOpen && (
        <div className="fixed inset-x-2 bottom-16 z-50 grid grid-cols-3 gap-2 rounded-xl border-2 border-ink/70 bg-white p-3 shadow-pixel-lg sm:hidden">
          {NAV.filter((n) => !MOBILE_NAV.some((m) => m.to === n.to)).map((n) => (
            <NavLink key={n.to} to={n.to} className="rounded-lg bg-lavender-soft px-2 py-2 text-center font-pixel text-sm">
              {n.label}
            </NavLink>
          ))}
          <NavLink to="/adventure" className="rounded-lg bg-lavender-soft px-2 py-2 text-center font-pixel text-sm">
            훈련장
          </NavLink>
        </div>
      )}
      <Toaster />
    </div>
  );
}
