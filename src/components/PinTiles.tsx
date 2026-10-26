import type { Dataset, EngineResult } from '../engine';
import { OutcomeIcon } from './ui';

const STATUS: Record<string, { c: string; label: string }> = {
  blocked: { c: '#5E636C', label: 'Blocked (existing store)' },
  taken: { c: '#1F8A5B', label: 'Taken (approved partner)' },
  contested: { c: '#B45309', label: 'Contested (2+ applicants)' },
  available: { c: '#222B45', label: 'Available' },
};

export function PinTiles({ ds, result, selected, onSelect, focus }: { ds: Dataset; result: EngineResult; selected: string | null; onSelect: (id: string) => void; focus: string }) {
  const cities = [...new Set(result.pins.map((p) => p.city))].filter((c) => focus === 'state' || c === focus);
  return (
    <div className="h-full overflow-auto p-4">
      <div className="mb-3 flex flex-wrap gap-3 text-[11px] text-muted">
        {Object.entries(STATUS).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px]" style={{ background: v.c + '40', border: `1px solid ${v.c}` }} />{v.label}</span>
        ))}
        <span className="text-muted">One approved store per pin code, never on a store pin.</span>
      </div>
      <div className="space-y-5">
        {cities.map((city) => {
          const pins = result.pins.filter((p) => p.city === city).sort((a, b) => a.pin.localeCompare(b.pin));
          return (
            <section key={city}>
              <h4 className="mb-2 font-display text-xs text-body">{city}</h4>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2">
                {pins.map((p) => {
                  const s = STATUS[p.status];
                  return (
                    <div key={p.pin} className="rounded-lg p-2" style={{ background: s.c + '17', border: `1px solid ${s.c}77` }}>
                      <div className="flex items-center justify-between font-mono text-[11px] text-ink">
                        <span>{p.pin}</span>
                        {p.status === 'blocked' && <span className="text-xs text-muted">store</span>}
                      </div>
                      <div className="mt-0.5 text-[11px]" style={{ color: s.c }}>{p.status}{p.holder ? ` · ${p.holder}` : ''}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {p.applicants.map((id) => {
                          const d = result.decisions[id];
                          return (
                            <button key={id} onClick={() => onSelect(id)} title={`${id}: ${d.outcome}`}
                              className={`inline-flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2 font-mono text-[11px] shadow-float ${selected === id ? 'bg-ink text-white' : 'bg-surface text-ink'}`}>
                              <OutcomeIcon o={d.outcome} size={14} />
                              {id.replace('APP-', '')}
                            </button>
                          );
                        })}
                      </div>
                      {p.territoryId && <div className="mt-1 text-[11px] text-muted">{p.territoryId}</div>}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
        {ds.applications.some((a) => !a.pin || !result.pins.some((p) => p.pin === a.pin)) && (
          <section>
            <h4 className="mb-2 font-display text-xs text-body">Pins outside every territory</h4>
            <div className="flex flex-wrap gap-2">
              {ds.applications.filter((a) => !a.pin || !result.pins.some((p) => p.pin === a.pin)).map((a) => (
                <button key={a.id} onClick={() => onSelect(a.id)} className="inline-flex items-center gap-1.5 rounded-full bg-surface py-1 pl-1 pr-3 font-mono text-[11px] text-ink shadow-float"><OutcomeIcon o={result.decisions[a.id].outcome} size={16} />
                  {a.id} · {a.pinRaw || 'no pin'}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
