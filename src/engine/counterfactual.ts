import { CONFIG } from './config';
import { runEngine } from './allocate';
import { pinDistance } from './evaluate';
import type { AppPatch, Application, Dataset, Overrides } from './types';

const FIELD_FLAGS: Record<string, string[]> = {
  city: ['city-unknown', 'city-inferred'],
  investment: ['investment-unreadable', 'investment-coerced', 'investment-rupees'],
  experience: ['experience-unreadable'],
  size: ['size-unreadable'],
  launchMonths: ['launch-unreadable'],
  space: ['space-unknown'],
  floor: ['floor-unknown'],
  language: ['language-fallback'],
};

export function patchApp(ds: Dataset, id: string, patch: AppPatch): Dataset {
  return {
    ...ds,
    applications: ds.applications.map((a) => {
      if (a.id !== id) return a;
      const n: Application = { ...a, ...patch };
      if (patch.space !== undefined || patch.investment !== undefined || patch.experience !== undefined) n.notesSuperseded = true;
      if (patch.pin !== undefined) n.pinRaw = patch.pin ?? '';
      // a confirmed value replaces whatever the file got wrong, so its parse warnings no longer apply
      const cleared: string[] = [];
      for (const [k, codes] of Object.entries(FIELD_FLAGS)) if ((patch as Record<string, unknown>)[k] !== undefined) cleared.push(...codes);
      if (cleared.length) n.parseFlags = a.parseFlags.filter((f) => !cleared.includes(f.code));
      return n;
    }),
  };
}
export function patchTerritory(ds: Dataset, tid: string, patch: Partial<{ slots: number }>): Dataset {
  return { ...ds, territories: ds.territories.map((t) => (t.id === tid ? { ...t, ...patch } : t)) };
}

export interface Counterfactual {
  text: string;
  patch?: AppPatch;
  territory?: { id: string; slots: number };
}

