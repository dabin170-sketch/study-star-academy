import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function PageHeader({ title, subtitle, icon, actions }: { title: string; subtitle?: string; icon?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon && <div className="shrink-0">{icon}</div>}
        <div>
          <h1 className="text-2xl font-bold text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = '', as: As = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' }) {
  return <As className={`card p-4 ${className}`}>{children}</As>;
}

export function EmptyState({ title, desc, action, icon }: { title: string; desc?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 bg-white/80 px-6 py-10 text-center">
      {icon}
      <h2 className="text-lg font-bold">{title}</h2>
      {desc && <div className="max-w-md text-sm text-ink-soft">{desc}</div>}
      {action}
    </div>
  );
}

export function ErrorBox({ title = '문제가 생겼어요', children }: { title?: string; children: ReactNode }) {
  return (
    <div role="alert" className="rounded-xl border-2 border-pink-deep bg-pink-soft p-4 text-sm">
      <p className="font-pixel font-bold text-ink">{title}</p>
      <div className="mt-1 text-ink-soft">{children}</div>
    </div>
  );
}

export function InfoBox({ children, tone = 'lavender' }: { children: ReactNode; tone?: 'lavender' | 'butter' | 'mint' | 'milk' }) {
  const cls = { lavender: 'bg-lavender-soft border-lavender-deep/50', butter: 'bg-butter-soft border-butter-deep/60', mint: 'bg-mint-soft border-mint-deep/50', milk: 'bg-milk-soft border-milk-deep/50' }[tone];
  return <div className={`rounded-xl border-2 p-3 text-sm text-ink ${cls}`}>{children}</div>;
}

export function Progress({ value, max = 1, color = 'bg-lavender-deep', label }: { value: number; max?: number; color?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div className="h-3 w-full overflow-hidden rounded-full border-2 border-ink/60 bg-white" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string }[] }) {
  return (
    <div role="tablist" className="mb-4 flex flex-wrap gap-2">
      {items.map((it) => (
        <button key={it.value} role="tab" aria-selected={value === it.value} onClick={() => onChange(it.value)} className={`btn btn-sm ${value === it.value ? 'bg-lavender' : 'bg-white'}`}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

export type FeatureStatus = 'ready' | 'partial' | 'planned';
export const FEATURE_STATUS_LABEL: Record<FeatureStatus, string> = { ready: '사용 가능', partial: '일부 지원', planned: '개발 예정' };

export function StatusChip({ status }: { status: FeatureStatus }) {
  const cls = { ready: 'bg-mint', partial: 'bg-butter', planned: 'bg-ink-faint/40' }[status];
  return <span className={`chip ${cls}`}>{FEATURE_STATUS_LABEL[status]}</span>;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-2 sm:items-center" onClick={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card max-h-[90vh] w-full overflow-y-auto p-5 ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function LinkButton({ to, children, tone = 'primary', small }: { to: string; children: ReactNode; tone?: 'primary' | 'pink' | 'mint' | 'ghost'; small?: boolean }) {
  return (
    <Link to={to} className={`btn-${tone} ${small ? 'btn-sm' : ''}`}>
      {children}
    </Link>
  );
}

export function Loading({ text = '불러오는 중…' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-8 text-sm text-ink-soft" role="status">
      <span className="anim-twinkle font-pixel text-lg">★</span> {text}
    </div>
  );
}

export function formatDuration(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}분`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}

export function formatDate(t: number): string {
  return new Date(t).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

export function formatDateTime(t: number): string {
  return new Date(t).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
