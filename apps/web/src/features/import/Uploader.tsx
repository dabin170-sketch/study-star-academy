import { useRef, useState, type DragEvent } from 'react';
import { ACCEPT_ATTR, ImportError, parseFile, saveParsedDocument } from './importDocument';
import { explainStorageError, requestPersistence } from '../../storage/db';
import { ErrorBox } from '../../components/ui';

export function Uploader({ subjectId, onDone }: { subjectId: string; onDone: (docId: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handle = async (file: File | undefined) => {
    if (!file || busy) return;
    setError(null);
    setBusy(`‘${file.name}’ 확인 중…`);
    try {
      const { parsed, type } = await parseFile(file, setBusy);
      setBusy('개념과 원문 근거를 연결하는 중…');
      await requestPersistence();
      const docId = await saveParsedDocument({ subjectId, parsed, fileName: file.name, fileType: type, fileSize: file.size, blob: type === 'pdf' ? file : undefined });
      setBusy(null);
      onDone(docId);
    } catch (e) {
      setBusy(null);
      if (e instanceof ImportError) setError(e.message);
      else if ((e as { name?: string })?.name?.includes('Quota') || (e as { name?: string })?.name === 'DatabaseClosedError') setError(explainStorageError(e));
      else setError(`파일을 읽는 중 문제가 생겼습니다: ${(e as Error)?.message ?? e}. 파일이 열리는지 확인하고, PDF라면 다른 이름으로 저장(인쇄 → PDF로 저장)한 뒤 다시 올려 보세요.`);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    handle(e.dataTransfer.files?.[0]);
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-2 rounded-2xl border-[3px] border-dashed p-6 text-center transition ${drag ? 'border-lavender-deep bg-lavender-soft' : 'border-ink/40 bg-white'}`}
      >
        <p className="font-pixel text-base font-bold">{busy ?? '여기에 파일을 끌어다 놓으세요'}</p>
        <p className="text-xs text-ink-soft">PDF · PPTX · DOCX · TXT · Markdown (파일은 이 기기 안에서만 처리되며 서버로 보내지 않아요)</p>
        <button className="btn-primary mt-1" onClick={() => input.current?.click()} disabled={!!busy}>
          {busy ? '처리 중…' : '파일 선택'}
        </button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT_ATTR}
          className="hidden"
          data-testid="file-input"
          onChange={(e) => {
            handle(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {error && <ErrorBox title="자료를 올리지 못했어요">{error}</ErrorBox>}
    </div>
  );
}
