import { select, undo, reset, useStore } from '../state/store';
import { Badge, btn, Card, Icon } from './ui';

/** What the last question or new fact changed, with the knock-on effects spelled out. */
export function ChangesCard() {
  const diff = useStore((s) => s.diff);
  const log = useStore((s) => s.log);
  const canUndo = useStore((s) => s.history.length > 0);
  const last = log[log.length - 1];
  if (!diff || !last) {
    return (
      <Card className="bg-tint shadow-none">
        <h2 className="text-lg font-semibold">What changed and why</h2>
        <p className="mt-1 max-w-[56ch] text-mute">Nothing has changed yet. Try “APP-012 found a ground-floor space” in the search bar above. Every pin that moves pulses on the map, and this card says why.</p>
      </Card>
    );
  }
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">What changed and why</h2>
          <p className="text-sm text-mute">{last.text}. {diff.changes.length} changed, {diff.unchanged} did not.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={undo} disabled={!canUndo} className={btn + ' px-3 py-1.5'}><Icon name="undo" size={16} />Undo</button>
          <button onClick={reset} disabled={!log.length} className={btn + ' px-3 py-1.5'}>Start over</button>
        </div>
      </div>
      {diff.changes.length === 0 && <p className="mt-3">No decision changed. This update did not affect any outcome or pin.</p>}
      <ul className="mt-3 space-y-3">
        {diff.changes.map((c) => (
          <li key={c.id} className="rounded-xl bg-tint p-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <button onClick={() => select(c.id)} className="font-semibold text-brand underline underline-offset-4">{c.id}</button>
              <Badge o={c.from} small />
              <span className="text-mute">became</span>
              <Badge o={c.to} small />
              <span className="ml-auto text-xs text-mute">score {c.scoreFrom} to {c.scoreTo}</span>
            </div>
            <p className="mt-2 text-[15px]">{c.primary}</p>
            {c.knockOn && <p className="mt-2 rounded-lg border-l-4 border-brand bg-white p-3 text-[15px] shadow-card"><b className="font-semibold">Knock-on effect.</b> {c.knockOn}</p>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ScenarioLog() {
  const log = useStore((s) => s.log);
  const overrides = useStore((s) => s.overrides);
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <h3 className="mb-2 text-lg font-semibold">Changes you have made</h3>
        {!log.length ? <p className="text-mute">Nothing yet. The map shows the file as uploaded.</p> : (
          <ol className="space-y-2">
            {log.map((l) => (
              <li key={l.n} className="flex gap-3 border-t border-line pt-2">
                <span className="w-6 shrink-0 text-sm text-mute">{l.n}</span>
                <p>{l.text} <span className="text-sm text-mute">({l.changed} decision{l.changed === 1 ? '' : 's'} changed)</span></p>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div>
        <h3 className="mb-2 text-lg font-semibold">Manual overrides</h3>
        {!Object.keys(overrides).length ? <p className="text-mute">None. An override lets the expansion team correct the engine and records why.</p> : (
          <ul className="space-y-2">
            {Object.entries(overrides).map(([id, o]) => (
              <li key={id} className="border-t border-line pt-2"><button onClick={() => select(id)} className="font-semibold text-brand underline underline-offset-2">{id}</button> set to {o.outcome}: {o.reason}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
