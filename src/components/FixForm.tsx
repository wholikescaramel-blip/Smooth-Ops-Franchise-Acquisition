import { useState } from 'react';
import { CITIES } from '../data/cityGeo';
import type { AppPatch, Application, FixField, Missing } from '../engine';
import { applyFix } from '../state/store';
import { btnPrimary, field } from './ui';

const LABEL: Record<FixField, string> = {
  name: 'Applicant name',
  city: 'City',
  pin: 'Pin code (6 digits)',
  investment: 'Investment capacity (₹ lakh)',
  experience: 'Retail experience (years)',
  space: 'Space',
  size: 'Space size (sq ft)',
  floor: 'Floor',
  launchMonths: 'Target launch (months)',
  language: 'Preferred language',
};
const ORDER: FixField[] = ['city', 'pin', 'investment', 'experience', 'space', 'size', 'floor', 'launchMonths', 'language', 'name'];
const OPTIONS: Partial<Record<FixField, string[]>> = {
  city: CITIES.map((c) => c.name),
  space: ['Owned', 'Rented', 'Not yet identified'],
  floor: ['Ground', 'Upper', 'Mall unit', 'Not known'],
  language: ['Kannada', 'English', 'Hindi'],
};
const NUMERIC: FixField[] = ['investment', 'experience', 'size', 'launchMonths'];

function current(a: Application, f: FixField, suggest?: string | number): string {
  const v = a[f as keyof Application] as string | number | null | undefined;
  if (v !== null && v !== undefined && v !== '') return String(v);
  if (f === 'pin' && a.pinRaw) return a.pinRaw;
  return suggest !== undefined ? String(suggest) : '';
}

/**
 * Manual entry. `missing` fields are the ones the engine refused to guess; they are listed first and marked.
 * With `all`, every field can be corrected, not only the missing ones.
 */
export function FixForm({ app, missing, all }: { app: Application; missing: Missing[]; all?: boolean }) {
  const need = new Map(missing.map((m) => [m.field, m]));
  const fields = ORDER.filter((f) => all || need.has(f));
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f, current(app, f, need.get(f)?.suggest)])));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const set = (f: string, v: string) => setVals((s) => ({ ...s, [f]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const patch: Record<string, unknown> = {};
    const bad: Record<string, string> = {};
    for (const f of fields) {
      const raw = (vals[f] ?? '').trim();
      const was = current(app, f);
      const required = need.has(f);
      if (raw === '') {
        if (required) bad[f] = 'This is needed.';
        continue;
      }
      if (f === 'pin' && !/^\d{6}$/.test(raw)) bad[f] = 'Enter exactly 6 digits.';
      else if (NUMERIC.includes(f)) {
        const n = Number(raw.replace(/,/g, ''));
        if (!Number.isFinite(n) || n < 0) bad[f] = 'Enter a number, 0 or more.';
        else if ((f === 'investment' || f === 'size') && n === 0) bad[f] = 'Enter more than 0, or leave it for the applicant to confirm.';
        else if (raw !== was || required) patch[f] = n;
      } else if (raw !== was || required) patch[f] = raw;
    }
    setErrs(bad);
    if (Object.keys(bad).length || !Object.keys(patch).length) return;
    applyFix(app.id, patch as AppPatch);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      {fields.map((f) => {
        const m = need.get(f);
        const opts = OPTIONS[f];
        const id = `fix-${app.id}-${f}`;
        return (
          <div key={f}>
            <label htmlFor={id} className="mb-1 block text-sm font-semibold">
              {LABEL[f]}
              {m && <span className="ml-2 rounded-full bg-tint px-2 py-0.5 text-xs font-semibold text-brand">needed</span>}
            </label>
            {opts ? (
              <select id={id} value={vals[f] ?? ''} onChange={(e) => set(f, e.target.value)} className={field + ' w-full'} aria-invalid={!!errs[f]}>
                <option value="">Choose…</option>
                {opts.map((o) => <option key={o}>{o}</option>)}
              </select>
            ) : (
              <input id={id} value={vals[f] ?? ''} onChange={(e) => set(f, e.target.value)} inputMode={f === 'pin' || NUMERIC.includes(f) ? 'decimal' : 'text'} className={field + ' w-full'} aria-invalid={!!errs[f]} aria-describedby={`${id}-why`} />
            )}
            {errs[f] && <p role="alert" className="mt-1 text-sm font-semibold text-o-decline">{errs[f]}</p>}
            {m && <p id={`${id}-why`} className="mt-1 text-sm text-mute">{m.why}</p>}
          </div>
        );
      })}
      <button className={btnPrimary}>Save and check again</button>
    </form>
  );
}
