import { describe, expect, it } from 'vitest';
import { layoutPage } from './pdf-layout';
import { parseDocx, parseMarkdown, parsePdfPages, parsePlainText, parsePptx } from './formats';
import type { PositionedText } from './types';

const item = (str: string, x: number, y: number, fontSize = 10, width?: number): PositionedText => ({
  str,
  x,
  y,
  fontSize,
  width: width ?? str.length * fontSize * 0.9,
});

describe('PDF 두 단 레이아웃', () => {
  it('왼쪽 단과 오른쪽 단을 같은 줄로 섞지 않는다', () => {
    const items = [
      item('행동주의 학습 이론', 150, 800, 18, 200),
      item('왼쪽 첫째 줄입니다', 50, 700, 10, 200),
      item('오른쪽 첫째 줄입니다', 320, 700, 10, 200),
      item('왼쪽 둘째 줄입니다', 50, 686, 10, 200),
      item('오른쪽 둘째 줄입니다', 320, 686, 10, 200),
      item('왼쪽 셋째 줄입니다', 50, 672, 10, 200),
      item('오른쪽 셋째 줄입니다', 320, 672, 10, 200),
    ];
    const { lines, twoColumn } = layoutPage(items, 600);
    expect(twoColumn).toBe(true);
    expect(lines.map((l) => l.text)).toEqual([
      '행동주의 학습 이론',
      '왼쪽 첫째 줄입니다',
      '왼쪽 둘째 줄입니다',
      '왼쪽 셋째 줄입니다',
      '오른쪽 첫째 줄입니다',
      '오른쪽 둘째 줄입니다',
      '오른쪽 셋째 줄입니다',
    ]);
  });

  it('한 단 문서는 위에서 아래, 왼쪽에서 오른쪽으로 읽는다', () => {
    const items = [item('둘째', 300, 700), item('첫째', 50, 700, 10, 240), item('다음 줄', 50, 686)];
    const { lines, twoColumn } = layoutPage(items, 600);
    expect(twoColumn).toBe(false);
    expect(lines.map((l) => l.text)).toEqual(['첫째 둘째', '다음 줄']);
  });
});

describe('PDF 블록 구조', () => {
  const page = (n: number, extra: PositionedText[]) => ({
    pageNumber: n,
    width: 600,
    items: [...extra, item(String(n), 295, 30, 9, 10)],
  });

  it('큰 글씨와 번호 제목을 제목으로, 쪽번호를 제거하고, 표를 표로 인식한다', () => {
    const doc = parsePdfPages(
      [
        page(1, [
          item('제1장 응용행동분석', 50, 780, 20, 300),
          item('1. 강화의 개념', 50, 740, 14, 200),
          item('강화란 행동 뒤에 따르는 결과로 인해 그 행동의', 50, 710, 10, 480),
          item('발생 빈도가 증가하는 현상을 말한다.', 50, 696, 10, 300),
          item('유형', 50, 660, 10, 40),
          item('제시', 200, 660, 10, 40),
          item('제거', 350, 660, 10, 40),
        ]),
        page(2, [item('2. 벌의 개념', 50, 780, 14, 200), item('벌은 행동의 발생 빈도를 감소시키는 결과이다.', 50, 750, 10, 400)]),
        page(3, [item('정리', 50, 780, 14, 200), item('본문 내용이다.', 50, 750, 10, 200)]),
      ],
      '강의',
    );
    const headings = doc.chunks.filter((c) => c.kind === 'heading').map((c) => c.text);
    expect(headings).toContain('제1장 응용행동분석');
    expect(headings).toContain('1. 강화의 개념');
    const para = doc.chunks.find((c) => c.text.startsWith('강화란'))!;
    expect(para.text).toBe('강화란 행동 뒤에 따르는 결과로 인해 그 행동의 발생 빈도가 증가하는 현상을 말한다.');
    expect(para.headingPath).toEqual(['제1장 응용행동분석', '1. 강화의 개념']);
    expect(doc.chunks.some((c) => c.kind === 'table' && c.text === '유형 | 제시 | 제거')).toBe(true);
    expect(doc.pages[0].text).not.toMatch(/^1$/m);
    expect(doc.outline[0]).toMatchObject({ level: 1, title: '제1장 응용행동분석', pageNumber: 1 });
  });

  it('글자가 거의 없는 페이지가 많으면 스캔 경고를 남긴다', () => {
    const doc = parsePdfPages(
      [1, 2, 3].map((n) => ({ pageNumber: n, width: 600, items: [item('그림', 50, 700)] })),
      '스캔',
    );
    expect(doc.pages.every((p) => p.lowText)).toBe(true);
    expect(doc.warnings.join(' ')).toMatch(/스캔본/);
  });
});

