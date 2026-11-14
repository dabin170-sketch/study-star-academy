/**
 * 학습자료 가져오기 파이프라인
 *  파일 → (브라우저에서) 텍스트·구조 추출 → 문단 저장 → 근거 기반 개념 추출 → 카드·문항 생성
 * 원본 파일과 추출 결과는 이 기기의 IndexedDB에만 저장된다.
 */
import {
  parseDocx,
  parseMarkdown,
  parsePdfPages,
  parsePlainText,
  parsePptx,
  type ParsedDocument,
} from '@academy/document-parser';
import {
  FSRS_VERSION,
  extractConcepts,
  generateFlashcards,
  generateQuestionsFor,
  newSchedulingState,
  type ConceptForGen,
} from '@academy/learning-engine';
import type {
  Concept,
  ConceptEvidence,
  DocumentChunk,
  DocumentFileType,
  DocumentPage,
  Flashcard,
  Question,
  StudyDocument,
} from '@academy/shared';
import { db, entity, touch } from '../../storage/db';

const MB = 1024 * 1024;
export const FILE_LIMITS: Record<Exclude<DocumentFileType, 'sample'>, number> = {
  pdf: 60 * MB,
  pptx: 40 * MB,
  docx: 20 * MB,
  txt: 5 * MB,
  md: 5 * MB,
};
export const ACCEPT_ATTR = '.pdf,.pptx,.docx,.txt,.md,.markdown,application/pdf,text/plain,text/markdown';

export class ImportError extends Error {}

export async function detectFileType(file: File): Promise<Exclude<DocumentFileType, 'sample'>> {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46; // %PDF
  const isZip = head[0] === 0x50 && head[1] === 0x4b; // PK
  if (ext === 'pdf') {
    if (!isPdf) throw new ImportError('확장자는 PDF지만 내용이 PDF 형식이 아닙니다. 파일이 손상되지 않았는지 확인해 주세요.');
    return 'pdf';
  }
  if (ext === 'pptx' || ext === 'docx') {
    if (!isZip) throw new ImportError(`확장자는 ${ext.toUpperCase()}지만 내용이 올바르지 않습니다. 오래된 .ppt/.doc 파일이라면 PowerPoint·Word에서 .pptx/.docx로 다시 저장해 주세요.`);
    return ext;
  }
  if (ext === 'txt') return 'txt';
  if (ext === 'md' || ext === 'markdown') return 'md';
  if (ext === 'ppt' || ext === 'doc' || ext === 'hwp' || ext === 'hwpx')
    throw new ImportError(`.${ext} 형식은 아직 지원하지 않습니다. PDF로 저장하거나(.hwp는 한글에서 'PDF로 저장'), .pptx/.docx로 변환해 주세요.`);
  throw new ImportError('지원하는 형식은 PDF, PPTX, DOCX, TXT, Markdown입니다.');
}

async function unzipText(file: File, filter: (path: string) => boolean): Promise<Record<string, string>> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const out: Record<string, string> = {};
  const entries = Object.values(zip.files).filter((f) => !f.dir && filter(f.name));
  for (const f of entries) out[f.name] = await f.async('string');
  return out;
}

