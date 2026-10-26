import { useState } from 'react';
import { EXAMPLES } from '../query/parse';
import { ask, clearAnswer, select, useStore } from '../state/store';

const submit = (text: string, clear?: () => void) => {
  if (!text.trim()) return;
  ask(text);
  clear?.();
};

/** Large centred pill, like a search bar. */
export function QueryPill() {
  const [q, setQ] = useState('');
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit(q, () => setQ('')); }}
      className="flex items-center gap-2 rounded-full border border-hair bg-surface py-1.5 pl-5 pr-1.5 shadow-float transition focus-within:border-ink/30 focus-within:shadow-float-lg"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgb(34 43 69)" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ask about an applicant, or tell me what changed"
        className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-ink placeholder:text-muted"
        aria-label="Ask a question or enter new information about an applicant"
      />
      <button className="rounded-full bg-primary-strong px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-95">Ask</button>
    </form>
  );
}

export function ExampleChips() {
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {EXAMPLES.slice(0, 4).map((e) => (
        <button key={e} onClick={() => submit(e)} className="rounded-full bg-surface/90 px-3 py-1.5 text-xs text-body shadow-float transition hover:text-ink">
          {e}
        </button>
      ))}
      <button onClick={() => submit('undo')} className="rounded-full bg-surface/90 px-3 py-1.5 text-xs text-muted shadow-float hover:text-ink">Undo</button>
      <button onClick={() => submit('reset')} className="rounded-full bg-surface/90 px-3 py-1.5 text-xs text-muted shadow-float hover:text-ink">Reset</button>
    </div>
  );
}

export function AnswerCard() {
  const answer = useStore((s) => s.answer);
  if (!answer) return null;
  const tone = answer.tone === 'ok' ? '#17704A' : answer.tone === 'warn' ? '#8A5F00' : '#222B45';
  return (
    <div className="fade-in max-h-[40dvh] overflow-auto rounded-lg bg-surface p-4 text-left shadow-float-lg" role="status">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="text-base font-semibold" style={{ color: tone }}>{answer.title}</div>
        <div className="flex shrink-0 items-center gap-1">
          {answer.focusId && <button onClick={() => select(answer.focusId as string)} className="rounded-full px-3 py-1 text-sm font-medium text-ink hover:bg-sunken">Open {answer.focusId}</button>}
          <button onClick={clearAnswer} aria-label="Dismiss answer" className="flex h-8 w-8 items-center justify-center rounded-full text-ink hover:bg-sunken"><svg width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" /></svg></button>
        </div>
      </div>
      <div className="max-w-prose space-y-1.5 text-[15px] leading-relaxed text-body">
        {answer.lines.map((l, i) => <p key={i}>{l}</p>)}
      </div>
    </div>
  );
}
