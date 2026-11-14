import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { maskTerm } from '@academy/learning-engine';
import { CONCEPT_KIND_LABEL, type Concept, type ConceptStatus, type DocumentChunk } from '@academy/shared';
import { db } from '../storage/db';
import { Card, EmptyState, InfoBox, Loading, Modal, PageHeader, Tabs } from '../components/ui';
import { ConceptCard } from '../features/library/ConceptCard';
import { PdfPageView } from '../features/library/PdfPageView';
import { MathText } from '../components/MathText';
import { addManualConcept } from '../features/import/importDocument';
import { toast } from '../stores/ui';

type Tab = 'read' | 'concepts' | 'summary' | 'glossary' | 'worksheet' | 'compare' | 'mindmap';

function ChunkView({ chunk, highlighted, onAdd }: { chunk: DocumentChunk; highlighted: boolean; onAdd: (c: DocumentChunk) => void }) {
  const cls =
    chunk.kind === 'heading'
      ? `font-pixel font-bold ${chunk.headingLevel === 1 ? 'text-xl' : chunk.headingLevel === 2 ? 'text-lg' : 'text-base'}`
      : chunk.kind === 'list'
        ? 'pl-3'
        : chunk.kind === 'table'
          ? 'whitespace-pre-wrap rounded bg-milk-soft p-2 font-mono text-xs'
          : '';
  return (
    <div id={`chunk-${chunk.id}`} className={`group relative rounded-lg px-2 py-1 ${highlighted ? 'bg-butter-soft ring-2 ring-butter-deep' : 'hover:bg-lavender-soft/50'}`}>
      <div className={`text-sm leading-relaxed ${cls}`}>
        <MathText text={chunk.text} />
      </div>
      {chunk.kind !== 'heading' && (
        <button className="btn-ghost btn-sm absolute right-1 top-1 hidden group-hover:inline-flex group-focus-within:inline-flex" onClick={() => onAdd(chunk)}>
          + 개념
        </button>
      )}
    </div>
  );
}