export async function parseFile(file: File, onProgress?: (msg: string) => void): Promise<{ parsed: ParsedDocument; type: Exclude<DocumentFileType, 'sample'> }> {
  const type = await detectFileType(file);
  if (file.size > FILE_LIMITS[type]) throw new ImportError(`${type.toUpperCase()} 파일은 ${FILE_LIMITS[type] / MB}MB까지 올릴 수 있습니다. 자료를 나누어 올려 주세요.`);
  if (file.size === 0) throw new ImportError('빈 파일입니다.');
  const baseTitle = file.name.replace(/\.[^.]+$/, '');
  switch (type) {
    case 'pdf': {
      const { extractPdf } = await import('./pdf');
      onProgress?.('PDF를 읽는 중…');
      try {
        const { pages, title } = await extractPdf(await file.arrayBuffer(), (d, t) => onProgress?.(`PDF 글자 추출 중… ${d}/${t}쪽`));
        return { parsed: parsePdfPages(pages, title ?? baseTitle), type };
      } catch (e) {
        const name = (e as Error)?.name;
        if (name === 'PasswordException') throw new ImportError('암호가 걸린 PDF입니다. 암호를 해제한 뒤 다시 올려 주세요.');
        if (name === 'InvalidPDFException') throw new ImportError('PDF 파일이 손상되어 읽을 수 없습니다.');
        throw e;
      }
    }
    case 'pptx': {
      onProgress?.('슬라이드를 읽는 중…');
      const files = await unzipText(file, (p) => /^ppt\/(slides\/|notesSlides\/|presentation\.xml|_rels\/presentation\.xml\.rels)/.test(p));
      return { parsed: parsePptx(files, baseTitle), type };
    }
    case 'docx': {
      onProgress?.('문서를 읽는 중…');
      const files = await unzipText(file, (p) => p === 'word/document.xml' || p === 'word/styles.xml');
      return { parsed: parseDocx(files, baseTitle), type };
    }
    case 'md':
      return { parsed: parseMarkdown(await file.text(), baseTitle), type };
    default:
      return { parsed: parsePlainText(await file.text(), baseTitle), type };
  }
}

export interface SaveInput {
  subjectId: string;
  parsed: ParsedDocument;
  fileName: string;
  fileType: DocumentFileType;
  fileSize: number;
  blob?: Blob;
}

/** 추출 결과를 저장하고 개념·카드·문항을 만든다. 문서 ID를 돌려준다. */
export async function saveParsedDocument(input: SaveInput): Promise<string> {
  const now = Date.now();
  const { parsed } = input;
  const doc: StudyDocument = entity({
    subjectId: input.subjectId,
    title: parsed.title,
    fileName: input.fileName,
    fileType: input.fileType,
    fileSize: input.fileSize,
    pageCount: parsed.pages.length,
    status: 'ready' as const,
    warnings: parsed.warnings,
    outline: [],
    hasOriginal: !!input.blob,
    inExamScope: true,
  });
  const pages: DocumentPage[] = parsed.pages.map((p) => entity({ documentId: doc.id, pageNumber: p.pageNumber, text: p.text, lowText: p.lowText }, now));
  const chunks: DocumentChunk[] = parsed.chunks.map((c) =>
    entity({ documentId: doc.id, pageNumber: c.pageNumber, index: c.index, kind: c.kind, headingLevel: c.headingLevel, text: c.text, headingPath: c.headingPath }, now),
  );
  const chunkByIndex = new Map(chunks.map((c) => [c.index, c]));
  doc.outline = parsed.outline.map((o) => ({ level: o.level, title: o.title, pageNumber: o.pageNumber, chunkId: chunkByIndex.get(o.chunkIndex)?.id ?? '' }));

  const lowPages = new Set(parsed.pages.filter((p) => p.lowText).map((p) => p.pageNumber));
  const drafts = extractConcepts(parsed.chunks.map((c) => ({ ...c, lowText: lowPages.has(c.pageNumber) })));
  const concepts: Concept[] = [];
  const evidence: ConceptEvidence[] = [];
  for (const d of drafts) {
    const c: Concept = entity(
      {
        subjectId: input.subjectId,
        documentId: doc.id,
        term: d.term,
        aliases: d.aliases,
        kind: d.kind,
        statement: d.statement,
        userEdited: false,
        userNote: '',
        status: d.status,
        importance: d.importance,
        section: d.section,
        pageNumber: d.pageNumber,
        confidence: d.confidence,
      },
      now,
    );
    concepts.push(c);
    for (const e of d.evidence) {
      const ch = chunkByIndex.get(e.chunkIndex)!;
      evidence.push(entity({ conceptId: c.id, documentId: doc.id, chunkId: ch.id, pageNumber: e.pageNumber, quote: e.quote, start: e.start }, now));
    }
  }

  await db.transaction('rw', [db.documents, db.pages, db.chunks, db.concepts, db.evidence, db.blobs], async () => {
    await db.documents.add(doc);
    await db.pages.bulkAdd(pages);
    await db.chunks.bulkAdd(chunks);
    await db.concepts.bulkAdd(concepts);
    await db.evidence.bulkAdd(evidence);
    if (input.blob) await db.blobs.put({ id: doc.id, blob: input.blob });
  });
  await regenerateDocument(doc.id);
  return doc.id;
}

