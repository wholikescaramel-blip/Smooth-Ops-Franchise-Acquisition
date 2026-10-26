import { useState } from 'react';
import { OUTCOMES, type Dataset, type EngineResult } from '../engine';
import { select, setFilter, useStore } from '../state/store';
import { Icon, Mark, OUTCOME_COLOR } from './ui';

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
}

/** Overview card on the map: how applicants split by outcome, and how full each territory is. Click a row to filter. */
export function MapWidgets({ ds, result }: { ds: Dataset; result: EngineResult }) {
  const [open, setOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1600);
  const filter = useStore((s) => s.filter);
  const total = Math.max(1, ds.applications.length);
  let a = -Math.PI / 2;
  const segs = OUTCOMES.filter((o) => result.counts[o] > 0).map((o) => {
    const sweep = (result.counts[o] / total) * Math.PI * 2;
    const s = { o, d: arc(50, 50, 36, a, a + Math.min(sweep, Math.PI * 2 - 0.001) - (result.counts[o] === total ? 0 : 0.04)) };
    a += sweep;
    return s;
  });
  const terrs = [...result.territories].sort((x, y) => ['High', 'Medium', 'Low'].indexOf(x.territory.priority) - ['High', 'Medium', 'Low'].indexOf(y.territory.priority) || x.territory.id.localeCompare(y.territory.id));
  const needN = result.order.filter((id) => result.decisions[id].missing.length).length;

  return (
    <div className="w-[260px] rounded-xl bg-white shadow-float">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-bold">Overview</span>
        <span className={open ? 'rotate-180' : ''}><Icon name="chevron" size={16} /></span>
      </button>
      {open && (
        <div className="max-h-[44vh] overflow-auto border-t border-line px-4 pb-4 pt-3">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 100 100" className="h-24 w-24 shrink-0" role="img" aria-label={`${ds.applications.length} applications by outcome`}>
              <circle cx="50" cy="50" r="36" fill="none" stroke="#EEE" strokeWidth="13" />
              {segs.map((s) => <path key={s.o} d={s.d} fill="none" stroke={OUTCOME_COLOR[s.o]} strokeWidth="13" />)}
              <text x="50" y="52" textAnchor="middle" fontSize="20" fontWeight="700" fill="#222">{ds.applications.length}</text>
              <text x="50" y="65" textAnchor="middle" fontSize="8" fill="#6A6A6A">applications</text>
            </svg>
            <ul className="min-w-0 flex-1 space-y-1">
              {OUTCOMES.map((o) => (
                <li key={o}>
                  <button onClick={() => setFilter({ ...filter, outcome: filter.outcome === o ? undefined : o })} aria-pressed={filter.outcome === o} className={`flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-sm hover:bg-wash ${filter.outcome === o ? 'bg-tint font-semibold' : ''}`}>
                    <Mark o={o} size={14} />
                    <span className="flex-1 text-left">{o}</span>
                    <span className="font-semibold">{result.counts[o]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <h4 className="mb-1.5 mt-4 text-xs font-bold text-mute">Slots filled, by territory</h4>
          <ul className="space-y-2">
            {terrs.map((t) => (
              <li key={t.territory.id}>
                <div className="flex justify-between text-sm"><span className="font-medium">{t.territory.id}, {t.territory.city}</span><span className="font-semibold">{t.filled} of {t.territory.slots}</span></div>
                <div className="mt-0.5 flex gap-0.5" aria-hidden="true">
                  {t.territory.slots === 0 ? <span className="h-1.5 flex-1 rounded-full bg-line" /> : Array.from({ length: t.territory.slots }).map((_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < t.filled ? 'bg-brand' : 'bg-line'}`} />)}
                </div>
                {t.territory.slots === 0 && <p className="text-xs text-mute">Closed: no open slots</p>}
              </li>
            ))}
          </ul>
          {needN > 0 && (
            <p className="mt-4 rounded-lg bg-tint p-2.5 text-sm"><b className="font-semibold">{needN}</b> {needN === 1 ? 'application needs' : 'applications need'} details entered before a decision can be made.</p>
          )}
          <button onClick={() => select(null)} className="sr-only">Close any open decision</button>
        </div>
      )}
    </div>
  );
}
