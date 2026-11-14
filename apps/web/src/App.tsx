import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Loading } from './components/ui';
import { ensureProfile } from './learning/profile';
import { explainStorageError } from './storage/db';
import { useProfile } from './hooks/data';

const Home = lazy(() => import('./pages/Home'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Library = lazy(() => import('./pages/Library'));
const DocumentDetail = lazy(() => import('./pages/DocumentDetail'));
const Lecture = lazy(() => import('./pages/Lecture'));
const BlankReview = lazy(() => import('./pages/BlankReview'));
const Greenhouse = lazy(() => import('./pages/Greenhouse'));
const Tower = lazy(() => import('./pages/Tower'));
const ExamRun = lazy(() => import('./pages/ExamRun'));
const ExamResult = lazy(() => import('./pages/ExamResult'));
const Author = lazy(() => import('./pages/Author'));
const Detective = lazy(() => import('./pages/Detective'));
const Observatory = lazy(() => import('./pages/Observatory'));
const Garden = lazy(() => import('./pages/Garden'));
const Adventure = lazy(() => import('./pages/Adventure'));
const Dungeon = lazy(() => import('./pages/Dungeon'));
const Plaza = lazy(() => import('./pages/Plaza'));
const Theater = lazy(() => import('./pages/Theater'));
const Settings = lazy(() => import('./pages/Settings'));
const NotFound = lazy(() => import('./pages/NotFound'));

export function App() {
  const [bootError, setBootError] = useState<string | null>(null);
  const profile = useProfile();
  const location = useLocation();
  // 처음 열 때 한 번만 온보딩 여부를 확인한다(온보딩을 마친 직후 저장 반영보다 이동이 빨라 되돌아가는 문제 방지).
  const firstCheck = useRef<null | boolean>(null);

  useEffect(() => {
    ensureProfile().catch((e) => setBootError(explainStorageError(e)));
  }, []);

  if (bootError)
    return (
      <div className="mx-auto max-w-lg p-6">
        <div className="card p-6">
          <h1 className="text-xl font-bold">저장소를 열 수 없어요</h1>
          <p className="mt-2 text-sm">{bootError}</p>
        </div>
      </div>
    );

  if (!profile) return <Loading text="아카데미 문을 여는 중…" />;
  if (firstCheck.current === null) firstCheck.current = !profile.onboarded && location.pathname !== '/welcome';
  if (firstCheck.current && location.pathname !== '/welcome') {
    firstCheck.current = false;
    return <Navigate to="/welcome" replace />;
  }

  return (
    <Layout>
      <ErrorBoundary key={location.pathname}>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/welcome" element={<Onboarding />} />
            <Route path="/library" element={<Library />} />
            <Route path="/library/:docId" element={<DocumentDetail />} />
            <Route path="/lecture" element={<Lecture />} />
            <Route path="/lecture/blank" element={<BlankReview />} />
            <Route path="/greenhouse" element={<Greenhouse />} />
            <Route path="/tower" element={<Tower />} />
            <Route path="/tower/author" element={<Author />} />
            <Route path="/tower/exam/:attemptId" element={<ExamRun />} />
            <Route path="/tower/result/:attemptId" element={<ExamResult />} />
            <Route path="/detective" element={<Detective />} />
            <Route path="/observatory" element={<Observatory />} />
            <Route path="/garden" element={<Garden />} />
            <Route path="/adventure" element={<Adventure />} />
            <Route path="/adventure/dungeon" element={<Dungeon />} />
            <Route path="/plaza" element={<Plaza />} />
            <Route path="/theater" element={<Theater />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </Layout>
  );
}