async function conceptsForGen(subjectId: string): Promise<ConceptForGen[]> {
  const concepts = await db.concepts.where('subjectId').equals(subjectId).toArray();
  const ev = await db.evidence.where('conceptId').anyOf(concepts.map((c) => c.id)).toArray();
  const first = new Map<string, ConceptEvidence>();
  for (const e of ev) if (!first.has(e.conceptId)) first.set(e.conceptId, e);
  return concepts.map((c) => {
    const e = first.get(c.id);
    return {
      id: c.id,
      term: c.term,
      aliases: c.aliases,
      kind: c.kind,
      statement: c.statement,
      status: c.status,
      evidence: e ? { chunkId: e.chunkId, pageNumber: e.pageNumber, quote: e.quote, documentId: e.documentId } : undefined,
    };
  });
}

/**
 * 개념 하나의 자동 생성 카드·문항을 다시 만든다.
 * - 사용자가 직접 만든 문항(origin=user)은 건드리지 않는다.
 * - 플래시카드는 같은 종류가 있으면 내용만 바꾸고 복습 일정(sched)은 유지한다.
 */
export async function regenerateConcept(conceptId: string, poolCache?: ConceptForGen[]) {
  const concept = await db.concepts.get(conceptId);
  if (!concept) return;
  const pool = poolCache ?? (await conceptsForGen(concept.subjectId));
  const me = pool.find((p) => p.id === conceptId) ?? (await conceptsForGen(concept.subjectId)).find((p) => p.id === conceptId)!;
  const now = Date.now();
  const drafts = generateQuestionsFor({ ...me, status: concept.status, statement: concept.statement, term: concept.term, aliases: concept.aliases }, pool);
  const cards = generateFlashcards([{ ...me, status: concept.status, statement: concept.statement, term: concept.term, aliases: concept.aliases }]);

  await db.transaction('rw', [db.questions, db.flashcards], async () => {
    const oldQ = await db.questions.where('conceptId').equals(conceptId).filter((q) => q.origin === 'generated').toArray();
    await db.questions.bulkDelete(oldQ.map((q) => q.id));
    const qs: Question[] = drafts.map((d) =>
      entity(
        {
          subjectId: concept.subjectId,
          documentId: concept.documentId,
          conceptId,
          type: d.type,
          prompt: d.prompt,
          choices: d.choices,
          answer: d.answer,
          acceptedAnswers: d.acceptedAnswers,
          explanation: d.explanation,
          points: d.points,
          origin: 'generated' as const,
          generator: d.generator,
          evidence: me.evidence,
          rubric: d.rubric,
        },
        now,
      ),
    );
    await db.questions.bulkAdd(qs);

    const oldCards = await db.flashcards.where('conceptId').equals(conceptId).toArray();
    const keep = new Set<string>();
    for (const c of cards) {
      const existing = oldCards.find((o) => o.type === c.type);
      if (existing) {
        keep.add(existing.id);
        await db.flashcards.put(touch(existing, { front: c.front, back: c.back, suspended: false }, now));
      } else {
        const fc: Flashcard = entity(
          { subjectId: concept.subjectId, documentId: concept.documentId, conceptId, type: c.type, front: c.front, back: c.back, sched: newSchedulingState(now), algorithm: FSRS_VERSION, suspended: false },
          now,
        );
        await db.flashcards.add(fc);
      }
    }
    // 더 이상 생성되지 않는 카드(예: 제외된 개념)는 기록 보존을 위해 지우지 않고 보류 처리
    for (const o of oldCards) if (!keep.has(o.id)) await db.flashcards.put(touch(o, { suspended: true }, now));
  });
}

