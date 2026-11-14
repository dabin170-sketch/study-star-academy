// PDF.js의 문자 지도(CMap)와 표준 글꼴을 apps/web/public/pdfjs 로 복사한다.
// 한글 PDF 중 글꼴을 내장하지 않은 파일(Adobe-Korea1 등)의 글자를 읽으려면 CMap이 필요하다.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pdfjsDir = dirname(require.resolve('pdfjs-dist/package.json'));
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'apps', 'web', 'public', 'pdfjs');
mkdirSync(out, { recursive: true });
for (const dir of ['cmaps', 'standard_fonts']) {
  const src = join(pdfjsDir, dir);
  if (existsSync(src)) cpSync(src, join(out, dir), { recursive: true });
}
console.log('PDF.js 자산 복사 완료 →', out);
