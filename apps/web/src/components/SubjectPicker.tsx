import { useCurrentSubject } from '../hooks/data';

export function SubjectPicker({ label = '과목' }: { label?: string }) {
  const { subject, subjects, setSubject } = useCurrentSubject();
  if (!subjects || subjects.length === 0) return null;
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="font-bold">{label}</span>
      <select className="input w-auto py-1" value={subject?.id ?? ''} onChange={(e) => setSubject(e.target.value)}>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
