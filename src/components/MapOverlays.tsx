import { useState } from 'react';
import { OUTCOMES, type Dataset, type EngineResult, type Outcome } from '../engine';
import { setFilter, toggleLayer, type Filter, type Layers } from '../state/store';
import { OUTCOME_COLOR, OutcomeIcon } from './ui';

const LAYER_LABELS: [keyof Layers, string][] = [
  ['territories', 'Territories'],
  ['stores', 'Existing stores'],
  ['applicants', 'Applicants'],
  ['rings', 'Spacing rings'],
  ['arcs', 'Flow arcs'],
  ['heat', 'Density'],
];

/** Filter chips: pill toggles with the outcome icon and count. They dim pins on the map, never hide them. */
export function FilterChips({ result, filter }: { result: EngineResult; filter: Filter }) {
  return (
    <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label="Filter by outcome">
      {OUTCOMES.map((o) => {
        const on = filter.outcome === o;
        return (
          <button
            key={o}
            aria-pressed={on}
            onClick={() => setFilter({ ...filter, outcome: on ? undefined : (o as Outcome) })}
            className={`inline-flex items-center gap-1.5 rounded-full py-1.5 pl-2 pr-3 text-sm font-medium shadow-float transition ${on ? 'bg-ink text-white' : 'bg-surface text-ink hover:bg-sunken'}`}
          >
            <OutcomeIcon o={o} size={16} />
            {o}
            <span className={`text-xs ${on ? 'text-white/80' : 'text-muted'}`}>{result.counts[o]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Layers popover. */
export function LayerMenu({ layers }: { layers: Layers }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm font-medium text-ink shadow-float hover:bg-sunken">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></svg>
        Layers
      </button>
      {open && (
        <div className="fade-in absolute left-0 top-full z-30 mt-2 w-52 rounded-lg bg-surface p-3 shadow-float-lg">
          <ul className="space-y-2">
            {LAYER_LABELS.map(([k, label]) => (
              <li key={k}>
                <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
                  <input type="checkbox" checked={layers[k]} onChange={() => toggleLayer(k)} className="h-4 w-4 accent-[#222B45]" />
                  {label}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function StatsCard({ ds, result }: { ds: Dataset; result: EngineResult }) {
  const n = Math.max(1, ds.applications.length);
  return (
    <div className="hidden w-[250px] rounded-lg bg-surface p-4 shadow-float md:block">
      <div className="space-y-2.5">
        {OUTCOMES.map((o) => {
          const pct = Math.round((result.counts[o] / n) * 100);
          return (
            <div key={o}>
              <div className="flex items-baseline gap-2 text-sm">
                <span className="font-semibold text-ink">{pct}%</span>
                <span className="text-body">{o}</span>
                <span className="ml-auto text-xs text-muted">{result.counts[o]}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-sunken">
                <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: OUTCOME_COLOR[o], transition: 'width 500ms' }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-xs text-muted">{ds.applications.length} applications · {result.slotsFilled} of {result.slotsTotal} slots filled · {result.flagCount} data flags</div>
    </div>
  );
}
