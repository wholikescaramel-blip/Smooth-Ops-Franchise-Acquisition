import { useSyncExternalStore } from 'react';
import { counterfactuals, diffResults, patchApp, patchTerritory, runEngine, type AppPatch, type Dataset, type Diff, type EngineResult, type Outcome, type Overrides, describePatchSummary } from '../engine';
import { parseQuery, type Intent } from '../query/parse';

export interface LogEntry {
  n: number;
  kind: 'update' | 'territory' | 'override' | 'undo' | 'reset';
  text: string;
  changed: number;
}
export interface Layers {
  basemap: boolean;
  territories: boolean;
  stores: boolean;
  applicants: boolean;
  rings: boolean;
  arcs: boolean;
  heat: boolean;
}
export interface Answer {
  title: string;
  lines: string[];
  tone: 'info' | 'ok' | 'warn';
  focusId?: string;
}
export type Tab = 'detail' | 'changes' | 'territories' | 'quality' | 'log' | 'rules';
export interface Filter {
  outcome?: Outcome;
  city?: string;
  territory?: string;
}
interface Snap {
  ds: Dataset;
  overrides: Overrides;
  log: LogEntry[];
  result: EngineResult;
  diff: Diff | null;
  prev: EngineResult | null;
  changed: string[];
}
export interface State {
  phase: 'upload' | 'app';
  error: string | null;
  fileName: string;
  baseDS: Dataset | null;
  ds: Dataset;
  overrides: Overrides;
  baseResult: EngineResult | null;
  result: EngineResult;
  prev: EngineResult | null; // result right before the last update
  diff: Diff | null;
  changed: string[];
  log: LogEntry[];
  history: Snap[];
  selected: string | null;
  answer: Answer | null;
  filter: Filter;
  tab: Tab;
  compare: boolean;
  view: 'map' | 'tiles';
  focus: string; // 'state' or a city name
  layers: Layers;
  save: { status: 'idle' | 'saving' | 'saved' | 'offline'; id: string | null };
}

const emptyDS: Dataset = { applications: [], territories: [], stores: [], warnings: [] };
let state: State = {
  phase: 'upload', error: null, fileName: '', baseDS: null, ds: emptyDS, overrides: {}, baseResult: null, result: runEngine(emptyDS),
  prev: null, diff: null, changed: [], log: [], history: [], selected: null, answer: null, filter: {}, tab: 'detail', compare: false,
  save: { status: 'idle', id: null },
  view: 'map', focus: 'state', layers: { basemap: true, territories: true, stores: true, applicants: true, rings: false, arcs: false, heat: false },
};
const subs = new Set<() => void>();
const set = (p: Partial<State>) => {
  state = { ...state, ...p };
  subs.forEach((f) => f());
};
export const getState = () => state;
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (cb) => (subs.add(cb), () => subs.delete(cb)),
    () => sel(state),
  );
}

const snap = (): Snap => ({ ds: state.ds, overrides: state.overrides, log: state.log, result: state.result, diff: state.diff, prev: state.prev, changed: state.changed });

export function loadDataset(ds: Dataset, fileName: string) {
  const r = runEngine(ds);
  set({
    phase: 'app', error: null, fileName, baseDS: ds, ds, overrides: {}, baseResult: r, result: r, prev: null, diff: null, changed: [], log: [], history: [],
    selected: null, answer: null, filter: {}, tab: 'detail', compare: false, focus: 'state', save: { status: 'idle', id: null },
  });
}
export const setSave = (save: State['save']) => set({ save });
export function setError(e: string | null) {
  set({ error: e });
}
export function backToUpload() {
  set({ phase: 'upload', error: null });
}

export const select = (id: string | null) => set({ selected: id, tab: id ? 'detail' : state.tab });
export const setTab = (tab: Tab) => set({ tab });
export const setFilter = (filter: Filter) => set({ filter });
export const setView = (view: 'map' | 'tiles') => set({ view });
export const setFocus = (focus: string) => set({ focus });
export const toggleLayer = (k: keyof Layers) => set({ layers: { ...state.layers, [k]: !state.layers[k] } });
export const setCompare = (compare: boolean) => set({ compare });
export const clearChanged = () => set({ changed: [] });

