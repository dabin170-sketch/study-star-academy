import type { UserProfile, UserSettings } from '@academy/shared';
import { DEFAULT_WEIGHTS } from '@academy/learning-engine';
import { db, entity, touch } from '../storage/db';

export const PROFILE_ID = 'me';

export const DEFAULT_SETTINGS: UserSettings = {
  fontScale: 1,
  reduceMotion: false,
  sound: true,
  timeLimitMultiplier: 1,
  recommendWeights: DEFAULT_WEIGHTS,
  desiredRetention: 0.9,
  viewMode: 'map',
};

export async function ensureProfile(): Promise<UserProfile> {
  const existing = await db.profile.get(PROFILE_ID);
  if (existing) return { ...existing, settings: { ...DEFAULT_SETTINGS, ...existing.settings } };
  const p: UserProfile = { ...entity({ nickname: '', characterId: 'byeol' as const, goal: '', onboarded: false, settings: DEFAULT_SETTINGS }), id: PROFILE_ID };
  await db.profile.put(p);
  return p;
}

export async function updateProfile(patch: Partial<Omit<UserProfile, 'settings'>> & { settings?: Partial<UserSettings> }) {
  const p = await ensureProfile();
  const next = touch(p, { ...patch, settings: { ...p.settings, ...(patch.settings ?? {}) } } as Partial<UserProfile>);
  await db.profile.put(next);
  return next;
}
