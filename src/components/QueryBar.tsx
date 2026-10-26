import { useState } from 'react';
import { EXAMPLES } from '../query/parse';
import { ask, select, useStore } from '../state/store';
import { Icon } from './ui';

/** The search pill: type a question or a new fact. Example chips sit underneath. */
export function QueryBar() {
  const [q, setQ] = useState('');
  const submit = (text: string) => {
    if (!text.trim()) return;
    ask(text);
    setQ('');
  };
  return (
    <div className="w-full min-w-0 max-w-[760px]">
      <form onSubmit={(e) => { e.preventDefault(); submit(q); }} className="flex items-center rounded-full border border-line bg-white py-1.5 pl-6 pr-1.5 shadow-float focus-within:outline focus-within:outline-2 focus-within:outline-brand">
        <div className="min-w-0 flex-1">
          <label htmlFor="ask" className="block text-xs font-bold leading-tight">Ask a question or add a new fact</label>
          <input
            id="ask"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Why is APP-007 on hold?"
            className="w-full bg-transparent text-sm leading-tight outline-none placeholder:text-mute"
            autoComplete="off"
          />
        </div>
        <button aria-label="Ask" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white hover:bg-brand-dark"><Icon name="search" size={20} /></button>
      </form>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-label="Examples to try">
        {EXAMPLES.map((e) => (
          <button key={e} onClick={() => submit(e)} className="shrink-0 rounded-full border border-line bg-white px-3 py-1 text-xs font-medium hover:border-brand hover:bg-tint">{e}</button>
        ))}
      </div>
    </div>
  );
}

export function QueryAnswer() {
  const answer = useStore((s) => s.answer);
  if (!answer) return null;
  return (
    <div role="status" className="pop-in rounded-xl bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <p className="text-lg font-semibold leading-snug">{answer.title}</p>
        {answer.focusId && <button onClick={() => select(answer.focusId as string)} className="shrink-0 text-sm font-semibold text-brand underline underline-offset-4">Open {answer.focusId}</button>}
      </div>
      <div className="mt-2 max-w-[70ch] space-y-1.5 text-[15px]">
        {answer.lines.map((l, i) => <p key={i}>{l}</p>)}
      </div>
    </div>
  );
}
