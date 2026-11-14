export type ParsedChunkKind = 'heading' | 'paragraph' | 'list' | 'table';

export interface ParsedChunk {
  pageNumber: number;
  index: number;
  kind: ParsedChunkKind;
  headingLevel?: number;
  text: string;
  headingPath: string[];
}

export interface ParsedPage {
  pageNumber: number;
  text: string;
  lowText: boolean;
}

export interface ParsedOutlineItem {
  level: number;
  title: string;
  pageNumber: number;
  chunkIndex: number;
}

export interface ParsedDocument {
  title: string;
  pageLabel: '쪽' | '슬라이드' | '구간';
  pages: ParsedPage[];
  chunks: ParsedChunk[];
  outline: ParsedOutlineItem[];
  warnings: string[];
}

/** PDF.js getTextContent() 항목을 단순화한 형태 */
export interface PositionedText {
  str: string;
  x: number;
  /** PDF 좌표계(아래가 0) 기준 기준선 y */
  y: number;
  width: number;
  fontSize: number;
}

export interface TextLine {
  text: string;
  x: number;
  xEnd: number;
  y: number;
  fontSize: number;
  /** 표 행으로 판단된 경우 셀 목록 */
  cells?: string[];
}

/** 블록 빌더 입력: 줄 단위 텍스트 + (가능하면) 글자 크기 */
export interface PageLines {
  pageNumber: number;
  lines: TextLine[];
  /** 원래 형식이 구조를 직접 알려줄 때(예: PPTX 제목, DOCX 제목 스타일) */
  hints?: Map<number, { heading?: number; list?: boolean; table?: boolean }>;
}
