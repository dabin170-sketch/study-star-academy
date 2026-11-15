import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CAST, CAST_IDS, IMPLEMENTED_MOTIONS, samplePose } from '@academy/animation-engine';
import { LENGTH_LABEL, estimateEpisodeMs, type StoryIssue } from '@academy/learning-engine';
import { EMOTION_LABEL, MOTION_LABEL, STORY_STYLE_LABEL, type CastId, type Emotion, type MotionId, type StoryProject } from '@academy/shared';
import { db } from '../storage/db';
import { Card, EmptyState, InfoBox, LinkButton, Modal, PageHeader, StatusChip, Tabs, formatDateTime } from '../components/ui';
import { PixelBuilding } from '../components/PixelBuilding';
import { CharacterRig } from '../features/theater/CharacterRig';
import { issuesFor, resetCastCustomization, saveCastCustomization, useCastProfiles } from '../features/theater/storyService';
import { useClock } from '../features/theater/Stage';
import { toast } from '../stores/ui';

function ProjectCard({ p, onDelete }: { p: StoryProject; onDelete: () => void }) {
  const [issues, setIssues] = useState<StoryIssue[] | null>(null);
  useEffect(() => {
    issuesFor(p).then(setIssues);
  }, [p]);
  const errors = issues?.filter((i) => i.level === 'error').length ?? 0;
  const warnings = issues?.filter((i) => i.level === 'warning').length ?? 0;
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-pixel text-lg font-bold">{p.title}</h3>
        <span className="chip bg-lavender-soft">{p.format === 'comic' ? '학습 만화' : p.format === 'animation' ? '애니메이션' : '선택형 스토리'}</span>
        <span className="chip bg-white">{STORY_STYLE_LABEL[p.episode.style]}</span>
        <span className="chip bg-milk-soft">템플릿 모드</span>
      </div>
      <p className="text-xs text-ink-soft">
        {LENGTH_LABEL[p.length]} · 실제 예상 {Math.round(estimateEpisodeMs(p.episode) / 6000) / 10}분 · 장면 {p.episode.scenes.length}개 · 개념 {p.episode.objectives.map((o) => o.term).join(', ')} · 최근 {formatDateTime(p.lastOpenedAt)}
      </p>
      {issues && (errors > 0 || warnings > 0) && (
        <p className={`text-xs ${errors ? 'text-pink-deep' : 'text-butter-deep'}`}>
          ⚠ 검증 {errors ? `오류 ${errors}개` : ''} {warnings ? `확인 필요 ${warnings}개` : ''} — 편집기에서 확인하세요
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Link className="btn-primary btn-sm" to={`/theater/${p.id}/play`}>
          애니메이션
        </Link>
        <Link className="btn-mint btn-sm" to={`/theater/${p.id}/comic`}>
          만화
        </Link>
        <Link className="btn-ghost btn-sm" to={`/theater/${p.id}/edit`}>
          편집
        </Link>
        <Link className="btn-ghost btn-sm" to={`/theater/${p.id}/review`}>
          복습
        </Link>
        <button className="btn-ghost btn-sm ml-auto" onClick={onDelete}>
          삭제
        </button>
      </div>
    </Card>
  );
}

function CastPreview({ id, motion, emotion, size = 220 }: { id: CastId; motion: MotionId; emotion: Emotion; size?: number }) {
  const profiles = useCastProfiles();
  const t = useClock(true, 'high');
  const [start] = useState(() => performance.now());
  const pose = samplePose(motion, t - start, emotion);
  return (
    <svg viewBox="-150 -230 300 340" width={size} height={(size * 340) / 300} role="img" aria-label={`${profiles[id].name} ${MOTION_LABEL[motion]}`}>
      <ellipse cx={0} cy={96} rx={50} ry={9} fill="#4a3f5c" opacity={0.15} />
      <CharacterRig profile={profiles[id]} pose={pose} emotion={emotion} prop={undefined} markers />
    </svg>
  );
}

function CastStudio() {
  const profiles = useCastProfiles();
  const [sel, setSel] = useState<CastId>('hana');
  const [motion, setMotion] = useState<MotionId>('explain');
  const [emotion, setEmotion] = useState<Emotion>('joy');
  const p = profiles[sel];
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <Card className="flex flex-col items-center">
        <CastPreview id={sel} motion={motion} emotion={emotion} size={260} />
        <div className="font-pixel text-xl font-bold">{p.name}</div>
        <div className="text-sm text-ink-soft">{p.role}</div>
        <p className="mt-1 text-center text-xs text-ink-soft">
          {p.personality} · 말투: {p.speech}
        </p>
      </Card>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {CAST_IDS.map((id) => (
            <button key={id} className={`card p-1 text-center text-xs ${sel === id ? 'bg-lavender' : ''}`} onClick={() => setSel(id)} aria-pressed={sel === id}>
              <CastPreview id={id} motion="idle" emotion={CAST[id].habitEmotion} size={70} />
              {profiles[id].name}
            </button>
          ))}
        </div>
        <Card className="space-y-2">
          <label className="block">
            <span className="label">이름</span>
            <input className="input" key={sel + 'n'} defaultValue={p.name} maxLength={12} onBlur={(e) => saveCastCustomization(sel, { name: e.target.value.trim() })} />
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              머리색 <input type="color" key={sel + 'h'} defaultValue={p.hair} onChange={(e) => saveCastCustomization(sel, { hair: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              옷 색 <input type="color" key={sel + 'o'} defaultValue={p.outfit} onChange={(e) => saveCastCustomization(sel, { outfit: e.target.value })} />
            </label>
            <button className="btn-ghost btn-sm ml-auto" onClick={() => { resetCastCustomization(sel); toast('기본 모습으로 되돌렸어요.'); }}>
              기본값
            </button>
          </div>
          <p className="text-xs text-ink-soft">바꾼 이름·색은 모든 작품의 만화와 애니메이션에 같이 적용돼요(캐릭터 ID로 같은 디자인을 유지).</p>
        </Card>
        <Card>
          <div className="label">표정 미리보기</div>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(EMOTION_LABEL) as Emotion[]).map((e) => (
              <button key={e} className={`btn btn-sm ${emotion === e ? 'bg-lavender' : 'bg-white'}`} onClick={() => setEmotion(e)}>
                {EMOTION_LABEL[e]}
              </button>
            ))}
          </div>
          <div className="label mt-3">모션 미리보기</div>
          <div className="flex flex-wrap gap-1">
            {IMPLEMENTED_MOTIONS.map((m) => (
              <button key={m} className={`btn btn-sm ${motion === m ? 'bg-lavender' : 'bg-white'}`} onClick={() => setMotion(m)} data-motion={m}>
                {MOTION_LABEL[m]}
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function Theater() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'works' | 'cast') || 'works';
  const projects = useLiveQuery(() => db.storyProjects.orderBy('updatedAt').reverse().toArray(), []);
  const [del, setDel] = useState<StoryProject | null>(null);
  return (
    <div>
      <PageHeader
        title="이야기 극장"
        subtitle="자료 속 개념으로 학습 만화와 움직이는 애니메이션을 만들고, 이야기 속에서 선택하며 배워요."
        icon={<PixelBuilding roof="#b48be0" wall="#f4f1f7" size={56} />}
        actions={
          <>
            <StatusChip status="ready" />
            <LinkButton to="/theater/new">+ 새 작품 만들기</LinkButton>
          </>
        }
      />
      <Tabs value={tab} onChange={(t) => setParams({ tab: t })} items={[{ value: 'works', label: `내 작품 보관함 (${projects?.length ?? 0})` }, { value: 'cast', label: '캐릭터 스튜디오' }]} />
      {tab === 'works' ? (
        <div className="space-y-3">
          <InfoBox tone="milk">
            지금은 <b>템플릿 모드</b>만 제공해요. 검증된 이야기 틀(탐정 사건·분류 소동·모의 재판·시간 여행·실험실·모험·교실)에 개념을 넣고, 학습 대사는 원문 문장을 그대로 씁니다. 장면마다 새 그림을 AI로 만들지 않고, 캐릭터·배경·동작을 실시간으로 조합해 움직여요. AI 확장 모드(새 대사·설명 생성)는 개발 예정이에요.
          </InfoBox>
          {projects && projects.length === 0 ? (
            <EmptyState title="아직 만든 작품이 없어요" desc="자료와 개념을 고르면 만화·애니메이션 학습 작품을 만들어 드려요." action={<LinkButton to="/theater/new">새 작품 만들기</LinkButton>} />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">{projects?.map((p) => <ProjectCard key={p.id} p={p} onDelete={() => setDel(p)} />)}</div>
          )}
          <Card className="text-sm">
            <h2 className="mb-1 font-bold">이야기 극장 기능 현황</h2>
            <ul className="grid gap-1 sm:grid-cols-2">
              <li>✅ 학습 만화(1·4·8·12컷, 세로 웹툰, 챕터형)</li>
              <li>✅ 애니메이션 교실(관절 애니메이션, 카메라, 자막, 음성)</li>
              <li>✅ 선택형 스토리(분기·재합류·엔딩)</li>
              <li>✅ 캐릭터 스튜디오 · 장면 편집기 · 자동 저장</li>
              <li>✅ 친구 광장 함께 보기 · 공동 선택</li>
              <li>⏳ 역할극 학습 · 번갈아 설명하기 (개발 예정)</li>
              <li>⏳ 자유 입력형 선택지 · AI 확장 모드 (개발 예정)</li>
            </ul>
          </Card>
        </div>
      ) : (
        <CastStudio />
      )}
      <Modal open={!!del} onClose={() => setDel(null)} title="작품을 삭제할까요?">
        <p className="text-sm">작품의 대본과 장면 편집 내용이 삭제돼요. 개념·문항·학습 기록은 그대로 남아요.</p>
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setDel(null)}>
            취소
          </button>
          <button
            className="btn-pink"
            onClick={async () => {
              await db.storyProjects.delete(del!.id);
              await db.playbackProgress.where('projectId').equals(del!.id).delete();
              setDel(null);
            }}
          >
            삭제
          </button>
        </div>
      </Modal>
    </div>
  );
}