/** Minimal change(s) that flip an application to Approved, found by re-running the engine on modified copies. */
export function counterfactuals(ds: Dataset, overrides: Overrides, id: string): Counterfactual[] {
  const app = ds.applications.find((a) => a.id === id);
  if (!app) return [];
  const base = runEngine(ds, overrides);
  const d0 = base.decisions[id];
  if (!d0 || d0.outcome === 'Approved') return [];
  // guessed or unreadable details: the only honest fix is a person confirming them
  if (d0.missing.length && d0.decidedBy === 'Data check') {
    const patch: AppPatch = {};
    for (const m of d0.missing) if (m.field === 'city' && typeof m.suggest === 'string') patch.city = m.suggest;
    return [{ text: `Confirm ${d0.missing.map((m) => m.label.toLowerCase()).join(', ')}${patch.city ? ` (the pin suggests ${patch.city})` : ''}`, patch: Object.keys(patch).length ? patch : undefined }];
  }
  const noOv: Overrides = { ...overrides };
  delete noOv[id]; // counterfactuals describe the engine's own logic
  const tier = d0.breakdown.length ? undefined : undefined;
  void tier;
  const approved = (d: Dataset) => runEngine(d, noOv).decisions[id]?.outcome === 'Approved';
  const t = ds.territories.find((x) => x.id === d0.territoryId) ?? ds.territories.find((x) => x.pins.includes(app.pin ?? ''));
  const tierN = t?.tier ?? 2;
  const minSize = CONFIG.tierMinSize[tierN];
  const out: Counterfactual[] = [];

  const spaceKnown = app.space === 'Owned' || app.space === 'Rented';
  const spacePatch: AppPatch = {
    space: spaceKnown ? app.space : 'Rented',
    floor: app.floor === 'Ground' || app.floor === 'Mall unit' ? app.floor : 'Ground',
    size: Math.max(app.size ?? 0, minSize),
  };
  const spaceLabel = `Ground-floor (or mall) space of at least ${minSize} sq ft, rented or owned`;
  const needsSpace = !spaceKnown || (app.size ?? 0) < minSize || app.floor === 'Upper' || app.floor === null || app.floor === 'Not known';

  const investSearch = (d: Dataset, cur: number): number | null => {
    for (let k = 1; k <= 150; k++) if (approved(patchApp(d, id, { investment: Math.round((cur + k) * 10) / 10 }))) return k;
    return null;
  };
  const launchSearch = (d: Dataset, cur: number): number | null => {
    for (let k = 1; k <= 8; k++) if (approved(patchApp(d, id, { launchMonths: cur + k }))) return k;
    return null;
  };

  // single fixes
  if (needsSpace && approved(patchApp(ds, id, spacePatch))) out.push({ text: `${spaceLabel}${!spaceKnown ? ' (a confirmed space)' : ''}`, patch: spacePatch });
  const inv = app.investment ?? 0;
  const ik = investSearch(ds, inv);
  if (ik !== null && (app.investment === null || ik <= 100)) out.push({ text: `Investment capacity of ₹${Math.round((inv + ik) * 10) / 10} lakh (+₹${ik}L)`, patch: { investment: Math.round((inv + ik) * 10) / 10 } });
  if (app.launchMonths !== null) {
    const lk = launchSearch(ds, app.launchMonths);
    if (lk !== null) out.push({ text: `Target launch of ${app.launchMonths + lk} months instead of ${app.launchMonths}`, patch: { launchMonths: app.launchMonths + lk } });
  }
  if (app.pin && d0.outcome !== 'Decline') {
    const city = ds.territories.filter((x) => x.city === app.city);
    const pins = city.flatMap((x) => x.pins).filter((p) => p !== app.pin && !ds.stores.some((s) => s.pin === p));
    pins.sort((p, q) => pinDistance(app.pin as string, p) - pinDistance(app.pin as string, q));
    for (const p of pins.slice(0, 12)) {
      if (approved(patchApp(ds, id, { pin: p }))) {
        out.push({ text: `Space in pin ${p} (${ds.territories.find((x) => x.pins.includes(p))?.id}) instead of ${app.pin}`, patch: { pin: p } });
        break;
      }
    }
  }
  if (t && (d0.outcome === 'Waitlist' || d0.lostTo)) {
    for (let k = 1; k <= 2; k++) {
      if (approved(patchTerritory(ds, t.id, { slots: t.slots + k }))) {
        out.push({ text: `${t.id} gets ${k} more open slot${k > 1 ? 's' : ''} (${t.slots} → ${t.slots + k})`, territory: { id: t.id, slots: t.slots + k } });
        break;
      }
    }
  }

  // cumulative combination when no single change is enough
  if (!out.length) {
    let cur = ds;
    const labels: string[] = [];
    let patch: AppPatch = {};
    const steps: (() => boolean)[] = [
      () => {
        if (!needsSpace) return false;
        cur = patchApp(cur, id, spacePatch);
        patch = { ...patch, ...spacePatch };
        labels.push(spaceLabel);
        return true;
      },
      () => {
        const c = cur.applications.find((a) => a.id === id) as Application;
        const k = investSearch(cur, c.investment ?? 0);
        if (k === null) {
          const tm = t ? CONFIG.tierMinInvestment[t.tier] : 25;
          if ((c.investment ?? 0) >= tm) return false;
          cur = patchApp(cur, id, { investment: tm });
          patch = { ...patch, investment: tm };
          labels.push(`Investment capacity of at least ₹${tm} lakh`);
          return true;
        }
        const v = Math.round(((c.investment ?? 0) + k) * 10) / 10;
        cur = patchApp(cur, id, { investment: v });
        patch = { ...patch, investment: v };
        labels.push(`Investment capacity of ₹${v} lakh`);
        return true;
      },
      () => {
        const c = cur.applications.find((a) => a.id === id) as Application;
        const k = launchSearch(cur, c.launchMonths ?? 3);
        if (k === null) return false;
        cur = patchApp(cur, id, { launchMonths: (c.launchMonths ?? 3) + k });
        patch = { ...patch, launchMonths: (c.launchMonths ?? 3) + k };
        labels.push(`Target launch of ${(c.launchMonths ?? 3) + k} months`);
        return true;
      },
    ];
    let terr: Counterfactual['territory'];
    steps.push(() => {
      if (!t) return false;
      for (let k = 1; k <= 2; k++) {
        const nd = patchTerritory(cur, t.id, { slots: t.slots + k });
        if (approved(nd)) {
          cur = nd;
          terr = { id: t.id, slots: t.slots + k };
          labels.push(`${t.id} gets ${k} more open slot${k > 1 ? 's' : ''} (${t.slots} → ${t.slots + k})`);
          return true;
        }
      }
      return false;
    });
    for (const s of steps) {
      if (approved(cur) && labels.length) break;
      s();
      if (approved(cur)) break;
    }
    if (approved(cur) && labels.length) out.push({ text: labels.join(' + '), patch, territory: terr });
  }

  if (!out.length) {
    out.push({ text: d0.outcome === 'Decline' ? 'Not realistically fixable with a single change; a materially different application would be needed.' : 'No simple change flips this; the territory is full or the applicant would need to re-apply for another territory.' });
  }
  return out;
}

export function describePatchSummary(p: AppPatch): string {
  const bits: string[] = [];
  if (p.name) bits.push(`name ${p.name}`);
  if (p.city) bits.push(`city ${p.city}`);
  if (p.space) bits.push(`space ${p.space}`);
  if (p.floor) bits.push(`${p.floor} floor`);
  if (p.size != null) bits.push(`${p.size} sq ft`);
  if (p.investment != null) bits.push(`₹${p.investment} lakh`);
  if (p.launchMonths != null) bits.push(`launch in ${p.launchMonths} months`);
  if (p.pin) bits.push(`pin ${p.pin}`);
  if (p.experience != null) bits.push(`${p.experience} yrs experience`);
  if (p.language) bits.push(`language ${p.language}`);
  return bits.join(', ');
}