function commit(ds: Dataset, overrides: Overrides, entry: Omit<LogEntry, 'n' | 'changed'>, subjects: string[], note: string, answer?: Answer) {
  const history = [...state.history, snap()];
  const before = state.result;
  const result = runEngine(ds, overrides);
  const diff = diffResults(before, result, ds, subjects, note);
  const log = [...state.log, { ...entry, n: state.log.length + 1, changed: diff.changes.length }];
  set({
    ds, overrides, result, prev: before, diff, changed: diff.changes.map((c) => c.id), log, history,
    tab: 'changes', answer: answer ?? null, selected: subjects[0] ?? state.selected,
  });
  return diff;
}

export function setOverride(id: string, outcome: Outcome | null, reason: string) {
  const overrides = { ...state.overrides };
  if (outcome) overrides[id] = { outcome, reason: reason || 'No reason given', at: Date.now() };
  else delete overrides[id];
  const text = outcome ? `Override ${id} → ${outcome}: ${reason || 'no reason given'}` : `Override on ${id} removed`;
  const diff = commit(state.ds, overrides, { kind: 'override', text }, [id], text);
  const d = getState().result.decisions[id];
  if (outcome && d?.overridden && !d.overridden.applied) {
    set({ answer: { title: 'Override not applied', lines: [d.overridden.note], tone: 'warn', focusId: id } });
  } else {
    set({ answer: { title: outcome ? `Override logged for ${id}` : `Override removed for ${id}`, lines: [`${diff.changes.length} decision${diff.changes.length === 1 ? '' : 's'} changed. The one-pin rule and slot limits still apply.`], tone: 'ok', focusId: id } });
  }
}

/** Manual entry from the fix form: applies the confirmed details, re-runs the engine and logs it. */
export function applyFix(id: string, patch: AppPatch) {
  if (!state.ds.applications.some((a) => a.id === id) || !Object.keys(patch).length) return;
  const text = `Manual entry for ${id}: ${describePatchSummary(patch)}`;
  const diff = commit(patchApp(state.ds, id, patch), state.overrides, { kind: 'update', text }, [id], text);
  const d = getState().result.decisions[id];
  const lines = [`${id} is now ${d.outcome}. ${d.reasons[0] ?? ''}`];
  for (const c of diff.changes) if (!c.subject && c.knockOn) lines.push('Knock-on: ' + c.knockOn);
  set({ answer: { title: `Saved details for ${id}`, lines, tone: 'ok', focusId: id } });
}

export function undo() {
  const h = state.history;
  if (!h.length) {
    set({ answer: { title: 'Nothing to undo', lines: ['You are already at the baseline.'], tone: 'info' } });
    return;
  }
  const s = h[h.length - 1];
  set({ ds: s.ds, overrides: s.overrides, log: s.log, result: s.result, diff: s.diff, prev: s.prev, changed: [], history: h.slice(0, -1), answer: { title: 'Undone', lines: ['Reverted the last change.'], tone: 'ok' } });
}
export function reset() {
  if (!state.baseDS) return;
  const r = state.baseResult as EngineResult;
  set({ ds: state.baseDS, overrides: {}, result: r, prev: null, diff: null, changed: [], log: [], history: [], filter: {}, compare: false, answer: { title: 'Reset', lines: ['Back to the uploaded baseline; scenario log cleared.'], tone: 'ok' } });
}

/* ------------------------------------------------------------------ query bar */

const O = (o: Outcome) => (o === 'Hold' ? 'on Hold' : o === 'Approved' ? 'Approved' : o === 'Waitlist' ? 'Waitlisted' : o === 'Redirect' ? 'Redirected' : 'Declined');

export function ask(text: string): void {
  const intent: Intent = parseQuery(text, state.ds);
  run(intent);
}

