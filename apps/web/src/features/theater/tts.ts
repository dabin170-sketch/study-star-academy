/**
 * 브라우저 내장 음성(SpeechSynthesis). 한국어 음성이 없거나 기능이 없으면 자막 모드로 자동 전환한다.
 * 외부 음성 API는 쓰지 않는다.
 */
import { useEffect, useState } from 'react';

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
}

export function useKoreanVoices(): { voices: SpeechSynthesisVoice[]; ready: boolean } {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!speechSupported()) {
      setReady(true);
      return;
    }
    const load = () => {
      const all = window.speechSynthesis.getVoices();
      setVoices(all.filter((v) => /^ko(-|_|$)/i.test(v.lang)));
      if (all.length) setReady(true);
    };
    load();
    window.speechSynthesis.addEventListener?.('voiceschanged', load);
    const t = setTimeout(() => setReady(true), 1500); // 목록이 안 오는 브라우저
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', load);
      clearTimeout(t);
    };
  }, []);
  return { voices, ready };
}

export function speak(text: string, voice: SpeechSynthesisVoice | undefined, opts: { rate: number; pitch: number }, onEnd: () => void): () => void {
  if (!speechSupported() || !voice) {
    onEnd();
    return () => {};
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = opts.rate;
  u.pitch = opts.pitch;
  let done = false;
  const finish = () => {
    if (!done) {
      done = true;
      onEnd();
    }
  };
  u.onend = finish;
  u.onerror = finish;
  window.speechSynthesis.speak(u);
  return () => {
    done = true;
    window.speechSynthesis.cancel();
  };
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel();
}
