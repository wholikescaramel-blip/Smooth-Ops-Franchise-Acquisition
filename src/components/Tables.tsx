import { useMemo } from 'react';
import { OUTCOMES, type Outcome } from '../engine';
import { select, setFilter, useStore } from '../state/store';
import { Badge, Card, OUTCOME_COLOR, SectionTitle } from './ui';
import { CITIES } from '../data/cityGeo';

export function Kpis() {
  const r = useStore((s) => s.result);
  const items: { label: string; v: string | number; c?: string; o?: Outcome }[] = [
    { label: 'Applications', v: r.order.length },
    ...OUTCOMES.map((o) => ({ label: o, v: r.counts[o], c: OUTCOME_COLOR[o], o })),
    { label: 'Slots filled', v: `${r.slotsFilled}/${r.slotsTotal}` },
    { label: 'Data flags', v: r.flagCount, c: r.flagCount ? '#8A5F00' : undefined },
  ];
  const filter = useStore((s) => s.filter);
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
      {items.map((i) => (
        <button key={i.label} disabled={!i.o} onClick={() => i.o && setFilter(filter.outcome === i.o ? { ...filter, outcome: undefined } : { ...filter, outcome: i.o })}
          className={`rounded-xl border bg-surface px-3 py-2 text-left ${filter.outcome === i.o && i.o ? 'border-white/60' : 'border-hair'} ${i.o ? 'hover:border-hair' : 'cursor-default'}`}>
          <div className="text-xl font-semibold leading-none" style={{ color: i.c ?? '#222B45' }}>{i.v}</div>
          <div className="mt-1 text-xs text-muted">{i.label}</div>
        </button>
      ))}
    </div>
  );
}