function run(intent: Intent) {
  const { ds, result, overrides } = state;
  const need = (id: string) => ds.applications.find((a) => a.id === id);
  switch (intent.kind) {
    case 'explain': {
      const a = need(intent.id);
      if (!a) return notFound(intent.id);
      const d = result.decisions[intent.id];
      const cfs = d.outcome === 'Approved' ? [] : counterfactuals(ds, overrides, intent.id).slice(0, 3);
      const lines = [`${a.id} (${a.name}) is ${O(d.outcome)}: ${d.headline.replace(/^[^:]*: ?/, '')}`.replace(/\.$/, '') + '.', ...d.reasons.map((r) => '• ' + r), `Decided by: ${d.decidedBy}.`];
      if (d.conditions.length) lines.push('Conditions: ' + d.conditions.join('; ') + '.');
      if (cfs.length) lines.push('It flips to Approved if: ' + cfs.map((c) => c.text).join('  —or—  ') + '.');
      set({ selected: intent.id, tab: 'detail', answer: { title: `Why is ${a.id} ${O(d.outcome)}?`, lines, tone: d.outcome === 'Approved' ? 'ok' : 'info', focusId: a.id } });
      return;
    }
    case 'counterfactual': {
      const a = need(intent.id);
      if (!a) return notFound(intent.id);
      const d = result.decisions[intent.id];
      if (d.outcome === 'Approved') {
        set({ selected: intent.id, tab: 'detail', answer: { title: `${a.id} is already Approved`, lines: [d.reasons[0]], tone: 'ok', focusId: a.id } });
        return;
      }
      const cfs = counterfactuals(ds, overrides, intent.id);
      set({ selected: intent.id, tab: 'detail', answer: { title: `What would it take for ${a.id} to be Approved?`, lines: [`Today ${a.id} is ${O(d.outcome)}. Each option below was verified by re-running the engine:`, ...cfs.map((c, i) => `${i + 1}. ${c.text}`)], tone: 'info', focusId: a.id } });
      return;
    }
    case 'update': {
      const a = need(intent.id);
      if (!a) return notFound(intent.id);
      const nds = patchApp(ds, intent.id, intent.patch);
      const diff = commit(nds, overrides, { kind: 'update', text: intent.summary }, [intent.id], intent.summary);
      const d = getState().result.decisions[intent.id];
      const lines = [`Applied: ${describePatchSummary(intent.patch)}.`, `${intent.id} is now ${O(d.outcome)}. ${d.reasons[0]}`];
      for (const c of diff.changes) if (!c.subject && c.knockOn) lines.push('Knock-on: ' + c.knockOn);
      if (!diff.changes.length) {
        lines.push('No decision changed, so the map is unchanged.');
        if (d.outcome !== 'Approved') {
          lines.push(`${intent.id} stays ${O(d.outcome)} because: ${d.reasons[0]}`);
          const cf = counterfactuals(getState().ds, getState().overrides, intent.id)[0];
          if (cf) lines.push(`What would change it: ${cf.text}.`);
        }
      }
      set({ answer: { title: intent.summary, lines, tone: diff.changes.length ? 'ok' : 'info', focusId: intent.id } });
      return;
    }
    case 'territory': {
      const t = ds.territories.find((x) => x.id === intent.id);
      if (!t) return set({ answer: { title: `I can't find ${intent.id}`, lines: [`Territories in this file: ${ds.territories.map((x) => x.id).join(', ')}.`], tone: 'warn' } });
      const slots = intent.close ? 0 : intent.slots !== undefined ? intent.slots : Math.max(0, t.slots + (intent.delta ?? 0));
      const nds = patchTerritory(ds, t.id, { slots });
      const diff = commit(nds, overrides, { kind: 'territory', text: intent.summary }, [], intent.summary);
      const lines = [`${t.id} (${t.city}) open slots: ${t.slots} → ${slots}.`];
      for (const c of diff.changes) lines.push(`${c.id}: ${c.from} → ${c.to}. ${c.knockOn ?? ''}`);
      if (!diff.changes.length) lines.push(...whySlotsChangedNothing(t.id, t.city, t.slots, slots));
      set({ answer: { title: intent.summary, lines, tone: diff.changes.length ? 'ok' : 'info' } });
      return;
    }
    case 'list': {
      const filter: Filter = { outcome: intent.outcome, city: intent.city, territory: intent.territory };
      const ids = result.order.filter((id) => {
        const d = result.decisions[id];
        const a = need(id) as (typeof ds.applications)[number];
        return (!filter.outcome || d.outcome === filter.outcome) && (!filter.city || a.city === filter.city) && (!filter.territory || d.territoryId === filter.territory || d.redirect?.territoryId === filter.territory);
      });
      const label = [filter.outcome?.toLowerCase(), filter.city && `in ${filter.city}`, filter.territory && `for ${filter.territory}`].filter(Boolean).join(' ');
      set({ filter, answer: { title: `${ids.length} applicant${ids.length === 1 ? '' : 's'} ${label || 'shown'}`, lines: ids.length ? ids.map((id) => `${id} ${need(id)?.name}: ${result.decisions[id].headline}`) : ['Nobody matches that filter.'], tone: 'info' } });
      return;
    }
    case 'compare': {
      if (!state.diff && !state.history.length) {
        set({ answer: { title: 'Nothing to compare yet', lines: ['Make a change first, e.g. "APP-012 found a ground-floor space", then ask me to compare.'], tone: 'info' } });
        return;
      }
      set({ compare: true, tab: 'changes', answer: { title: 'Before / after', lines: ['Showing the baseline next to the current state.'], tone: 'info' } });
      return;
    }
    case 'undo':
      return undo();
    case 'reset':
      return reset();
    case 'clarify':
      return set({ selected: intent.id ?? state.selected, answer: { title: 'One more detail needed', lines: [intent.message], tone: 'warn', focusId: intent.id } });
    default:
      set({
        answer: {
          title: 'I did not catch that',
          lines: ['Try one of these:', '• Why is APP-007 on hold?', '• APP-012 found a ground-floor space', '• What would it take for APP-005 to be approved?', '• Who is on the waitlist in Mysuru?', '• TER-04 now has 1 more slot', '• undo / reset / compare'],
          tone: 'warn',
        },
      });
  }
}

