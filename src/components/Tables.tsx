import { useMemo } from 'react';
import { OUTCOMES, type Outcome } from '../engine';
import { select, setFilter, useStore } from '../state/store';
import { Badge, field, Mark, SHAPE_NAME } from './ui';
import { CITIES } from '../data/cityGeo';

/** Row of outcome tabs under the header. Each shows its shape and count, and filters the map and the list. */
export function OutcomeTabs() {
  const r = useStore((s) => s.result);
  const filter = useStore((s) => s.filter);
  const total = r.order.length;
  const items: { o: Outcome | null; label: string; n: number }[] = [{ o: null, label: 'Everyone', n: total }, ...OUTCOMES.map((o) => ({ o, label: o, n: r.counts[o] }))];
  return (
    <div role="group" aria-label="Filter by outcome" className="flex gap-2 overflow-x-auto pb-1">
      {items.map((i) => {
        const on = (filter.outcome ?? null) === i.o;
        return (
          <button
            key={i.label}
            onClick={() => setFilter(i.o ? (on ? { ...filter, outcome: undefined } : { ...filter, outcome: i.o }) : { ...filter, outcome: undefined })}
            aria-pressed={on}
            title={i.o ? `${i.o}: drawn as a ${SHAPE_NAME[i.o]}` : 'Show every applicant'}
            className={`flex shrink-0 flex-col items-center gap-1 border-b-2 px-4 pb-2 pt-1 text-xs font-semibold ${on ? 'border-brand text-ink' : 'border-transparent text-mute hover:border-line hover:text-ink'}`}
          >
            {i.o ? <Mark o={i.o} size={26} /> : <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-tint text-sm font-bold text-brand">{total}</span>}
            <span>{i.label}{i.o ? ` ${i.n}` : ''}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Applicants as cards, like a list of places. Clicking one opens its decision. */
export function ApplicantList() {
  const ds = useStore((s) => s.ds);
  const result = useStore((s) => s.result);
  const filter = useStore((s) => s.filter);
  const selected = useStore((s) => s.selected);
  const changed = useStore((s) => s.changed);
  const prev = useStore((s) => s.prev);
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
    <section aria-label="Applicants">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">{rows.length} {rows.length === 1 ? 'applicant' : 'applicants'}{any ? ' match' : ''}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Filter by city" value={filter.city ?? ''} onChange={(e) => setFilter({ ...filter, city: e.target.value || undefined })} className={field}>
            <option value="">Any city</option>{CITIES.map((c) => <option key={c.name}>{c.name}</option>)}
          </select>
          <select aria-label="Filter by territory" value={filter.territory ?? ''} onChange={(e) => setFilter({ ...filter, territory: e.target.value || undefined })} className={field}>
            <option value="">Any territory</option>{ds.territories.map((t) => <option key={t.id}>{t.id}</option>)}
          </select>
          {any && <button onClick={() => setFilter({})} className="text-sm font-semibold text-brand underline underline-offset-4">Show everyone</button>}
        </div>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {rows.map((a) => {
          const d = result.decisions[a.id];
          const isChanged = changed.includes(a.id);
          const was = prev?.decisions[a.id]?.outcome;
          return (
            <li key={a.id}>
              <button
                onClick={() => select(a.id)}
                aria-pressed={selected === a.id}
                className={`block h-full w-full rounded-xl bg-white p-4 text-left shadow-card transition-shadow hover:shadow-float ${selected === a.id ? 'outline outline-2 outline-brand' : ''} ${isChanged ? 'row-flash' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{a.name}</p>
                    <p className="text-xs text-mute">{a.id}, {a.city ?? 'city unknown'}, pin {a.pinRaw || 'not given'}</p>
                  </div>
                  <Badge o={d.outcome} small />
                </div>
                <p className="mt-2 line-clamp-2 text-sm">{d.headline}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-mute">
                  <span>Score <b className="text-sm text-ink">{d.score}</b> of 100</span>
                  {isChanged && was && was !== d.outcome && <span className="font-semibold text-ink">Changed from {was}</span>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {!rows.length && <p className="rounded-xl bg-wash p-6 text-center text-mute">Nobody matches these filters. Choose “Show everyone” to start again.</p>}
    </section>
  );
}

export function TerritoryCards() {
  const r = useStore((s) => s.result);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {r.territories.map((t) => (
        <div key={t.territory.id} className="rounded-xl p-4 shadow-card">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-lg font-semibold">{t.territory.id}, {t.territory.city}</h3>
            <span className="text-xs text-mute">{t.territory.priority} priority, tier {t.territory.tier}</span>
          </div>
          <div className="mt-2 flex gap-1" role="img" aria-label={`${t.filled} of ${t.territory.slots} slots filled`}>
            {Array.from({ length: Math.max(t.territory.slots, 0) }).map((_, i) => (
              <span key={i} className="h-2.5 flex-1 rounded-full" style={{ background: i < t.filled ? '#3F3BB5' : '#DDD' }} />
            ))}
            {t.territory.slots === 0 && <span className="text-sm text-mute">Closed: no open slots</span>}
          </div>
          <p className="mt-1 text-xs text-mute">{t.filled} of {t.territory.slots} slots filled, {t.territory.pins.length} pins</p>
          <p className="mt-2 text-sm">{t.winnerWhy}</p>
          {t.ranking.length > 0 && (
            <ol className="mt-2 text-sm">
              {t.ranking.map((x, i) => (
                <li key={x.id} className="flex items-center gap-2 border-t border-line py-1.5">
                  <span className="w-4 text-mute">{i + 1}</span>
                  <button onClick={() => select(x.id)} className="font-semibold text-brand underline underline-offset-2">{x.id}</button>
                  <span className="text-mute">{x.score}</span>
                  <Badge o={x.outcome} small />
                  <span className="truncate text-xs text-mute">{x.note}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </div>
  );
}

export function DataQuality() {
  const ds = useStore((s) => s.ds);
  const r = useStore((s) => s.result);
  const rows = ds.applications.map((a) => ({ a, flags: r.decisions[a.id].flags })).filter((x) => x.flags.length);
  return (
    <div>
      {ds.warnings.length > 0 && (
        <div className="mb-5">
          <h3 className="mb-2 text-lg font-semibold">Notes about the whole file</h3>
          <ul className="list-disc space-y-1 pl-5">{ds.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}
      <h3 className="text-lg font-semibold">Problems by applicant ({rows.length})</h3>
      <p className="mb-2 text-mute">Nothing is dropped. Every row with a problem still gets a decision.</p>
      <ul>
        {rows.map(({ a, flags }) => (
          <li key={a.id} className="border-t border-line py-3">
            <div className="mb-1 flex flex-wrap items-center gap-2"><button onClick={() => select(a.id)} className="font-semibold text-brand underline underline-offset-2">{a.id}</button><span>{a.name}</span><Badge o={r.decisions[a.id].outcome} small /></div>
            <ul className="space-y-0.5 text-sm">
              {flags.map((f, i) => <li key={i} className="flex gap-2"><span className="w-16 shrink-0 font-semibold">{f.severity === 'error' ? 'Error' : f.severity === 'warn' ? 'Warning' : 'Note'}</span>{f.message}</li>)}
            </ul>
          </li>
        ))}
        {!rows.length && <li className="text-mute">No problems found. The file is clean.</li>}
      </ul>
    </div>
  );
}
