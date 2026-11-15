import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { buildPanels, paginate, selectPanels } from '@academy/learning-engine';
import type { ComicLayoutKind, DialogueLine } from '@academy/shared';
import { db } from '../storage/db';
import { Card, EmptyState, Loading, PageHeader } from '../components/ui';
import { ComicPanelView } from '../features/theater/ComicPanelView';
import { EvidenceModal } from '../features/theater/EvidenceModal';
import { saveEpisode, useCastProfiles } from '../features/theater/storyService';

const LAYOUTS: { value: ComicLayoutKind; label: string }[] = [
  { value: '1', label: '1컷' },
  { value: '4', label: '4컷' },
  { value: '8', label: '8컷' },
  { value: '12', label: '12컷' },
  { value: 'webtoon', label: '세로 웹툰' },
  { value: 'chapter', label: '챕터형' },
];

const GRID: Record<ComicLayoutKind, string> = {
  '1': 'grid-cols-1 max-w-2xl mx-auto',
  '4': 'grid-cols-1 sm:grid-cols-2',
  '8': 'grid-cols-2',
  '12': 'grid-cols-2 lg:grid-cols-3',
  webtoon: 'grid-cols-1 max-w-xl mx-auto gap-6',
  chapter: 'grid-cols-1 sm:grid-cols-2',
};

export default function TheaterComic() {
  const { id = '' } = useParams();
  const project = useLiveQuery(() => db.storyProjects.get(id), [id]);
  const profiles = useCastProfiles();
  const [page, setPage] = useState(0);
  const [evidence, setEvidence] = useState<DialogueLine | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const layout = project?.comicLayout ?? '4';
  const all = useMemo(() => (project ? buildPanels(project.episode) : []), [project]);
  const panels = useMemo(() => selectPanels(all, layout), [all, layout]);
  const pages = useMemo(() => paginate(panels, 4), [panels]);

  if (project === undefined) return <Loading />;
  if (!project) return <EmptyState title="작품을 찾을 수 없어요" action={<Link className="btn-primary" to="/theater">이야기 극장으로</Link>} />;
  const shown = layout === 'chapter' ? pages[Math.min(page, pages.length - 1)] ?? [] : panels;
  const quiz = project.episode.scenes.find((s) => s.choice)?.choice;

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${project.title} — 학습 만화`}
        subtitle="말풍선이나 개념 상자를 누르면 원문 출처를 볼 수 있어요. 노란 표시는 원문, 보라 표시는 이야기 설정이에요."
        actions={
          <>
            <Link className="btn-ghost btn-sm" to="/theater">
              ← 보관함
            </Link>
            <Link className="btn-primary btn-sm" to={`/theater/${id}/play`}>
              애니메이션으로 보기
            </Link>
            <Link className="btn-ghost btn-sm" to={`/theater/${id}/edit`}>
              편집
            </Link>
          </>
        }
      />
      <div className="flex flex-wrap gap-2" role="group" aria-label="컷 구성">
        {LAYOUTS.map((l) => (
          <button key={l.value} className={`btn btn-sm ${layout === l.value ? 'bg-lavender' : 'bg-white'}`} aria-pressed={layout === l.value} onClick={() => { setPage(0); saveEpisode(project.id, project.episode, { comicLayout: l.value }); }}>
            {l.label}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-ink-soft">전체 {all.length}컷 중 {panels.length}컷</span>
      </div>

      <div className={`grid gap-3 ${GRID[layout]}`}>
        {shown.map((p, i) => (
          <ComicPanelView key={p.key} panel={p} profiles={profiles} aspect={layout === 'webtoon' ? 3 / 4 : layout === '1' ? 16 / 10 : 4 / 3} onEvidence={setEvidence} index={i} />
        ))}
      </div>

      {layout === 'chapter' && pages.length > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button className="btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            ← 이전 쪽
          </button>
          <span className="text-sm">
            {page + 1} / {pages.length}쪽
          </span>
          <button className="btn-ghost btn-sm" disabled={page >= pages.length - 1} onClick={() => setPage((p) => p + 1)}>
            다음 쪽 →
          </button>
        </div>
      )}

      {quiz && (
        <Card className="space-y-2" as="section">
          <h2 className="font-pixel text-lg font-bold">독자 확인 문제</h2>
          <p className="text-sm">{quiz.prompt}</p>
          <p className="rounded bg-butter-soft p-2 text-sm">{project.episode.scenes.find((s) => s.choice)?.lines.find((l) => l.kind === 'concept-box')?.text}</p>
          <div className="flex flex-wrap gap-2">
            {quiz.options.map((o) => (
              <button key={o.id} disabled={!!answer} onClick={() => setAnswer(o.id)} className={`btn btn-sm ${answer === o.id ? (o.correct ? 'bg-mint' : 'bg-pink') : answer && o.correct ? 'bg-mint-soft' : 'bg-white'}`}>
                {o.text}
              </button>
            ))}
          </div>
          {answer && <p className="text-sm">{quiz.options.find((o) => o.id === answer)?.feedback}</p>}
          <Link className="btn-pink btn-sm" to={`/theater/${id}/review`}>
            복습 활동으로
          </Link>
        </Card>
      )}
      <EvidenceModal line={evidence} onClose={() => setEvidence(null)} />
    </div>
  );
}
