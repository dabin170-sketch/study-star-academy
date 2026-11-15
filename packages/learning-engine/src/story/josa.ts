/** 한국어 조사 고르기: 받침 유무에 따라 은/는, 이/가, 을/를, 와/과, (으)로, 이라/라 */
const lastHangul = (word: string) => {
  const clean = word.replace(/[\s'"’”)\]」』]+$/g, '');
  const ch = clean[clean.length - 1] ?? '';
  const code = ch.charCodeAt(0) - 0xac00;
  if (code >= 0 && code < 11172) return { batchim: code % 28 !== 0, rieul: code % 28 === 8 };
  // 영문·숫자: 대략적인 발음 규칙(L, M, N, R 등으로 끝나면 받침)
  if (/[lmnr]$/i.test(clean) || /[136780]$/.test(clean)) return { batchim: true, rieul: /l$/i.test(clean) || /[178]$/.test(clean) };
  return { batchim: false, rieul: false };
};

export function josa(word: string, pair: '은/는' | '이/가' | '을/를' | '와/과' | '으로/로' | '이라/라' | '이에요/예요' | '아/야' | '이랑/랑' | '이고/고'): string {
  const { batchim, rieul } = lastHangul(word);
  switch (pair) {
    case '은/는':
      return word + (batchim ? '은' : '는');
    case '이/가':
      return word + (batchim ? '이' : '가');
    case '을/를':
      return word + (batchim ? '을' : '를');
    case '와/과':
      return word + (batchim ? '과' : '와');
    case '으로/로':
      return word + (batchim && !rieul ? '으로' : '로');
    case '이라/라':
      return word + (batchim ? '이라' : '라');
    case '이에요/예요':
      return word + (batchim ? '이에요' : '예요');
    case '아/야':
      return word + (batchim ? '아' : '야');
    case '이랑/랑':
      return word + (batchim ? '이랑' : '랑');
    case '이고/고':
      return word + (batchim ? '이고' : '고');
  }
}

/** ‘낱말’ + 조사 (따옴표 뒤에 받침 규칙에 맞는 조사를 붙임) */
export function quoted(word: string, pair?: Parameters<typeof josa>[1]): string {
  if (!pair) return `‘${word}’`;
  const withJosa = josa(word, pair);
  return `‘${word}’${withJosa.slice(word.length)}`;
}
