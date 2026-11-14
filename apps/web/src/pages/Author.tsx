/** 출제자 모드: 직접 문제를 만들고 원문 출처와 채점 기준을 붙인다. 만든 문제는 퀴즈·시험·던전에 쓰인다. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { QUESTION_TYPE_LABEL, type Question, type QuestionType, type RubricItem } from '@academy/shared';
import { db, entity } from '../storage/db';
import { Card, EmptyState, PageHeader } from '../components/ui';
import { useCurrentSubject } from '../hooks/data';
import { toast } from '../stores/ui';
import { SubjectPicker } from '../components/SubjectPicker';

export default function Author() {
  const { subject } = useCurrentSubject();
  const [type, setType] = useState<QuestionType>('mcq');
  const [prompt, setPrompt] = useState('');
  const [choices, setChoices] = useState(['', '', '', '']);
  const [answerIndex, setAnswerIndex] = useState(0);
  const [ox, setOx] = useState(true);
  const [text, setText] = useState('');
  const [accepted, setAccepted] = useState('');
  const [points, setPoints] = useState(2);
  const [explanation, setExplanation] = useState('');
  const [rubric, setRubric] = useState<RubricItem[]>([{ label: '핵심 용어 사용', keywords: [], points: 2 }]);
  const [conceptId, setConceptId] = useState('');

  const concepts = useLiveQuery(async () => (subject ? (await db.concepts.where('subjectId').equals(subject.id).toArray()).filter((c) => c.status !== 'rejected') : []), [subject?.id]);
  const mine = useLiveQuery(async () => (subject ? (await db.questions.where('subjectId').equals(subject.id).toArray()).filter((q) => q.origin === 'user') : []), [subject?.id]);

  const reset = () => {
    setPrompt('');
    setChoices(['', '', '', '']);
    setText('');
    setAccepted('');
    setExplanation('');
  };

  const save = async () => {
    if (!subject) return;
    const concept = concepts?.find((c) => c.id === conceptId);
    const ev = concept ? await db.evidence.where('conceptId').equals(concept.id).first() : undefined;
    let answer: Question['answer'];
    let cs: string[] | undefined;
    if (type === 'mcq') {
      cs = choices.map((c) => c.trim()).filter(Boolean);
      if (cs.length < 2) return toast('보기를 2개 이상 입력해 주세요.', 'error');
      answer = Math.min(answerIndex, cs.length - 1);
    } else if (type === 'ox') answer = ox;
    else answer = text.trim();
    if (!prompt.trim()) return toast('문제를 입력해 주세요.', 'error');
    if ((type === 'short' || type === 'blank') && !text.trim()) return toast('정답을 입력해 주세요.', 'error');
    const items = rubric.filter((r) => r.label.trim()).map((r) => ({ ...r, keywords: r.keywords.filter(Boolean) }));
    const q: Question = entity({
      subjectId: subject.id,
      documentId: concept?.documentId,
      conceptId: concept?.id,
      type,
      prompt: prompt.trim(),
      choices: cs,
      answer,
      acceptedAnswers: accepted.split(',').map((a) => a.trim()).filter(Boolean),
      explanation: explanation.trim() || (concept ? `원문 근거: “${concept.statement}”` : '직접 만든 문제입니다.'),
      points: type === 'essay' ? items.reduce((a, b) => a + b.points, 0) || points : points,
      origin: 'user' as const,
      evidence: ev && concept ? { documentId: concept.documentId, chunkId: ev.chunkId, pageNumber: ev.pageNumber, quote: ev.quote } : undefined,
      rubric: type === 'essay' ? { items, modelAnswer: text.trim() || concept?.statement || '' } : undefined,
    });
    await db.questions.add(q);
    toast('문제를 저장했어요. 퀴즈·모의고사·던전에서 함께 출제돼요.', 'success');
    reset();
  };

  if (!subject) return <EmptyState title="과목을 먼저 만들어 주세요" />;

  return (
    <div>
      <PageHeader title="출제자 모드" subtitle="직접 문제를 만들고 원문 출처·채점 기준·해설을 붙여요." actions={<><SubjectPicker /><Link className="btn-ghost btn-sm" to="/tower">← 시험의 탑</Link></>} />
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(QUESTION_TYPE_LABEL) as QuestionType[]).map((t) => (
              <button key={t} className={`btn btn-sm ${type === t ? 'bg-lavender' : 'bg-white'}`} onClick={() => setType(t)}>
                {QUESTION_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="label">문제</span>
            <textarea className="input" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={type === 'essay' ? '예: 다음 사례에서 학생의 문제행동 기능을 분석하고 중재 전략을 쓰시오.' : '문제를 입력하세요.'} />
          </label>
          {type === 'mcq' && (
            <fieldset className="space-y-1">
              <legend className="label">보기(정답에 표시)</legend>
              {choices.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="radio" name="answer" checked={answerIndex === i} onChange={() => setAnswerIndex(i)} aria-label={`${i + 1}번을 정답으로`} />
                  <input className="input py-1" value={c} onChange={(e) => setChoices(choices.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`보기 ${i + 1}`} />
                </div>
              ))}
            </fieldset>
          )}
          {type === 'ox' && (
            <div className="flex gap-2">
              <button className={`btn flex-1 ${ox ? 'bg-lavender' : 'bg-white'}`} onClick={() => setOx(true)}>
                정답 O
              </button>
              <button className={`btn flex-1 ${!ox ? 'bg-lavender' : 'bg-white'}`} onClick={() => setOx(false)}>
                정답 X
              </button>
            </div>
          )}
          {(type === 'short' || type === 'blank') && (
            <>
              <label className="block">
                <span className="label">정답</span>
                <input className="input" value={text} onChange={(e) => setText(e.target.value)} />
              </label>
              <label className="block">
                <span className="label">함께 인정할 답(쉼표로 구분)</span>
                <input className="input" value={accepted} onChange={(e) => setAccepted(e.target.value)} placeholder="예: IEP, 개별화교육프로그램" />
              </label>
            </>
          )}
          {type === 'essay' && (
            <>
              <label className="block">
                <span className="label">모범 답안</span>
                <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
              </label>
              <fieldset className="space-y-2">
                <legend className="label">채점 기준표</legend>
                {rubric.map((r, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_70px_auto] gap-1">
                    <input className="input py-1 text-sm" value={r.label} onChange={(e) => setRubric(rubric.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="기준" aria-label="기준" />
                    <input className="input py-1 text-sm" value={r.keywords.join(', ')} onChange={(e) => setRubric(rubric.map((x, j) => (j === i ? { ...x, keywords: e.target.value.split(',').map((k) => k.trim()) } : x)))} placeholder="핵심어(쉼표)" aria-label="핵심어" />
                    <input className="input py-1 text-sm" type="number" min={1} max={20} value={r.points} onChange={(e) => setRubric(rubric.map((x, j) => (j === i ? { ...x, points: Number(e.target.value) } : x)))} aria-label="배점" />
                    <button className="btn-ghost btn-sm" onClick={() => setRubric(rubric.filter((_, j) => j !== i))} aria-label="기준 삭제">
                      ✕
                    </button>
                  </div>
                ))}
                <button className="btn-ghost btn-sm" onClick={() => setRubric([...rubric, { label: '', keywords: [], points: 1 }])}>
                  + 기준 추가
                </button>
              </fieldset>
            </>
          )}
          {type !== 'essay' && (
            <label className="block">
              <span className="label">배점</span>
              <input className="input w-24" type="number" min={1} max={20} value={points} onChange={(e) => setPoints(Number(e.target.value))} />
            </label>
          )}
          <label className="block">
            <span className="label">해설</span>
            <textarea className="input" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">원문 출처(개념 연결, 선택)</span>
            <select className="input" value={conceptId} onChange={(e) => setConceptId(e.target.value)}>
              <option value="">연결 안 함</option>
              {concepts?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.term}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-primary w-full" onClick={save}>
            문제 저장
          </button>
        </Card>
        <Card>
          <h2 className="mb-2 font-bold">내가 만든 문제 ({mine?.length ?? 0})</h2>
          <ul className="space-y-2">
            {mine?.map((q) => (
              <li key={q.id} className="flex items-start justify-between gap-2 rounded border-2 border-ink/15 p-2 text-sm">
                <div>
                  <span className="chip mr-1 bg-lavender-soft">{QUESTION_TYPE_LABEL[q.type]}</span>
                  {q.prompt.slice(0, 80)}
                </div>
                <button className="btn-ghost btn-sm" onClick={() => db.questions.delete(q.id)}>
                  삭제
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
