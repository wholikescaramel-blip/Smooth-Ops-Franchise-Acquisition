import { useMemo, useState } from 'react';
import { counterfactuals, OUTCOMES, type Outcome } from '../engine';
import { select, setOverride, useStore } from '../state/store';
import { btnPrimary, btn, field, Icon, Mark, OUTCOME_COLOR, weekDate } from './ui';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-5">
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** Decision detail for one applicant. Opens from a pin, a card, the dropdown or a question. */
export function ApplicantPanel({ onClose }: { onClose: () => void }) {
  const selected = useStore((s) => s.selected);
  const ds = useStore((s) => s.ds);
  const result = useStore((s) => s.result);
  const overrides = useStore((s) => s.overrides);
  const [ov, setOv] = useState<Outcome>('Approved');
  const [why, setWhy] = useState('');
  const a = ds.applications.find((x) => x.id === selected);
  const d = a ? result.decisions[a.id] : null;
  const cfs = useMemo(() => (a && d && d.outcome !== 'Approved' ? counterfactuals(ds, overrides, a.id) : []), [ds, overrides, a?.id, d?.outcome]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <button onClick={onClose} aria-label="Close the decision" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-wash"><Icon name="close" size={18} /></button>
        <label htmlFor="app-pick" className="sr-only">Choose an applicant</label>
        <select id="app-pick" value={selected ?? ''} onChange={(e) => select(e.target.value || null)} className={field + ' min-w-0 flex-1 font-semibold'}>
          <option value="">Choose an applicant</option>
          {ds.applications.map((x) => (
            <option key={x.id} value={x.id}>{x.id}, {x.name}, {result.decisions[x.id].outcome}</option>
          ))}
        </select>
      </div>

      {!a || !d ? (
        <p className="mt-6 max-w-[44ch] text-mute">Choose an applicant above, click a pin on the map, or ask a question. You will see the decision, the reasons, what the applicant must do next, and their training plan.</p>
      ) : (
        <div className="mt-5">
          {/* verdict */}
          <div className="rounded-xl p-5" style={{ background: OUTCOME_COLOR[d.outcome] + '1A' }}>
            <div className="flex items-center gap-3">
              <Mark o={d.outcome} size={44} />
              <div className="min-w-0">
                <p className="text-3xl font-bold leading-none">{d.outcome}</p>
                <p className="mt-1 truncate text-sm">{a.name}, {a.id}</p>
              </div>
              <p className="ml-auto text-right text-xs text-mute">Score<br /><span className="text-2xl font-bold text-ink">{d.score}</span> of 100</p>
            </div>
            <p className="mt-4 text-lg font-semibold leading-snug">{d.headline}</p>
            <p className="mt-1 text-sm text-mute">{a.city ?? 'City unknown'}, pin {a.pinRaw || 'not given'}, {d.territoryId ?? 'no territory'}, prefers {a.language}</p>
          </div>

          <Section title="Why">
            <ul className="list-disc space-y-1 pl-5">
              {d.reasons.slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}
            </ul>
            {d.conditions.length > 0 && <p className="mt-3 rounded-lg bg-tint p-3"><b className="font-semibold">Conditions.</b> {d.conditions.join('; ')}</p>}
          </Section>

          {d.outcome !== 'Approved' && cfs.length > 0 && (
            <Section title="What would change this">
              <ul className="list-disc space-y-1 pl-5">
                {cfs.slice(0, 2).map((c, i) => <li key={i}>{c.text}</li>)}
              </ul>
            </Section>
          )}

          <Section title="Next steps">
            <ol className="space-y-2">
              {d.nextSteps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-tint text-xs font-bold text-brand">{i + 1}</span>
                  <span className="flex-1">{s.text}</span>
                  {s.dueWeek !== undefined && <span className="shrink-0 text-sm font-semibold">{weekDate(s.dueWeek)}</span>}
                </li>
              ))}
            </ol>
          </Section>

          {d.plan && (
            <Section title="Training plan">
              <p className="font-semibold">{d.plan.track}</p>
              <p className="text-sm text-mute">In {d.plan.language}. Store opens {weekDate(d.plan.openWeek)}{d.plan.redated ? ' (date moved)' : ''}.</p>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-semibold text-brand underline underline-offset-4">See modules and milestones</summary>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {d.plan.modules.map((m) => <li key={m} className="rounded-full bg-tint px-3 py-1 text-sm">{m}</li>)}
                </ul>
                <ol className="mt-3">
                  {d.plan.milestones.map((m) => (
                    <li key={m.name} className="flex items-baseline gap-3 border-t border-line py-2">
                      <span className="w-28 shrink-0 text-sm font-semibold">{weekDate(m.dueWeek)}</span>
                      <span>{m.name}{m.note ? <span className="text-mute"> ({m.note})</span> : null}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-sm text-mute">{d.plan.feasibility}</p>
              </details>
            </Section>
          )}

          <details className="border-t border-line py-5">
            <summary className="cursor-pointer text-lg font-semibold">More details</summary>
            <div className="mt-4 space-y-6">
              <div>
                <h4 className="mb-1 font-semibold">How the score adds up</h4>
                <p className="mb-2 text-sm text-mute">Decided by: {d.decidedBy}</p>
                <div className="space-y-3">
                  {d.breakdown.map((b) => (
                    <div key={b.key}>
                      <div className="flex justify-between text-sm"><span className="font-medium">{b.label}</span><span className="font-semibold">{b.max > 0 ? `${b.score} of ${b.max}` : b.score}</span></div>
                      {b.max > 0 && <div className="mt-1 h-1.5 rounded-full bg-line"><div className="h-full rounded-full bg-brand" style={{ width: `${(b.score / b.max) * 100}%` }} /></div>}
                      <div className="mt-0.5 text-sm text-mute">{b.note}</div>
                    </div>
                  ))}
                </div>
              </div>
              {d.flags.length > 0 && (
                <div>
                  <h4 className="mb-1 font-semibold">Problems found in the data</h4>
                  <ul className="space-y-1">
                    {d.flags.map((f, i) => (
                      <li key={i} className="flex gap-2"><span className="w-16 shrink-0 text-sm font-semibold">{f.severity === 'error' ? 'Error' : f.severity === 'warn' ? 'Warning' : 'Note'}</span>{f.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              {d.overridden && (
                <p className="rounded-lg bg-wash p-3"><b className="font-semibold">Manual override {d.overridden.applied ? 'applied' : 'not applied'}.</b> {d.overridden.outcome}: “{d.overridden.reason}”. {d.overridden.note}</p>
              )}
              <div>
                <h4 className="mb-2 font-semibold">Override this decision</h4>
                <div className="flex flex-wrap gap-2">
                  <select value={ov} onChange={(e) => setOv(e.target.value as Outcome)} className={field} aria-label="Outcome to set">
                    {OUTCOMES.map((o) => <option key={o}>{o}</option>)}
                  </select>
                  <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Reason, kept in the log" aria-label="Reason for the override" className={field + ' min-w-0 flex-1'} />
                  <button disabled={!why.trim()} onClick={() => { setOverride(a.id, ov, why.trim()); setWhy(''); }} className={btnPrimary}>Apply override</button>
                  {overrides[a.id] && <button onClick={() => setOverride(a.id, null, '')} className={btn}>Remove override</button>}
                </div>
                <p className="mt-2 text-sm text-mute">The engine still allows only one store per pin and respects territory slot limits.</p>
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
