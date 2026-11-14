import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { StudySubject, UserProfile } from '@academy/shared';
import { db } from '../storage/db';
import { DEFAULT_SETTINGS, PROFILE_ID } from '../learning/profile';
import { useUI } from '../stores/ui';

export function useProfile(): UserProfile | undefined {
  return useLiveQuery(async () => {
    const p = await db.profile.get(PROFILE_ID);
    return p ? { ...p, settings: { ...DEFAULT_SETTINGS, ...p.settings } } : undefined;
  }, []);
}

export function useSubjects(): StudySubject[] | undefined {
  return useLiveQuery(() => db.subjects.orderBy('updatedAt').toArray(), []);
}

/** 현재 선택한 과목(없으면 첫 과목) */
export function useCurrentSubject(): { subject: StudySubject | undefined; subjects: StudySubject[] | undefined; setSubject: (id: string) => void } {
  const subjects = useSubjects();
  const subjectId = useUI((s) => s.subjectId);
  const setSubject = useUI((s) => s.setSubject);
  const subject = subjects?.find((s) => s.id === subjectId) ?? subjects?.[0];
  return { subject, subjects, setSubject };
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** 1초마다 갱신되는 현재 시각(타이머 표시용) */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
