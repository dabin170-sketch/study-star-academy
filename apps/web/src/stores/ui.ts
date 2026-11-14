import { create } from 'zustand';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'error';
}

interface UIState {
  toasts: Toast[];
  subjectId: string | null;
  toast: (text: string, tone?: Toast['tone']) => void;
  dismiss: (id: number) => void;
  setSubject: (id: string | null) => void;
}

let seq = 0;

export const useUI = create<UIState>((set) => ({
  toasts: [],
  subjectId: null,
  toast: (text, tone = 'info') => {
    const id = ++seq;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), tone === 'error' ? 8000 : 4000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setSubject: (subjectId) => set({ subjectId }),
}));

export const toast = (text: string, tone?: Toast['tone']) => useUI.getState().toast(text, tone);