export async function regenerateDocument(documentId: string) {
  const doc = await db.documents.get(documentId);
  if (!doc) return;
  const pool = await conceptsForGen(doc.subjectId);
  for (const c of pool) {
    const row = await db.concepts.get(c.id);
    if (row?.documentId === documentId) await regenerateConcept(c.id, pool);
  }
}

/**
 * 자료 삭제 정책
 *  - 삭제: 원본 파일, 페이지, 문단, 개념, 근거, 자동 생성 카드·문항, 해당 문항의 오답 노트
 *  - 보존: 정답 기록·복습 기록·공부 시간(통계와 성장 기록용), 사용자가 직접 만든 문항(출처 연결만 해제)
 */
export async function deleteDocument(documentId: string) {
  await db.transaction('rw', [db.documents, db.pages, db.chunks, db.concepts, db.evidence, db.blobs, db.flashcards, db.questions, db.mistakes, db.blankReviews], async () => {
    const generated = await db.questions.where('documentId').equals(documentId).toArray();
    const genIds = generated.filter((q) => q.origin === 'generated').map((q) => q.id);
    for (const q of generated.filter((x) => x.origin === 'user')) await db.questions.put(touch(q, { documentId: undefined, evidence: undefined }));
    await db.questions.bulkDelete(genIds);
    await db.mistakes.where('questionId').anyOf(genIds).delete();
    await db.flashcards.where('documentId').equals(documentId).delete();
    await db.evidence.where('documentId').equals(documentId).delete();
    await db.concepts.where('documentId').equals(documentId).delete();
    await db.chunks.where('documentId').equals(documentId).delete();
    await db.pages.where('documentId').equals(documentId).delete();
    await db.blobs.delete(documentId);
    await db.documents.delete(documentId);
  });
}

/** 사용자가 개념을 수정·확인·제외하면 상태를 저장하고 관련 카드·문항을 갱신한다. */
export async function updateConcept(conceptId: string, patch: Partial<Pick<Concept, 'term' | 'statement' | 'status' | 'userNote' | 'aliases' | 'importance' | 'kind'>>) {
  const c = await db.concepts.get(conceptId);
  if (!c) return;
  const edited = (patch.statement !== undefined && patch.statement !== c.statement) || (patch.term !== undefined && patch.term !== c.term);
  await db.concepts.put(touch(c, { ...patch, userEdited: c.userEdited || edited }));
  await regenerateConcept(conceptId);
}

/** 사용자가 원문을 보고 직접 개념을 추가(근거 문단 선택) */
export async function addManualConcept(input: { documentId: string; chunkId: string; term: string; statement: string; start?: number }) {
  const doc = await db.documents.get(input.documentId);
  const chunk = await db.chunks.get(input.chunkId);
  if (!doc || !chunk) return null;
  const now = Date.now();
  const inChunk = chunk.text.indexOf(input.statement);
  const c: Concept = entity(
    {
      subjectId: doc.subjectId,
      documentId: doc.id,
      term: input.term.trim(),
      aliases: [],
      kind: 'definition' as const,
      statement: input.statement.trim(),
      userEdited: inChunk < 0,
      userNote: '',
      status: 'verified' as const,
      importance: 2 as const,
      section: chunk.headingPath[chunk.headingPath.length - 1] ?? '',
      pageNumber: chunk.pageNumber,
      confidence: 1,
    },
    now,
  );
  await db.concepts.add(c);
  await db.evidence.add(
    entity({ conceptId: c.id, documentId: doc.id, chunkId: chunk.id, pageNumber: chunk.pageNumber, quote: inChunk >= 0 ? input.statement : chunk.text, start: inChunk >= 0 ? inChunk : 0 }, now),
  );
  await regenerateConcept(c.id);
  return c.id;
}