export default function DocumentDetail() {
  const { docId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || (params.get('page') ? 'read' : 'concepts'));
  const [page, setPage] = useState(Number(params.get('page') ?? 1));
  const [filter, setFilter] = useState<ConceptStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [showAnswers, setShowAnswers] = useState(false);
  const [adding, setAdding] = useState<{ chunk: DocumentChunk; term: string; statement: string } | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const highlightChunk = params.get('chunk');

  const doc = useLiveQuery(() => db.documents.get(docId), [docId]);
  const concepts = useLiveQuery(() => db.concepts.where('documentId').equals(docId).toArray(), [docId]);
  const chunks = useLiveQuery(() => db.chunks.where('documentId').equals(docId).sortBy('index'), [docId]);
  const hasBlob = useLiveQuery(async () => !!(await db.blobs.get(docId)), [docId]);

  useEffect(() => {
    if (highlightChunk && tab === 'read') setTimeout(() => document.getElementById(`chunk-${highlightChunk}`)?.scrollIntoView({ block: 'center' }), 100);
  }, [highlightChunk, tab, chunks]);

  const sorted = useMemo(() => (concepts ?? []).slice().sort((a, b) => a.pageNumber - b.pageNumber), [concepts]);
  const visible = sorted.filter((c) => (filter === 'all' ? c.status !== 'rejected' : c.status === filter) && (!query || c.term.includes(query) || c.statement.includes(query)));
  const usable = sorted.filter((c) => c.status === 'auto' || c.status === 'verified');

  if (doc === undefined || !concepts || !chunks) return <Loading />;
  if (doc === null || !doc) return <EmptyState title="자료를 찾을 수 없어요" desc="삭제되었거나 다른 기기의 자료일 수 있어요." action={<Link className="btn-primary" to="/library">도서관으로</Link>} />;

  const unit = doc.fileType === 'pptx' ? '슬라이드' : doc.fileType === 'pdf' ? '쪽' : '구간';
  const pageChunks = chunks.filter((c) => c.pageNumber === page);
  const counts = { all: sorted.filter((c) => c.status !== 'rejected').length, auto: 0, verified: 0, 'needs-check': 0, rejected: 0 } as Record<ConceptStatus | 'all', number>;
  sorted.forEach((c) => counts[c.status]++);

  const goPage = (p: number) => {
    const n = Math.min(Math.max(1, p), doc.pageCount);
    setPage(n);
    setParams({ tab: 'read', page: String(n) }, { replace: true });
  };

  const bySection = new Map<string, Concept[]>();
  for (const c of usable) {
    const key = c.section || '(구분 없음)';
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key)!.push(c);
  }

  return (
    <div>
      <PageHeader
        title={doc.title}
        subtitle={`${doc.fileType === 'sample' ? '예시 자료' : doc.fileName} · ${doc.pageCount}${unit} · 개념 ${counts.all}개`}
        actions={
          <>
            <Link className="btn-ghost btn-sm" to="/library">
              ← 도서관
            </Link>
            <Link className="btn-mint btn-sm" to={`/greenhouse?doc=${doc.id}`}>
              암기 카드
            </Link>
            <Link className="btn-primary btn-sm" to={`/lecture?doc=${doc.id}&tab=quiz`}>
              문제 풀기
            </Link>
            <Link className="btn-pink btn-sm" to={`/lecture/blank?doc=${doc.id}`}>
              백지 복습
            </Link>
            <Link className="btn-ghost btn-sm" to={`/tower?doc=${doc.id}`}>
              모의고사
            </Link>
          </>
        }
      />
      {doc.warnings.length > 0 && (
        <div className="mb-4 space-y-2">
          {doc.warnings.map((w) => (
            <InfoBox key={w} tone="butter">
              {w}
            </InfoBox>
          ))}
        </div>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'concepts', label: `핵심 개념 (${counts.all})` },
          { value: 'read', label: '원본 읽기' },
          { value: 'summary', label: '구조 요약' },
          { value: 'glossary', label: '용어 사전' },
          { value: 'worksheet', label: '빈칸 학습지' },
          { value: 'compare', label: '비교표' },
          { value: 'mindmap', label: '마인드맵' },
        ]}
      />

      {tab === 'concepts' && (
        <div className="space-y-3">
          <InfoBox>
            개념은 원문 문장에서만 찾았어요. <b>원문 근거 있음</b>은 아직 확인 전, <b>확인 필요</b>는 근거가 약해 문제로 만들지 않은 개념이에요. 원문과 대조해 확인·수정·제외하면 이후 카드와 문제에 바로 반영돼요.
          </InfoBox>
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'auto', 'needs-check', 'verified', 'rejected'] as const).map((f) => (
              <button key={f} className={`btn btn-sm ${filter === f ? 'bg-lavender' : 'bg-white'}`} onClick={() => setFilter(f)}>
                {{ all: '전체', auto: '원문 근거 있음', 'needs-check': '확인 필요', verified: '확인 완료', rejected: '제외됨' }[f]} ({counts[f]})
              </button>
            ))}
            <input className="input ml-auto w-48 py-1 text-sm" placeholder="개념 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {visible.length === 0 ? (
            <EmptyState title="해당하는 개념이 없어요" desc="원본 읽기에서 문단 옆 ‘+ 개념’을 눌러 직접 추가할 수 있어요." />
          ) : (
            visible.map((c) => <ConceptCard key={c.id} concept={c} />)
          )}
        </div>
      )}

      {tab === 'read' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-ghost btn-sm" onClick={() => goPage(page - 1)} disabled={page <= 1}>
              ← 이전
            </button>
            <label className="flex items-center gap-1 text-sm">
              <input className="input w-20 py-1" type="number" min={1} max={doc.pageCount} value={page} onChange={(e) => goPage(Number(e.target.value))} aria-label={`${unit} 번호`} />/ {doc.pageCount}
              {unit}
            </label>
            <button className="btn-ghost btn-sm" onClick={() => goPage(page + 1)} disabled={page >= doc.pageCount}>
              다음 →
            </button>
            {doc.outline.length > 0 && (
              <select className="input w-auto py-1 text-sm" onChange={(e) => goPage(Number(e.target.value))} value="" aria-label="목차로 이동">
                <option value="">목차로 이동…</option>
                {doc.outline.map((o, i) => (
                  <option key={i} value={o.pageNumber}>
                    {'　'.repeat(o.level - 1)}
                    {o.title}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className={`grid gap-4 ${doc.fileType === 'pdf' && hasBlob ? 'lg:grid-cols-2' : ''}`}>
            {doc.fileType === 'pdf' && hasBlob && <PdfPageView documentId={doc.id} pageNumber={page} />}
            <Card>
              <div className="mb-2 text-xs text-ink-soft">추출된 원문 · {page}{unit} (문단에 마우스를 올리면 개념으로 추가할 수 있어요)</div>
              {pageChunks.length === 0 ? <p className="text-sm text-ink-soft">이 {unit}에서는 글자를 찾지 못했어요. 그림이나 스캔 페이지일 수 있어요.</p> : pageChunks.map((c) => <ChunkView key={c.id} chunk={c} highlighted={c.id === highlightChunk} onAdd={(ch) => setAdding({ chunk: ch, term: '', statement: window.getSelection()?.toString().trim() || ch.text })} />)}
            </Card>
          </div>
        </div>
      )}

      {tab === 'summary' && (
        <Card>
          <InfoBox tone="milk">제목 구조에 따라 원문 개념 문장을 모은 요약입니다. 새로 지어낸 문장은 없습니다.</InfoBox>
          <div className="mt-3 space-y-4">
            {[...bySection.entries()].map(([section, list]) => (
              <section key={section}>
                <h3 className="mb-1 font-pixel font-bold">{section}</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {list.map((c) => (
                    <li key={c.id}>
                      <b>{c.term}</b>: <span className="whitespace-pre-wrap">{c.statement}</span> <span className="text-xs text-ink-soft">({c.pageNumber}{unit})</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {bySection.size === 0 && <p className="text-sm text-ink-soft">확인된 개념이 아직 없어요. ‘핵심 개념’ 탭에서 개념을 확인해 주세요.</p>}
          </div>
        </Card>
      )}

      {tab === 'glossary' && (
        <Card>
          <input className="input mb-3" placeholder="용어 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
          <dl className="divide-y-2 divide-ink/10">
            {usable
              .filter((c) => !query || c.term.includes(query))
              .sort((a, b) => a.term.localeCompare(b.term, 'ko'))
              .map((c) => (
                <div key={c.id} className="py-2">
                  <dt className="font-bold">
                    {c.term} {c.aliases.length > 0 && <span className="text-xs font-normal text-ink-soft">{c.aliases.join(', ')}</span>}
                  </dt>
                  <dd className="whitespace-pre-wrap text-sm">{c.statement}</dd>
                </div>
              ))}
          </dl>
        </Card>
      )}

      {tab === 'worksheet' && (
        <Card>
          <div className="mb-3 flex flex-wrap gap-2 print:hidden">
            <button className="btn-ghost btn-sm" onClick={() => setShowAnswers((v) => !v)}>
              {showAnswers ? '정답 숨기기' : '정답 보기'}
            </button>
            <button className="btn-ghost btn-sm" onClick={() => window.print()}>
              인쇄
            </button>
          </div>
          <h2 className="mb-3 font-pixel text-lg font-bold">{doc.title} — 빈칸 학습지</h2>
          <ol className="list-decimal space-y-3 pl-5 text-sm">
            {usable
              .map((c) => ({ c, masked: maskTerm(c.statement, c.term, c.aliases) }))
              .filter((x) => x.masked)
              .map(({ c, masked }) => (
                <li key={c.id}>
                  <p className="whitespace-pre-wrap">{masked!.replace(/○○/g, '(　　　　　)')}</p>
                  {showAnswers && <p className="text-xs font-bold text-mint-deep">정답: {c.term}</p>}
                </li>
              ))}
          </ol>
        </Card>
      )}

      {tab === 'compare' && (
        <Card>
          <p className="mb-2 text-sm text-ink-soft">비교할 개념을 2~4개 고르면 나란히 보여 드려요.</p>
          <div className="mb-3 flex flex-wrap gap-1">
            {usable.map((c) => (
              <button
                key={c.id}
                className={`btn btn-sm ${compareIds.includes(c.id) ? 'bg-lavender' : 'bg-white'}`}
                onClick={() => setCompareIds((ids) => (ids.includes(c.id) ? ids.filter((i) => i !== c.id) : ids.length >= 4 ? ids : [...ids, c.id]))}
                aria-pressed={compareIds.includes(c.id)}
              >
                {c.term}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="bg-lavender-soft">
                  <th className="border-2 border-ink/20 p-2 text-left">개념</th>
                  <th className="border-2 border-ink/20 p-2 text-left">종류</th>
                  <th className="border-2 border-ink/20 p-2 text-left">원문 설명</th>
                  <th className="border-2 border-ink/20 p-2 text-left">출처</th>
                </tr>
              </thead>
              <tbody>
                {(compareIds.length ? usable.filter((c) => compareIds.includes(c.id)) : usable.filter((c) => c.kind === 'classification' || c.kind === 'comparison' || c.kind === 'definition').slice(0, 12)).map((c) => (
                  <tr key={c.id}>
                    <td className="border-2 border-ink/20 p-2 font-bold">{c.term}</td>
                    <td className="border-2 border-ink/20 p-2">{CONCEPT_KIND_LABEL[c.kind]}</td>
                    <td className="whitespace-pre-wrap border-2 border-ink/20 p-2">{c.statement}</td>
                    <td className="border-2 border-ink/20 p-2 text-xs">
                      {c.pageNumber}
                      {unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'mindmap' && (
        <Card>
          <p className="mb-3 text-xs text-ink-soft">자료의 제목 구조와 그 아래에서 찾은 개념을 가지 모양으로 보여 줘요.</p>
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              <div className="mb-3 inline-block rounded-xl border-2 border-ink bg-lavender px-3 py-2 font-pixel font-bold">{doc.title}</div>
              <ul className="ml-4 space-y-2 border-l-[3px] border-lavender-deep pl-4">
                {[...bySection.entries()].map(([section, list]) => (
                  <li key={section}>
                    <div className="inline-block rounded-lg border-2 border-ink/60 bg-pink-soft px-2 py-1 font-pixel text-sm font-bold">{section}</div>
                    <ul className="ml-4 mt-1 flex flex-wrap gap-1 border-l-2 border-pink-deep/60 pl-3">
                      {list.map((c) => (
                        <li key={c.id}>
                          <Link to={`/lecture?concept=${c.id}`} className="chip bg-white hover:bg-mint-soft">
                            {c.term}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      <Modal open={!!adding} onClose={() => setAdding(null)} title="원문에서 개념 추가">
        {adding && (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              await addManualConcept({ documentId: doc.id, chunkId: adding.chunk.id, term: adding.term, statement: adding.statement });
              setAdding(null);
              toast('개념을 추가했어요(확인 완료 상태).', 'success');
            }}
          >
            <p className="rounded bg-butter-soft p-2 text-xs">근거 문단: {adding.chunk.text.slice(0, 200)}</p>
            <label className="block">
              <span className="label">용어</span>
              <input className="input" value={adding.term} onChange={(e) => setAdding({ ...adding, term: e.target.value })} required maxLength={40} autoFocus />
            </label>
            <label className="block">
              <span className="label">설명(원문 문장 그대로 두면 근거가 정확히 연결돼요)</span>
              <textarea className="input" rows={4} value={adding.statement} onChange={(e) => setAdding({ ...adding, statement: e.target.value })} required />
            </label>
            <div className="flex justify-end">
              <button className="btn-primary" type="submit">
                추가
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