/**
 * A slot only helps someone who qualified but lost for lack of space. When changing a territory's slots moves nobody,
 * say why, and say what is really holding back the applicants around it.
 */
function whySlotsChangedNothing(tid: string, city: string, was: number, now: number): string[] {
  const { ds, result } = getState();
  const rt = result.territories.find((x) => x.territory.id === tid);
  const used = rt?.filled ?? 0;
  const near = ds.applications.filter((a) => {
    const d = result.decisions[a.id];
    return d.outcome !== 'Approved' && (d.territoryId === tid || d.redirect?.territoryId === tid || a.city === city);
  });
  const lines = [`No decision changed. ${tid} uses ${used} of its ${now} slot${now === 1 ? '' : 's'}, and nobody there was waiting for a slot, so ${now > was ? 'an extra one' : 'a different number'} changes nothing.`];
  if (near.length) {
    lines.push(`What is actually holding back the applicants in ${city}:`);
    for (const a of near.slice(0, 6)) lines.push(`• ${a.id} (${result.decisions[a.id].outcome}): ${result.decisions[a.id].headline.replace(/^[^:]*: /, '')}`);
    if (near.length > 6) lines.push(`…and ${near.length - 6} more.`);
  }
  lines.push('Holds, declines and redirects come from missing data, a pin that is taken or has a store on it, or a score below the bar. More slots only help applicants who qualified but were waitlisted because the territory was full.');
  return lines;
}

function notFound(id: string) {
  const ids = state.ds.applications.map((a) => a.id);
  set({ answer: { title: `No application ${id}`, lines: [`This file has ${ids.length} applications: ${ids.slice(0, 8).join(', ')}${ids.length > 8 ? '…' : ''}.`], tone: 'warn' } });
}
