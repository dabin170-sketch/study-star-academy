import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { CharacterId } from '@academy/shared';
import { CHARACTERS, PixelCharacter } from '../components/PixelCharacter';
import { Card, InfoBox } from '../components/ui';
import { updateProfile } from '../learning/profile';
import { createSubject, loadSampleDocument } from '../learning/sample';
import { Uploader } from '../features/import/Uploader';
import { db, entity } from '../storage/db';
import { useUI } from '../stores/ui';

const STEPS = ['환영', '캐릭터', '목표', '과목', '자료', '확인', '학습 방법'];

export default function Onboarding() {
  const navigate = useNavigate();
  const setSubject = useUI((s) => s.setSubject);
  const [step, setStep] = useState(0);
  const [character, setCharacter] = useState<CharacterId>('byeol');
  const [nickname, setNickname] = useState('');
  const [goal, setGoal] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [subjectName, setSubjectName] = useState('');
  const [examDate, setExamDate] = useState('');
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const summary = useLiveQuery(async () => {
    if (!docId) return null;
    const doc = await db.documents.get(docId);
    const concepts = await db.concepts.where('documentId').equals(docId).toArray();
    return { doc, total: concepts.length, auto: concepts.filter((c) => c.status === 'auto').length, check: concepts.filter((c) => c.status === 'needs-check').length, terms: concepts.slice(0, 8).map((c) => c.term) };
  }, [docId]);

  const finish = async (to: string) => {
    await updateProfile({ onboarded: true });
    navigate(to);
  };

  const skip = async () => {
    await updateProfile({ onboarded: true, nickname: nickname || '학습자', characterId: character });
    navigate('/');
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <ol className="flex flex-wrap gap-1 text-xs" aria-label="시작 단계">
        {STEPS.map((s, i) => (
          <li key={s} className={`chip ${i === step ? 'bg-lavender font-bold' : i < step ? 'bg-mint' : 'bg-white'}`} aria-current={i === step ? 'step' : undefined}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      <Card className="p-6">
        {step === 0 && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex gap-2">
              {CHARACTERS.map((c) => (
                <PixelCharacter key={c.id} id={c.id} size={64} />
              ))}
            </div>
            <h1 className="text-2xl font-bold">공부별 아카데미에 오신 걸 환영해요!</h1>
            <p className="text-sm text-ink-soft">
              강의 자료를 올리면 원문에서 개념을 찾아 근거와 함께 정리하고, 플래시카드·백지 복습·모의고사·오답 분석까지 이어서 공부할 수 있어요. 모든 핵심 기능은 무료이고, 자료와 기록은 이 기기에만 저장돼요.
            </p>
            <div className="flex gap-2">
              <button className="btn-primary" onClick={() => setStep(1)}>
                시작하기
              </button>
              <button className="btn-ghost" onClick={skip}>
                건너뛰기
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="mb-3 text-xl font-bold">함께할 캐릭터를 골라 주세요</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup" aria-label="캐릭터">
              {CHARACTERS.map((c) => (
                <button key={c.id} role="radio" aria-checked={character === c.id} onClick={() => setCharacter(c.id)} className={`card flex flex-col items-center p-3 ${character === c.id ? 'bg-lavender' : ''}`}>
                  <PixelCharacter id={c.id} size={72} />
                  <span className="font-pixel font-bold">{c.name}</span>
                  <span className="text-xs text-ink-soft">{c.desc}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button className="btn-primary" onClick={() => setStep(2)}>
                다음
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              await updateProfile({ nickname: nickname.trim() || '학습자', characterId: character, goal: goal.trim() });
              await db.goals.clear();
              await db.goals.add(entity({ title: '하루 공부 목표', minutesPerDay: minutes, active: true }));
              setStep(3);
            }}
          >
            <h2 className="text-xl font-bold">목표를 알려 주세요</h2>
            <label className="block">
              <span className="label">닉네임</span>
              <input className="input" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={12} placeholder="예: 오르카" />
            </label>
            <label className="block">
              <span className="label">학습 목표</span>
              <input className="input" value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={60} placeholder="예: 특수교사 임용시험 1차 합격" />
            </label>
            <label className="block">
              <span className="label">하루 공부 목표: {minutes}분</span>
              <input type="range" min={10} max={480} step={10} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="w-full" />
            </label>
            <div className="flex justify-end">
              <button className="btn-primary" type="submit">
                다음
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const id = await createSubject(subjectName || '특수교육');
              if (examDate) {
                const s = await db.subjects.get(id);
                if (s) await db.subjects.put({ ...s, examDate });
              }
              setSubjectId(id);
              setSubject(id);
              setStep(4);
            }}
          >
            <h2 className="text-xl font-bold">첫 과목을 만들어요</h2>
            <label className="block">
              <span className="label">과목 이름</span>
              <input className="input" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder="예: 특수교육학" maxLength={30} />
            </label>
            <label className="block">
              <span className="label">시험 날짜(선택)</span>
              <input className="input" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
            </label>
            <div className="flex justify-end">
              <button className="btn-primary" type="submit">
                다음
              </button>
            </div>
          </form>
        )}

        {step === 4 && subjectId && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold">강의 자료를 올려 주세요</h2>
            <Uploader
              subjectId={subjectId}
              onDone={(id) => {
                setDocId(id);
                setStep(5);
              }}
            />
            <div className="text-center text-sm text-ink-soft">파일이 없나요?</div>
            <div className="flex justify-center">
              <button
                className="btn-ghost"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const id = await loadSampleDocument(subjectId);
                  setBusy(false);
                  setDocId(id);
                  setStep(5);
                }}
              >
                {busy ? '준비 중…' : '예시 자료로 체험하기'}
              </button>
            </div>
          </div>
        )}

        {step === 5 && summary && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold">원문에서 찾은 내용이에요</h2>
            <p className="text-sm">
              <b>{summary.doc?.title}</b> — {summary.doc?.pageCount}
              {summary.doc?.fileType === 'pptx' ? '슬라이드' : summary.doc?.fileType === 'pdf' ? '쪽' : '구간'}
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="card bg-milk-soft p-2">
                <div className="font-pixel text-xl font-bold">{summary.total}</div>
                <div className="text-xs">찾은 개념</div>
              </div>
              <div className="card bg-mint-soft p-2">
                <div className="font-pixel text-xl font-bold">{summary.auto}</div>
                <div className="text-xs">원문 근거 있음</div>
              </div>
              <div className="card bg-butter-soft p-2">
                <div className="font-pixel text-xl font-bold">{summary.check}</div>
                <div className="text-xs">확인 필요</div>
              </div>
            </div>
            {summary.terms.length > 0 && <p className="text-sm">예: {summary.terms.join(', ')}</p>}
            {summary.doc?.warnings.map((w) => (
              <InfoBox key={w} tone="butter">
                {w}
              </InfoBox>
            ))}
            <InfoBox>모든 개념은 원문 문장과 연결되어 있어요. ‘확인 필요’ 개념은 원문을 보고 직접 확인하거나 고친 뒤에 문제로 만들어져요.</InfoBox>
            <div className="flex justify-end">
              <button className="btn-primary" onClick={() => setStep(6)}>
                다음
              </button>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold">어떻게 공부를 시작할까요?</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="btn-ghost justify-start p-4 text-left" onClick={() => finish(docId ? `/library/${docId}` : '/library')}>
                📖 원문과 개념 확인하기
              </button>
              <button className="btn-ghost justify-start p-4 text-left" onClick={() => finish('/greenhouse')}>
                🌱 플래시카드로 외우기
              </button>
              <button className="btn-ghost justify-start p-4 text-left" onClick={() => finish('/lecture/blank')}>
                📝 백지 복습으로 떠올리기
              </button>
              <button className="btn-ghost justify-start p-4 text-left" onClick={() => finish('/lecture?tab=quiz')}>
                ✏️ 빠른 퀴즈 풀기
              </button>
            </div>
            <p className="text-xs text-ink-soft">처음 공부한 카드는 간격 반복으로 다음 복습 날짜가 자동으로 예약되고, 진행률은 아카데미 대시보드에서 볼 수 있어요.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