export function ApplicantTable({ onPick }: { onPick?: () => void }) {
  const ds = useStore((s) => s.ds);
  const result = useStore((s) => s.result);
  const filter = useStore((s) => s.filter);
  const selected = useStore((s) => s.selected);
  const changed = useStore((s) => s.changed);
  const rows = useMemo(
    () =>
      ds.applications.filter((a) => {
        const d = result.decisions[a.id];
        return (!filter.outcome || d.outcome === filter.outcome) && (!filter.city || a.city === filter.city) && (!filter.territory || d.territoryId === filter.territory || d.redirect?.territoryId === filter.territory);
      }),
    [ds, result, filter],
  );
  const any = filter.outcome || filter.city || filter.territory;
  return (
    <Card className="p-3">
      <SectionTitle right={any ? <button onClick={() => setFilter({})} className="text-xs text-muted underline hover:text-ink">clear filters</button> : undefined}>Applicants · {rows.length}</SectionTitle>
      <div className="mb-2 flex flex-wrap gap-2">
        <select aria-label="Filter by outcome" value={filter.outcome ?? ''} onChange={(e) => setFilter({ ...filter, outcome: (e.target.value || undefined) as Outcome | undefined })} className="rounded-full border border-hair bg-sunken px-2 py-1 text-xs text-ink">
          <option value="">All outcomes</option>{OUTCOMES.map((o) => <option key={o}>{o}</option>)}
        </select>
        <select aria-label="Filter by city" value={filter.city ?? ''} onChange={(e) => setFilter({ ...filter, city: e.target.value || undefined })} className="rounded-full border border-hair bg-sunken px-2 py-1 text-xs text-ink">
          <option value="">All cities</option>{CITIES.map((c) => <option key={c.name}>{c.name}</option>)}
        </select>
        <select aria-label="Filter by territory" value={filter.territory ?? ''} onChange={(e) => setFilter({ ...filter, territory: e.target.value || undefined })} className="rounded-full border border-hair bg-sunken px-2 py-1 text-xs text-ink">
          <option value="">All territories</option>{ds.territories.map((t) => <option key={t.id}>{t.id}</option>)}
        </select>
      </div>
      <div className="max-h-[420px] overflow-auto rounded-lg border border-hair">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="sticky top-0 bg-sunken text-xs text-muted">
            <tr><th className="px-2 py-2">ID</th><th>Name</th><th>City · pin</th><th>Outcome</th><th className="text-right">Score</th><th className="pl-3">Why</th></tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const d = result.decisions[a.id];
              return (
                <tr key={a.id} onClick={() => { select(a.id); onPick?.(); }} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") { select(a.id); onPick?.(); } }} className={`cursor-pointer border-t border-hair hover:bg-sunken ${selected === a.id ? 'bg-sunken' : ''} ${changed.includes(a.id) ? 'row-flash' : ''}`}>
                  <td className="px-2 py-1.5 font-mono text-ink">{a.id}</td>
                  <td className="text-body">{a.name}</td>
                  <td className="font-mono text-xs text-muted">{a.city ?? '—'} · {a.pinRaw || '—'}</td>
                  <td><Badge o={d.outcome} small /></td>
                  <td className="text-right font-mono text-body">{d.score}</td>
                  <td className="max-w-[280px] truncate pl-3 text-muted" title={d.headline}>{d.headline}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">No applicants match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function TerritoryCards() {
  const r = useStore((s) => s.result);
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {r.territories.map((t) => {
        return (
          <Card key={t.territory.id} className="p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-ink">{t.territory.id} · {t.territory.city}</div>
              <span className="rounded-full bg-sunken px-2.5 py-0.5 text-xs font-medium text-ink">{t.territory.priority} priority · Tier {t.territory.tier}</span>
            </div>
            <div className="mt-2 flex gap-1" aria-label={`${t.filled} of ${t.territory.slots} slots filled`}>
              {Array.from({ length: Math.max(t.territory.slots, 0) }).map((_, i) => (
                <span key={i} className="h-2.5 flex-1 rounded-sm" style={{ background: i < t.filled ? '#1F8A5B' : '#E4E4E7' }} />
              ))}
              {t.territory.slots === 0 && <span className="text-xs text-muted">0 open slots (closed)</span>}
            </div>
            <div className="mt-1 text-xs text-muted">{t.filled}/{t.territory.slots} slots filled · {t.territory.pins.length} pins</div>
            <p className="mt-1.5 text-xs text-body">{t.winnerWhy}</p>
            {t.ranking.length > 0 && (
              <ol className="mt-2 space-y-0.5 text-xs">
                {t.ranking.map((x, i) => (
                  <li key={x.id} className="flex items-center gap-2">
                    <span className="w-3 text-muted">{i + 1}</span>
                    <button onClick={() => select(x.id)} className="font-mono text-ink underline decoration-hair">{x.id}</button>
                    <span className="font-mono text-muted">{x.score}</span>
                    <Badge o={x.outcome} small />
                    <span className="truncate text-muted">{x.note}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        );
      })}
    </div>
  );
}

export function DataQuality() {
  const ds = useStore((s) => s.ds);
  const r = useStore((s) => s.result);
  const rows = ds.applications.map((a) => ({ a, flags: r.decisions[a.id].flags })).filter((x) => x.flags.length);
  return (
    <div className="space-y-3">
      {ds.warnings.length > 0 && (
        <Card className="p-3">
          <SectionTitle>File-level notes</SectionTitle>
          <ul className="space-y-1 text-xs text-body">{ds.warnings.map((w, i) => <li key={i}>• {w}</li>)}</ul>
        </Card>
      )}
      <Card className="p-3">
        <SectionTitle>Flags by application · {rows.length}</SectionTitle>
        <p className="mb-2 text-xs text-muted">Nothing is silently dropped: every flagged row still gets an outcome.</p>
        <ul className="space-y-2">
          {rows.map(({ a, flags }) => (
            <li key={a.id} className="rounded-lg border border-hair p-2">
              <div className="mb-1 flex items-center gap-2"><button onClick={() => select(a.id)} className="font-mono text-xs text-ink underline">{a.id}</button><span className="text-xs text-muted">{a.name}</span><Badge o={r.decisions[a.id].outcome} small /></div>
              <ul className="space-y-0.5 text-xs text-body">
                {flags.map((f, i) => <li key={i} className="flex gap-1.5"><span className={f.severity === 'error' ? 'text-ot-decline' : f.severity === 'warn' ? 'text-ot-hold' : 'text-muted'}>▲</span>{f.message}</li>)}
              </ul>
            </li>
          ))}
          {!rows.length && <li className="text-sm text-muted">No data-quality flags. Clean file.</li>}
        </ul>
      </Card>
    </div>
  );
}

