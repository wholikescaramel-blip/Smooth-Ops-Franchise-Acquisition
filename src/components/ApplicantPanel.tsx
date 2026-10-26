import { useMemo, useState } from 'react';
import { counterfactuals, OUTCOMES, type Outcome } from '../engine';
import { select, setOverride, useStore } from '../state/store';
import { Badge, Card, OUTCOME_COLOR, SectionTitle, weekDate } from './ui';

export function ApplicantPanel() {
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
    <div className="space-y-3">
      <div>
        <label className="sr-only" htmlFor="app-pick">Choose applicant</label>
        <select id="app-pick" value={selected ?? ''} onChange={(e) => select(e.target.value || null)} className="w-full rounded-full border border-hair bg-sunken px-3 py-2 text-sm text-ink">
          <option value="">Select an applicant…</option>
          {ds.applications.map((x) => (
            <option key={x.id} value={x.id}>{x.id} · {x.name} · {result.decisions[x.id].outcome}</option>
          ))}
        </select>
      </div>
      {!a || !d ? (
        <Card className="p-4 text-sm text-muted">Click a dot on the map, a row in the table, or pick an applicant above to see the decision, reasons, next steps and training plan.</Card>
      ) : (
        <div className="fade-in space-y-3">
          <Card className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-ink">{a.id} · {a.name}</div>
                <div className="text-xs text-muted">{a.city ?? '—'} · pin {a.pinRaw || '—'} · {d.territoryId ?? 'no territory'} · prefers {a.language}</div>
              </div>
              <Badge o={d.outcome} />
            </div>
            <p className="mt-3 text-lg font-semibold leading-snug text-ink">{d.headline}</p>
            <ul className="mt-2 space-y-1.5 text-[15px] leading-snug text-body">
              {d.reasons.map((r, i) => <li key={i} className="flex gap-2"><span style={{ color: OUTCOME_COLOR[d.outcome] }}>•</span><span>{r}</span></li>)}
            </ul>
            <div className="mt-2 text-xs text-muted">Decided by: <span className="text-body">{d.decidedBy}</span></div>
            {d.conditions.length > 0 && (
              <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs text-ot-hold">
                <b>Conditions:</b> {d.conditions.join('; ')}
              </div>
            )}
            {d.overridden && (
              <div className="mt-2 rounded-lg border border-o-redirect/40 bg-o-redirect/5 p-2 text-xs text-ot-waitlist">
                <b>Override {d.overridden.applied ? 'applied' : 'NOT applied'}:</b> {d.overridden.outcome}: “{d.overridden.reason}”. {d.overridden.note}
              </div>
            )}
          </Card>

          {d.outcome !== 'Approved' && (
            <Card className="p-4">
              <SectionTitle>What would change it</SectionTitle>
              <ul className="space-y-1 text-[15px] text-ink">
                {cfs.map((c, i) => <li key={i} className="flex gap-2"><span className="text-ot-approved">→</span>{c.text}</li>)}
              </ul>
              <p className="mt-2 text-xs text-muted">Each option was checked by re-running the engine on a modified copy.</p>
            </Card>
          )}

          <Card className="p-4">
            <SectionTitle>Next steps</SectionTitle>
            <ol className="space-y-1.5 text-[15px]">
              {d.nextSteps.map((s, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-hair text-xs text-muted">{i + 1}</span>
                  <span className="flex-1 text-ink">{s.text}</span>
                  <span className="shrink-0 whitespace-nowrap rounded bg-sunken px-1.5 py-0.5 text-right text-xs text-muted">{s.when}{s.dueWeek !== undefined && <span className="block text-primary-strong">by {weekDate(s.dueWeek)}</span>}</span>
                </li>
              ))}
            </ol>
          </Card>

          {d.plan && (
            <Card className="p-4">
              <SectionTitle>Readiness & training plan</SectionTitle>
              <div className="text-[15px] font-medium text-ink">{d.plan.track}</div>
              <div className="text-xs text-muted">Delivered in <b className="text-ink">{d.plan.language}</b> · opens {weekDate(d.plan.openWeek)}{d.plan.redated ? ' (re-dated)' : ''}</div>
              <ul className="mt-2 grid gap-1 text-sm text-body sm:grid-cols-2">
                {d.plan.modules.map((m) => <li key={m} className="flex gap-1.5"><span className="text-ot-approved">✓</span>{m}</li>)}
              </ul>
              <div className="mt-3 space-y-1">
                {d.plan.milestones.map((m) => (
                  <div key={m.name} className="flex items-center gap-2 text-sm">
                    <span className="w-24 shrink-0 font-mono text-xs text-primary-strong">{weekDate(m.dueWeek)}</span>
                    <span className="h-px flex-1 bg-hair" />
                    <span className="text-right text-body">{m.name}{m.note ? <span className="text-muted"> ({m.note})</span> : null}</span>
                  </div>
                ))}
              </div>
              <p className={`mt-3 rounded-lg p-2 text-xs ${d.plan.redated ? 'border border-primary/30 bg-primary/5 text-ot-hold' : 'bg-sunken text-body'}`}>{d.plan.feasibility}</p>
            </Card>
          )}

          {d.breakdown.length > 0 && (
            <Card className="p-4">
              <SectionTitle right={<span className="font-mono text-sm text-ink">{d.score}<span className="text-muted">/100</span></span>}>Why this score</SectionTitle>
              <div className="space-y-2">
                {d.breakdown.map((b) => (
                  <div key={b.key}>
                    <div className="flex justify-between text-xs text-body"><span>{b.label}</span><span className="font-mono">{b.max > 0 ? `${b.score}/${b.max}` : b.score}</span></div>
                    {b.max > 0 && <div className="mt-0.5 h-1.5 rounded bg-sunken"><div className="h-1.5 rounded bg-ink/80" style={{ width: `${(b.score / b.max) * 100}%`, transition: 'width 500ms' }} /></div>}
                    <div className="mt-0.5 text-xs text-muted">{b.note}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {d.flags.length > 0 && (
            <Card className="p-4">
              <SectionTitle>Data-quality flags</SectionTitle>
              <ul className="space-y-1 text-xs">
                {d.flags.map((f, i) => (
                  <li key={i} className="flex gap-2 text-body"><span className={f.severity === 'error' ? 'text-ot-decline' : f.severity === 'warn' ? 'text-ot-hold' : 'text-muted'}>▲</span>{f.message}</li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-4">
            <SectionTitle>Expansion-team override</SectionTitle>
            <div className="flex flex-wrap gap-2">
              <select value={ov} onChange={(e) => setOv(e.target.value as Outcome)} className="rounded-full border border-hair bg-sunken px-2 py-1.5 text-xs text-ink" aria-label="Override outcome">
                {OUTCOMES.map((o) => <option key={o}>{o}</option>)}
              </select>
              <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Reason (required for the log)" className="min-w-0 flex-1 rounded-full border border-hair bg-sunken px-2 py-1.5 text-xs text-ink placeholder:text-muted" />
              <button disabled={!why.trim()} onClick={() => { setOverride(a.id, ov, why.trim()); setWhy(''); }} className="rounded-full bg-primary-strong px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Apply</button>
              {overrides[a.id] && <button onClick={() => setOverride(a.id, null, '')} className="rounded-full border border-hair px-3 py-1.5 text-xs text-body">Remove</button>}
            </div>
            <p className="mt-2 text-xs text-muted">Logged. The engine still enforces one store per pin and the territory slot limit; an override that would break either is refused.</p>
          </Card>
        </div>
      )}
    </div>
  );
}


