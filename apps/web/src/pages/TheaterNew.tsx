/** 애니메이션 제작소: 자료 → 개념 → 형식·스타일·길이 → 캐릭터 → 스토리보드 확인 → 저장 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CAST_IDS } from '@academy/animation-engine';
import { LENGTH_LABEL, LENGTH_PLAN, estimateEpisodeMs, mainPath, pickStyle, validateEpisode, type StoryConcept, type StoryIssue } from '@academy/learning-engine';
import { STORY_STYLE_LABEL, type CastId, type ComicLayoutKind, type StoryEpisode, type StoryLength, type StoryProject, type StoryStyle } from '@academy/shared';
import { db } from '../storage/db';
import { Card, EmptyState, ErrorBox, InfoBox, LinkButton, PageHeader } from '../components/ui';
import { CharacterRig } from '../features/theater/CharacterRig';
import { buildEpisode, createProject, storyConcepts, useCastProfiles } from '../features/theater/storyService';
import { samplePose } from '@academy/animation-engine';
import { useCurrentSubject } from '../hooks/data';
import { masteryMap } from '../learning/services';
import { toast } from '../stores/ui';

const STEPS = ['자료', '개념', '형식·스타일', '캐릭터', '스토리보드'];
const LENGTHS: StoryLength[] = [30, 60, 180, 300, 600];

export default function TheaterNew() {
  const navigate = useNavigate();
  const { subject } = useCurrentSubject();
  const profiles = useCastProfiles();
  const [step, setStep] = useState(0);
  const [docId, setDocId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [format, setFormat] = useState<StoryProject['format']>('animation');
  const [style, setStyle] = useState<StoryStyle | 'auto'>('auto');
  const [length, setLength] = useState<StoryLength>(180);
  const [layout, setLayout] = useState<ComicLayoutKind>('4');
  const [cast, setCast] = useState<CastId[]>([...CAST_IDS]);
  const [episode, setEpisode] = useState<StoryEpisode | null>(null);
  const [issues, setIssues] = useState<StoryIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [weak, setWeak] = useState<Set<string>>(new Set());

  const docs = useLiveQuery(async () => (subject ? db.documents.where('subjectId').equals(subject.id).toArray() : []), [subject?.id]);
  const concepts = useLiveQuery(async () => (subject ? storyConcepts(subject.id) : []), [subject?.id]);
  useEffect(() => {
    if (!docId && docs?.length) setDocId(docs[0].id);
  }, [docs, docId]);
  useEffect(() => {
    if (subject) masteryMap(subject.id).then((m) => setWeak(new Set([...m.entries()].filter(([, v]) => v.state !== 'mastered').map(([k]) => k))));
  }, [subject]);
  const docConcepts = useMemo(() => (concepts ?? []).filter((c) => c.evidence?.documentId === docId), [concepts, docId]);
  const usable = docConcepts.filter((c) => c.status === 'auto' || c.status === 'verified');
  const unusable = docConcepts.filter((c) => !(c.status === 'auto' || c.status === 'verified'));
  const maxConcepts = LENGTH_PLAN[length].concepts;
  const autoStyle = useMemo(() => pickStyle(usable.filter((c) => selected.includes(c.id))), [usable, selected]);

  if (!subject || !docs) return null;
  if (!docs.length) return <EmptyState title="먼저 학습 자료를 올려 주세요" action={<LinkButton to="/library">도서관으로</LinkButton>} />;

  const generate = async () => {
    setError(null);
    try {
      const ep = await buildEpisode({ subjectId: subject.id, documentId: docId, conceptIds: selected, format, style, length, cast, layout });
      setEpisode(ep);
      const all = await db.concepts.where('subjectId').equals(subject.id).toArray();
      setIssues(validateEpisode(ep, all));
      setStep(4);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const save = async () => {
    if (!episode) return;
    const p = await createProject({ subjectId: subject.id, documentId: docId, conceptIds: selected, format, style, length, cast, layout }, episode);
    toast('작품을 저장했어요.', 'success');
    navigate(format === 'comic' ? `/theater/${p.id}/comic` : `/theater/${p.id}/play`);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="애니메이션 제작소" subtitle="자료의 개념으로 학습 만화·애니메이션을 만들어요." actions={<Link className="btn-ghost btn-sm" to="/theater">← 이야기 극장</Link>} />
      <ol className="flex flex-wrap gap-1 text-xs">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button className={`chip ${i === step ? 'bg-lavender font-bold' : i < step ? 'bg-mint' : 'bg-white'}`} disabled={i > step} onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined}>
              {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card className="space-y-3">
          <h2 className="text-lg font-bold">어떤 자료로 만들까요?</h2>
          {docs.map((d) => (
            <label key={d.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border-2 p-3 ${docId === d.id ? 'border-lavender-deep bg-lavender-soft' : 'border-ink/20'}`}>
              <input type="radio" name="doc" checked={docId === d.id} onChange={() => { setDocId(d.id); setSelected([]); }} />
              <span className="font-bold">{d.title}</span>
              <span className="text-xs text-ink-soft">개념 {(concepts ?? []).filter((c) => c.evidence?.documentId === d.id).length}개</span>
            </label>
          ))}
          <div className="flex justify-end">
            <button className="btn-primary" onClick={() => setStep(1)} disabled={!docId}>
              다음
            </button>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card className="space-y-3">
          <h2 className="text-lg font-bold">배울 개념을 골라 주세요</h2>
          <p className="text-sm text-ink-soft">원문 근거가 확인된 개념만 이야기로 만들 수 있어요. 길이에 따라 최대 {maxConcepts}개까지 쓰여요(길이는 다음 단계에서 바꿀 수 있어요). 비슷한 개념이 함께 있으면 오개념·선택지가 더 풍부해져요.</p>
          <div className="flex flex-wrap gap-2">
            {usable.map((c) => (
              <label key={c.id} className={`chip cursor-pointer px-3 py-1 text-sm ${selected.includes(c.id) ? 'bg-lavender' : 'bg-white'}`}>
                <input type="checkbox" className="mr-1" checked={selected.includes(c.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))} />
                {c.term}
                {weak.has(c.id) && <span className="text-[10px] text-pink-deep">복습 필요</span>}
              </label>
            ))}
          </div>
          {unusable.length > 0 && <p className="text-xs text-ink-soft">확인 필요·제외 개념 {unusable.length}개는 목록에서 뺐어요(도서관에서 확인하면 쓸 수 있어요).</p>}
          <div className="flex justify-between">
            <button className="btn-ghost btn-sm" onClick={() => setSelected(usable.filter((c) => weak.has(c.id)).slice(0, maxConcepts).map((c) => c.id))}>
              복습 필요한 개념 자동 선택
            </button>
            <button className="btn-primary" onClick={() => setStep(2)} disabled={!selected.length}>
              다음 ({selected.length}개)
            </button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="space-y-4">
          <div>
            <h2 className="label">학습 방식</h2>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['animation', '애니메이션으로 배우기'],
                  ['comic', '만화로 배우기'],
                  ['story', '선택형 이야기로 배우기'],
                ] as const
              ).map(([v, l]) => (
                <button key={v} className={`btn btn-sm ${format === v ? 'bg-lavender' : 'bg-white'}`} onClick={() => setFormat(v)} aria-pressed={format === v}>
                  {l}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-ink-soft">세 방식 모두 같은 대본을 써서, 만든 뒤에 만화·애니메이션을 자유롭게 오갈 수 있어요.</p>
          </div>
          <div>
            <h2 className="label">이야기 스타일</h2>
            <div className="flex flex-wrap gap-2">
              <button className={`btn btn-sm ${style === 'auto' ? 'bg-lavender' : 'bg-white'}`} onClick={() => setStyle('auto')}>
                자동 ({STORY_STYLE_LABEL[autoStyle]})
              </button>
              {(Object.keys(STORY_STYLE_LABEL) as StoryStyle[]).map((s) => (
                <button key={s} className={`btn btn-sm ${style === s ? 'bg-lavender' : 'bg-white'}`} onClick={() => setStyle(s)}>
                  {STORY_STYLE_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h2 className="label">길이</h2>
            <div className="flex flex-wrap gap-2">
              {LENGTHS.map((l) => (
                <button key={l} className={`btn btn-sm ${length === l ? 'bg-lavender' : 'bg-white'}`} onClick={() => setLength(l)}>
                  {LENGTH_LABEL[l]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-ink-soft">실제 길이는 대사량으로 다시 계산해 스토리보드에서 보여 드려요. 원하는 길이에 맞추려면 편집기에서 장면 길이를 직접 정할 수 있어요(사용자 지정).</p>
          </div>
          {format === 'comic' && (
            <div>
              <h2 className="label">컷 구성</h2>
              <div className="flex flex-wrap gap-2">
                {(['1', '4', '8', '12', 'webtoon', 'chapter'] as ComicLayoutKind[]).map((l) => (
                  <button key={l} className={`btn btn-sm ${layout === l ? 'bg-lavender' : 'bg-white'}`} onClick={() => setLayout(l)}>
                    {l === 'webtoon' ? '세로 웹툰' : l === 'chapter' ? '챕터형' : `${l}컷`}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <button className="btn-primary" onClick={() => setStep(3)}>
              다음
            </button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="space-y-3">
          <h2 className="text-lg font-bold">함께할 캐릭터</h2>
          <p className="text-sm text-ink-soft">2명 이상 골라 주세요. 빠진 역할은 고른 캐릭터가 성격에 맞게 나눠 맡아요.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {CAST_IDS.map((id) => (
              <label key={id} className={`card flex cursor-pointer flex-col items-center p-2 text-center text-xs ${cast.includes(id) ? 'bg-lavender' : ''}`}>
                <input type="checkbox" className="sr-only" checked={cast.includes(id)} onChange={(e) => setCast((c) => (e.target.checked ? [...c, id] : c.filter((x) => x !== id)))} />
                <svg viewBox="-150 -230 300 340" width={90} height={102} aria-hidden="true">
                  <CharacterRig profile={profiles[id]} pose={samplePose('idle', 0, profiles[id].habitEmotion)} emotion={profiles[id].habitEmotion} />
                </svg>
                <b>{profiles[id].name}</b>
                <span className="text-ink-soft">{profiles[id].role}</span>
              </label>
            ))}
          </div>
          {error && <ErrorBox>{error}</ErrorBox>}
          <div className="flex justify-end">
            <button className="btn-primary" onClick={generate} disabled={cast.length < 2}>
              스토리 구성하기
            </button>
          </div>
        </Card>
      )}

      {step === 4 && episode && (
        <div className="space-y-3">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-pixel text-xl font-bold">{episode.title}</h2>
              <span className="chip bg-milk-soft">템플릿 모드</span>
              <span className="text-sm text-ink-soft">실제 예상 길이 약 {Math.round(estimateEpisodeMs(episode) / 6000) / 10}분 · 장면 {episode.scenes.length}개(선택지 피드백 포함)</span>
            </div>
            <ul className="mt-2 text-sm">
              {episode.objectives.map((o) => (
                <li key={o.conceptId}>🎯 {o.text}</li>
              ))}
            </ul>
          </Card>
          {issues.length > 0 ? (
            <ErrorBox title="검증에서 확인할 점이 있어요">
              <ul className="list-disc pl-5">
                {issues.map((i, k) => (
                  <li key={k}>{i.message}</li>
                ))}
              </ul>
            </ErrorBox>
          ) : (
            <InfoBox tone="mint">검증 통과: 학습 대사는 모두 원문 근거와 연결되어 있고, 분기는 모두 다시 합류해 엔딩까지 이어져요.</InfoBox>
          )}
          <Card>
            <h3 className="mb-2 font-bold">스토리보드</h3>
            <ol className="space-y-2">
              {mainPath(episode).map((s, i) => (
                <li key={s.id} className="rounded-lg border-2 border-ink/15 p-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <b>
                      {i + 1}. {s.title}
                    </b>
                    <span className="chip bg-white">{s.beat}</span>
                    {s.choice && <span className="chip bg-butter">선택지 {s.choice.options.length}개</span>}
                  </div>
                  <ul className="mt-1 text-xs text-ink-soft">
                    {s.lines.map((l) => (
                      <li key={l.id}>
                        <b>{l.speaker === 'narrator' ? '해설' : profiles[l.speaker as CastId].name}</b>: {l.text} {l.fact !== 'fiction' && <span className="chip bg-butter text-[9px]">{l.fact === 'source' ? '원문' : '원문 핵심어'}</span>}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </Card>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={generate}>
              다른 이야기로 다시 구성
            </button>
            <button className="btn-primary" onClick={save}>
              저장하고 보기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