describe('한글 줄바꿈', () => {
  it('단 끝까지 찬 줄에서 낱말 중간에 끊긴 한글은 띄어쓰기 없이 잇고, 짧게 끝난 줄은 띄어 쓴다', () => {
    const doc = parsePdfPages(
      [
        {
          pageNumber: 1,
          width: 600,
          items: [
            item('직접교수란 교사가 체계적으로 가르', 50, 700, 10, 500),
            item('치는 교수 방법을 말한다. 다음 문장은', 50, 686, 10, 500),
            item('짧게 끝난 줄', 50, 672, 10, 300),
            item('다음 낱말로 이어진다.', 50, 658, 10, 250),
          ],
        },
      ],
      't',
    );
    expect(doc.chunks[0].text).toBe('직접교수란 교사가 체계적으로 가르치는 교수 방법을 말한다. 다음 문장은 짧게 끝난 줄 다음 낱말로 이어진다.');
  });
});

describe('텍스트·마크다운', () => {
  it('빈 줄로 문단을 나눈다', () => {
    const doc = parsePlainText('첫 문단 첫 줄\n첫 문단 둘째 줄\n\n둘째 문단이다.', 'a');
    const paras = doc.chunks.filter((c) => c.kind === 'paragraph').map((c) => c.text);
    expect(paras).toEqual(['첫 문단 첫 줄 첫 문단 둘째 줄', '둘째 문단이다.']);
  });

  it('마크다운 제목·목록·표를 인식한다', () => {
    const doc = parseMarkdown('# 큰 제목\n\n## 작은 제목\n\n- 항목 **하나**\n- 항목 둘\n\n| 구분 | 내용 |\n|---|---|\n| A | B |', 'md');
    expect(doc.outline.map((o) => [o.level, o.title])).toEqual([
      [1, '큰 제목'],
      [2, '작은 제목'],
    ]);
    expect(doc.chunks.filter((c) => c.kind === 'list').map((c) => c.text)).toEqual(['• 항목 하나', '• 항목 둘']);
    expect(doc.chunks.find((c) => c.kind === 'table')!.text).toBe('구분 | 내용\nA | B');
  });
});

describe('PPTX', () => {
  it('프레젠테이션 순서대로 제목·본문·노트를 추출한다', () => {
    const slide = (title: string, body: string) =>
      `<p:sld><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${body}</a:t></a:r></a:p><a:p><a:pPr lvl="1"/><a:r><a:t>하위 &amp; 항목</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
    const files = {
      'ppt/presentation.xml': '<p:presentation><p:sldIdLst><p:sldId id="257" r:id="rId3"/><p:sldId id="256" r:id="rId2"/></p:sldIdLst></p:presentation>',
      'ppt/_rels/presentation.xml.rels':
        '<Relationships><Relationship Id="rId2" Target="slides/slide1.xml"/><Relationship Id="rId3" Target="slides/slide2.xml"/></Relationships>',
      'ppt/slides/slide1.xml': slide('둘째 슬라이드', '본문 B'),
      'ppt/slides/slide2.xml': slide('첫째 슬라이드', '본문 A'),
      'ppt/slides/_rels/slide2.xml.rels': '<Relationships><Relationship Target="../notesSlides/notesSlide1.xml"/></Relationships>',
      'ppt/notesSlides/notesSlide1.xml':
        '<p:notes><p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>노트 내용</a:t></a:r></a:p></p:txBody></p:sp></p:notes>',
    };
    const doc = parsePptx(files, 'ppt');
    expect(doc.pageLabel).toBe('슬라이드');
    expect(doc.outline.filter((o) => o.level === 2).map((o) => o.title)).toEqual(['첫째 슬라이드', '둘째 슬라이드']);
    expect(doc.pages[0].text).toContain('본문 A');
    expect(doc.pages[0].text).toContain('• 하위 & 항목');
    expect(doc.pages[0].text).toContain('노트 내용');
  });
});

describe('DOCX', () => {
  it('제목 스타일과 표, 목록을 인식한다', () => {
    const files = {
      'word/styles.xml': '<w:styles><w:style w:type="paragraph" w:styleId="1"><w:name w:val="heading 1"/></w:style></w:styles>',
      'word/document.xml':
        '<w:document><w:body><w:p><w:pPr><w:pStyle w:val="1"/></w:pPr><w:r><w:t>전환교육</w:t></w:r></w:p><w:p><w:r><w:t>전환교육은 학교에서 성인기로의 이동을 돕는 교육이다.</w:t></w:r></w:p><w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>직업 준비</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>구분</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>내용</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>',
    };
    const doc = parseDocx(files, 'docx');
    expect(doc.outline[0]).toMatchObject({ level: 1, title: '전환교육' });
    expect(doc.chunks.find((c) => c.kind === 'paragraph')!.text).toBe('전환교육은 학교에서 성인기로의 이동을 돕는 교육이다.');
    expect(doc.chunks.find((c) => c.kind === 'list')!.text).toBe('• 직업 준비');
    expect(doc.chunks.find((c) => c.kind === 'table')!.text).toBe('구분 | 내용');
  });
});
