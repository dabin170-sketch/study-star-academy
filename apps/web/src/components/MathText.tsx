/**
 * $수식$ 구간만 KaTeX로 렌더링하고 나머지는 일반 텍스트로 표시한다(HTML 삽입 없음 → XSS 방지).
 */
import katex from 'katex';
import { Fragment, useMemo } from 'react';

export function MathText({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => {
    const out: { math: boolean; s: string }[] = [];
    const re = /\$([^$\n]{1,200})\$/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push({ math: false, s: text.slice(last, m.index) });
      out.push({ math: true, s: m[1] });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ math: false, s: text.slice(last) });
    return out;
  }, [text]);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.math ? (
          // katex는 입력을 이스케이프하며 trust:false가 기본값이다.
          <span key={i} dangerouslySetInnerHTML={{ __html: katex.renderToString(p.s, { throwOnError: false, trust: false }) }} />
        ) : (
          <Fragment key={i}>{p.s}</Fragment>
        ),
      )}
    </span>
  );
}
