import { cityByName, cityByPrefix } from '../data/cityGeo';
import { CONFIG, GENERIC_RETAIL, SPECIFIC_RETAIL } from './config';
import { guessedBlockers } from './missing';
import type { Application, Dataset, FactorScore, Flag, Territory, Tier } from './types';

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const r1 = (x: number) => Math.round(x * 10) / 10;

export type HoldKind =
  | 'location' | 'investment-missing' | 'investment-near' | 'space-none' | 'space-contradiction'
  | 'space-size' | 'space-size-missing' | 'space-floor' | 'launch' | 'score' | 'notes-conflict' | 'data-to-confirm';

export interface Pre {
  app: Application;
  tier: Tier | null;
  territory: Territory | null;
  status: 'decline' | 'hold' | 'redirect' | 'eligible';
  redirectKind?: 'no-territory' | 'store-pin' | 'spacing';
  holdKind?: HoldKind;
  declineKind?: 'investment' | 'score' | 'duplicate';
  decidedBy: string;
  reasons: string[];
  conditions: string[];
  breakdown: FactorScore[];
  score: number;
  /** white-space distance (pin-space) to the nearest existing store in the same city */
  storeDist: number | null;
  flags: Flag[];
  trace: string[];
  /** investment (₹ lakh) shortfall vs tier minimum, when relevant */
  shortfall: number | null;
  conflicts?: string[];
}

/** Notes that contradict structured fields. Each message says what to confirm. */
export function notesConflicts(app: Application): string[] {
  const out: string[] = [];
  if (app.notesSuperseded) return out;
  const notes = `${app.business} ${app.notes}`.toLowerCase();
  const known = app.space === 'Owned' || app.space === 'Rented';
  if (app.experience === 0 || app.experience === null) {
    const c = claimsLongBusiness(app);
    if (c) out.push(`Experience is ${app.experience ?? 'blank'} years, but the business/notes describe ${c}. Confirm the real years of retail experience.`);
  }
  if (known && /(still|currently)?\s*(looking|searching|hunting) for (a |the )?(shop|space|unit|premises)|no (shop|space) yet|don'?t have (a )?(shop|space)|haven'?t (found|got)|not yet (signed|finali[sz]ed|identified)/.test(notes))
    out.push(`Space is marked ${app.space}, but the notes say the applicant is still looking or has not signed. Confirm whether the space is secured.`);
  if (app.space === 'Owned' && /\b(i )?(rent(ed)?|lease[ds]?|landlord)\b/.test(notes) && !/own/.test(notes))
    out.push('Space is marked Owned, but the notes mention renting or a landlord. Confirm Owned vs Rented.');
  if (app.space === 'Rented' && /\bowned (shop|property|space)\b|\bi own (the|a|this)\b/.test(notes))
    out.push('Space is marked Rented, but the notes say the applicant owns it. Confirm Owned vs Rented.');
  const m = notes.match(/(?:₹|rs\.?\s*)\s*(\d+(?:\.\d+)?)\s*(?:l\b|lakh|lac)|(\d+(?:\.\d+)?)\s*(?:l\b|lakhs?|lacs?)\b/);
  if (m && app.investment !== null) {
    const v = parseFloat(m[1] ?? m[2]);
    if (v > 0 && Math.abs(v - app.investment) / Math.max(v, app.investment) > 0.2)
      out.push(`Investment is ₹${app.investment}L on the form, but the notes mention ₹${v}L. Confirm the real capacity.`);
  }
  return out;
}

export interface Ctx {
  pinTerr: Map<string, Territory>;
  storeByPin: Map<string, string>;
  dupOf: Map<string, string>;
  sameName: Map<string, string>; // id → another id with the same name (any pin)
}

export function buildCtx(ds: Dataset): Ctx {
  const pinTerr = new Map<string, Territory>();
  for (const t of ds.territories) for (const p of t.pins) if (!pinTerr.has(p)) pinTerr.set(p, t);
  const storeByPin = new Map(ds.stores.map((s) => [s.pin, s.id]));
  const dupOf = new Map<string, string>();
  const seen = new Map<string, string>();
  for (const a of ds.applications) {
    if (!a.pin) continue;
    const k = `${a.name.toLowerCase().replace(/[^a-z0-9]/g, '')}|${a.pin}`;
    const first = seen.get(k);
    if (first) dupOf.set(a.id, first);
    else seen.set(k, a.id);
  }
  const sameName = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const a of ds.applications) {
    const k = a.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!k || k.startsWith('noname')) continue;
    const first = byName.get(k);
    if (first) {
      sameName.set(a.id, first);
      if (!sameName.has(first)) sameName.set(first, a.id);
    } else byName.set(k, a.id);
  }
  return { pinTerr, storeByPin, dupOf, sameName };
}

const pinNum = (p: string) => parseInt(p, 10);

/** Distance in pin-space (same city only). */
export function pinDistance(a: string, b: string): number {
  return Math.abs(pinNum(a) - pinNum(b));
}

export function whitespacePoints(dist: number | null): number {
  const W = CONFIG.weights.whitespace;
  if (dist === null) return W;
  if (dist <= CONFIG.minSpacing) return 0;
  return W * clamp((dist - CONFIG.minSpacing) / (CONFIG.fullSpacing - CONFIG.minSpacing));
}

function claimsLongBusiness(app: Application): string | null {
  const t = `${app.business} ${app.notes}`.toLowerCase();
  if (/\b\d+\s*\+?\s*(years|yrs|year|yr)\b/.test(t)) return 'a multi-year business';
  if (/chain|multi[- ]?store|\b(\d+|two|three|four|five|six|several|many)\s+(shops|stores|outlets|showrooms|branches)\b|decades?|family business|generations/.test(t))
    return 'a multi-store / long-running business';
  return null;
}

export function derivedFlags(app: Application, ds: Dataset, ctx: Ctx): Flag[] {
  const f: Flag[] = [...app.parseFlags];
  const add = (code: string, message: string, severity: Flag['severity'] = 'warn') => f.push({ code, message, severity });
  const city = cityByName(app.city);
  const t = city?.tier;
  if (!app.pin) add('pin-invalid', `Pin "${app.pinRaw || '(blank)'}" is not a valid 6-digit pin code.`, 'error');
  else {
    const byPrefix = cityByPrefix(app.pin);
    if (!byPrefix) add('pin-prefix-unknown', `Pin ${app.pin} is not in any serviceable city.`, 'error');
    else if (city && byPrefix.name !== city.name) add('pin-city-mismatch', `Pin ${app.pin} belongs to ${byPrefix.name} (${byPrefix.prefix}xxx) but the application says ${city.name}.`, 'error');
    if (!ctx.pinTerr.has(app.pin)) add('pin-no-territory', `Pin ${app.pin} is not covered by any territory.`);
    const st = ctx.storeByPin.get(app.pin);
    if (st) add('pin-store', `Pin ${app.pin} already has our store ${st}.`);
  }
  if (!city) add('city-missing', 'No serviceable city could be determined.', 'error');
  const none = app.space === null || app.space === 'Not yet identified';
  if (none && (app.size !== null || (app.floor && app.floor !== 'Not known')))
    add('space-contradiction', `Space is "not yet identified" but ${app.size !== null ? `a size of ${app.size} sq ft` : ''}${app.size !== null && app.floor && app.floor !== 'Not known' ? ' and ' : ''}${app.floor && app.floor !== 'Not known' ? `a ${app.floor} floor` : ''} is given.`);
  if (!none && app.size === null) add('size-missing', `Space is ${app.space} but the size is blank.`);
  if (!none && app.size !== null && app.size <= 0) add('size-zero', 'Space size is zero or negative.');
  if ((app.experience === null || app.experience === 0)) {
    const c = claimsLongBusiness(app);
    if (c) add('experience-mismatch', `Experience is ${app.experience ?? 'blank'} but the business/notes describe ${c}.`);
  }
  if (app.launchMonths !== null && app.launchMonths <= 1 && none) add('launch-unrealistic', `Launch in ${app.launchMonths} month with no space identified is unrealistic.`);
  if (app.launchMonths !== null && app.launchMonths <= 0) add('launch-zero', 'Target launch is zero or negative months.');
  if (app.investment === null) add('investment-missing', 'Investment capacity is missing.', 'error');
  else if (app.investment <= 0) add('investment-zero', 'Investment capacity is zero or negative.', 'error');
  else if (app.investment > CONFIG.implausibleInvestment) add('investment-implausible', `Investment of ₹${app.investment} lakh looks implausible (typo?).`);
  else if (t && app.investment < CONFIG.tierMinInvestment[t]) add('investment-low', `Investment ₹${app.investment}L is below the Tier ${t} minimum of ₹${CONFIG.tierMinInvestment[t]}L.`, 'info');
  const dup = ctx.dupOf.get(app.id);
  if (dup) add('duplicate', `Same name and pin as ${dup}; likely a duplicate application.`);
  const sameName = ctx.sameName.get(app.id);
  if (sameName && !dup) add('duplicate-name', `Same applicant name as ${sameName} but a different pin; check whether this is the same person applying twice.`);
  if (app.id !== app.label) {
    /* already flagged at parse as id-duplicate */
  }
  // de-dupe identical messages
  const seen = new Set<string>();
  return f.filter((x) => (seen.has(x.code + x.message) ? false : (seen.add(x.code + x.message), true)));
}

function relevanceOf(text: string): { pts: number; label: string } {
  const t = text.toLowerCase();
  const hit = SPECIFIC_RETAIL.find((k) => t.includes(k));
  if (hit) return { pts: 5, label: `relevant retail background ("${hit}")` };
  if (GENERIC_RETAIL.some((k) => t.includes(k))) return { pts: 3, label: 'general retail background' };
  return { pts: 0, label: 'no retail background mentioned' };
}

export function scoreApp(app: Application, tier: Tier, territory: Territory | null, storeDist: number | null, dqPenalty = 0): { score: number; breakdown: FactorScore[] } {
  const W = CONFIG.weights;
  // 1 investment
  const typical = CONFIG.typicalCapex[tier];
  const inv = app.investment ?? 0;
  const invPts = W.investment * clamp(inv / typical);
  // 2 experience
  const exp = app.experience ?? 0;
  const rel = relevanceOf(`${app.business} ${app.notes}`);
  const expPts = (W.experience - 5) * clamp(exp / 5) + rel.pts;
  // 3 space
  const minSize = CONFIG.tierMinSize[tier];
  const known = app.space === 'Owned' || app.space === 'Rented';
  let spPts = 0;
  let spNote = 'no space identified';
  if (known) {
    const own = app.space === 'Owned' ? 8 : 6;
    const fl = app.floor === 'Ground' ? 6 : app.floor === 'Mall unit' ? 5 : app.floor === 'Upper' ? 2 : 2;
    const sz = app.size && app.size > 0 ? 6 * clamp(app.size / (minSize * 1.5)) : 0;
    spPts = own + fl + sz;
    spNote = `${app.space}, ${app.floor ?? 'floor unknown'}, ${app.size ?? '?'} sq ft (Tier ${tier} min ${minSize})`;
  }
  // 4 priority
  const prio = territory?.priority ?? 'Medium';
  const prPts = CONFIG.priorityPoints[prio];
  // 5 timeline
  const need = (known ? 3 : 5) + ((app.experience ?? 0) === 0 ? 1 : 0);
  const tlPts = app.launchMonths === null ? W.timeline / 2 : W.timeline * clamp(app.launchMonths / need);
  // 6 whitespace
  const wsPts = whitespacePoints(storeDist);
  const bd: FactorScore[] = [
    { key: 'investment', label: 'Investment fit', score: r1(invPts), max: W.investment, note: app.investment === null ? 'investment missing' : `₹${inv}L vs typical Tier ${tier} capex ₹${typical}L` },
    { key: 'experience', label: 'Experience & relevance', score: r1(expPts), max: W.experience, note: `${exp} yr${exp === 1 ? '' : 's'}; ${rel.label}` },
    { key: 'space', label: 'Space readiness', score: r1(spPts), max: W.space, note: spNote },
    { key: 'priority', label: 'Territory priority', score: r1(prPts), max: W.priority, note: `${prio} priority${territory ? ` (${territory.id})` : ''}` },
    { key: 'timeline', label: 'Timeline realism', score: r1(tlPts), max: W.timeline, note: app.launchMonths === null ? 'launch not stated' : `${app.launchMonths} mo vs ~${need} mo needed` },
    { key: 'whitespace', label: 'White-space', score: r1(wsPts), max: W.whitespace, note: storeDist === null ? 'no existing store in this city' : `${storeDist} pin-steps from nearest store` },
  ];
  if (dqPenalty > 0) bd.push({ key: 'quality', label: 'Data-quality penalty', score: -dqPenalty, max: 0, note: `−${CONFIG.dataQualityPenalty} per soft flag (cap −${CONFIG.dataQualityCap})` });
  const score = Math.max(0, r1(bd.reduce((s, x) => s + x.score, 0)));
  return { score, breakdown: bd };
}

export function evaluate(app: Application, ds: Dataset, ctx: Ctx): Pre {
  const trace: string[] = [];
  const flags = derivedFlags(app, ds, ctx);
  const city = cityByName(app.city);
  const tier = city?.tier ?? null;
  const base = { app, flags, trace, conditions: [] as string[], breakdown: [] as FactorScore[], score: 0, storeDist: null as number | null, territory: null as Territory | null, shortfall: null as number | null };
  const done = (p: Partial<Pre> & Pick<Pre, 'status' | 'decidedBy' | 'reasons'>): Pre => ({ ...base, tier, ...p });
  const fmt = (n: number) => `₹${n}L`;

  // gate 0: duplicates
  const dup = ctx.dupOf.get(app.id);
  if (dup) {
    trace.push(`Gate 0 Duplicate check: FAIL (same name and pin as ${dup})`);
    return done({ status: 'decline', declineKind: 'duplicate', decidedBy: 'Duplicate check', reasons: [`Same applicant name and pin ${app.pin} as ${dup}; treated as a duplicate entry.`, `${dup} is evaluated on its own merits; this entry adds no new information.`] });
  }
  trace.push('Gate 0 Duplicate check: pass');

  // gate 0b: never approve on details we had to guess or could not read
  const guessed = guessedBlockers(app);
  if (guessed.length) {
    trace.push(`Gate 0b Data check: FAIL (${guessed.map((g) => g.field).join(', ')} need confirming)`);
    return done({
      status: 'hold',
      holdKind: 'data-to-confirm',
      decidedBy: 'Data check',
      reasons: [...guessed.map((g) => g.why), 'We do not guess missing or unreadable details, so this stays on hold until a person confirms them.'],
    });
  }
  trace.push('Gate 0b Data check: pass');

  // gate 1: territory match
  if (!city || tier === null) {
    trace.push('Gate 1 Territory match: FAIL (no serviceable city)');
    return done({ status: 'hold', holdKind: 'location', decidedBy: 'Territory match', reasons: [`We could not place this application in a serviceable city (city "${app.city ?? 'blank'}", pin "${app.pinRaw || 'blank'}").`, 'Serviceable cities: Bengaluru, Mysuru, Mangaluru, Hubballi-Dharwad, Belagavi, Tumakuru, Davanagere.'] });
  }
  const sameCity = ds.territories.filter((t) => t.city === city.name);
  if (!app.pin) {
    trace.push('Gate 1 Territory match: FAIL (pin not 6 digits)');
    return done({ status: 'hold', holdKind: 'location', decidedBy: 'Territory match', reasons: [`Pin "${app.pinRaw || '(blank)'}" is not a valid 6-digit pin code, so we cannot place the store.`, `Stated city is ${city.name}.`] });
  }
  const pcity = cityByPrefix(app.pin);
  if (!pcity || pcity.name !== city.name) {
    trace.push('Gate 1 Territory match: FAIL (pin prefix does not match city)');
    return done({ status: 'hold', holdKind: 'location', decidedBy: 'Territory match', reasons: [`Pin ${app.pin} is a ${pcity ? pcity.name : 'non-serviceable'} pin (${app.pin.slice(0, 3)}xxx) but the application says ${city.name} (${city.prefix}xxx).`, 'Location is ambiguous, so no territory or slot can be assigned until it is clarified.'] });
  }
  let territory = ctx.pinTerr.get(app.pin) ?? null;
  let redirectKind: Pre['redirectKind'];
  const reasons: string[] = [];
  let decidedBy = '';
  if (!territory) {
    if (!sameCity.length) {
      trace.push('Gate 1 Territory match: FAIL (no territory in city)');
      return done({ status: 'hold', holdKind: 'location', decidedBy: 'Territory match', reasons: [`Pin ${app.pin} is not in any territory, and there is no territory defined for ${city.name}.`] });
    }
    redirectKind = 'no-territory';
    decidedBy = 'Territory match';
    reasons.push(`Pin ${app.pin} is not covered by any territory; ${city.name} territories: ${sameCity.map((t) => t.id).join(', ')}.`);
    trace.push(`Gate 1 Territory match: pin ${app.pin} outside every territory → redirect candidate`);
  } else trace.push(`Gate 1 Territory match: pass (${app.pin} → ${territory.id})`);

  // gate 2: pin availability
  const storeId = ctx.storeByPin.get(app.pin);
  if (storeId) {
    redirectKind = 'store-pin';
    decidedBy = 'Pin availability';
    reasons.unshift(`Pin ${app.pin} already has our store ${storeId}; the brand never opens two stores in one pin code.`);
    trace.push(`Gate 2 Pin availability: BLOCKED by ${storeId} → redirect candidate`);
  } else trace.push('Gate 2 Pin availability: pass (no existing store)');

  // white-space distance to existing stores (same city)
  const sd = ds.stores.filter((s) => s.city === city.name && s.pin !== app.pin).map((s) => pinDistance(s.pin, app.pin as string));
  const storeDist = storeId ? 0 : sd.length ? Math.min(...sd) : null;
  if (!redirectKind && storeDist !== null && storeDist <= CONFIG.minSpacing) {
    const near = ds.stores.find((s) => s.city === city.name && pinDistance(s.pin, app.pin as string) === storeDist);
    redirectKind = 'spacing';
    decidedBy = 'White-space';
    reasons.unshift(`Pin ${app.pin} is only ${storeDist} pin-step from existing store ${near?.id} (${near?.pin}); minimum spacing is ${CONFIG.minSpacing + 1}, so it would cannibalise that store.`);
    trace.push(`White-space: too close to ${near?.id} → redirect candidate`);
  }
  const withTier = { ...base, tier, territory, storeDist };

  // gate 3: minimum investment
  const min = CONFIG.tierMinInvestment[tier];
  const inv = app.investment;
  const soft = flags.filter((f) => f.severity === 'warn').length;
  const dq = Math.min(CONFIG.dataQualityCap, soft * CONFIG.dataQualityPenalty);
  const sc = scoreApp(app, tier, territory, storeDist, dq);
  const bar = CONFIG.approveByPriority[territory?.priority ?? 'Medium'];
  const full = { ...withTier, score: sc.score, breakdown: sc.breakdown };
  const fin = (p: Partial<Pre> & Pick<Pre, 'status' | 'decidedBy' | 'reasons'>): Pre => ({ ...full, ...p });
  if (inv === null) {
    trace.push('Gate 3 Minimum investment: FAIL (missing)');
    return fin({ status: 'hold', holdKind: 'investment-missing', decidedBy: 'Minimum investment', reasons: ['Investment capacity is missing, so affordability cannot be assessed.', `Tier ${tier} needs at least ${fmt(min)}.`] });
  }
  if (inv <= 0 || inv < min * (1 - CONFIG.nearMissPct)) {
    trace.push(`Gate 3 Minimum investment: FAIL (${fmt(inv)} < ${fmt(min)})`);
    return fin({ status: 'decline', declineKind: 'investment', shortfall: min - inv, decidedBy: 'Minimum investment', reasons: [`Investment capacity is ${fmt(inv)}; ${city.name} is Tier ${tier}, which needs at least ${fmt(min)}.`, `The ${fmt(Math.round((min - inv) * 10) / 10)} gap is more than ${Math.round(CONFIG.nearMissPct * 100)}% of the minimum, so it cannot realistically be closed soon.`] });
  }
  if (inv < min) {
    trace.push(`Gate 3 Minimum investment: near miss (${fmt(inv)} vs ${fmt(min)})`);
    return fin({ status: 'hold', holdKind: 'investment-near', shortfall: min - inv, decidedBy: 'Minimum investment', reasons: [`Investment capacity is ${fmt(inv)}, just under the Tier ${tier} minimum of ${fmt(min)}.`, `Can you raise ${fmt(Math.round((min - inv) * 10) / 10)} more? That clears this gate.`] });
  }
  trace.push(`Gate 3 Minimum investment: pass (${fmt(inv)} ≥ ${fmt(min)})`);

  // gate 3b: notes that contradict the form → Hold with "confirm X" (the applicant can fix it)
  const conflicts = notesConflicts(app);
  if (conflicts.length) {
    trace.push(`Gate 3b Notes vs form: FAIL (${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''})`);
    return fin({ status: 'hold', holdKind: 'notes-conflict', conflicts, decidedBy: 'Notes vs form', reasons: [...conflicts, 'Please confirm which version is right; the decision recomputes straight away.'] });
  }
  trace.push('Gate 3b Notes vs form: pass');

  // gate 4: space readiness
  const minSize = CONFIG.tierMinSize[tier];
  const known = app.space === 'Owned' || app.space === 'Rented';
  const conditions: string[] = [];
  if (!known) {
    const contradiction = app.size !== null || (!!app.floor && app.floor !== 'Not known');
    if (contradiction) {
      trace.push('Gate 4 Space readiness: FAIL (contradictory)');
      return fin({ status: 'hold', holdKind: 'space-contradiction', decidedBy: 'Space readiness', reasons: [`Space is marked "not yet identified", yet the form gives ${app.size !== null ? `${app.size} sq ft` : ''}${app.size !== null && app.floor && app.floor !== 'Not known' ? ' and ' : ''}${app.floor && app.floor !== 'Not known' ? `a ${app.floor} floor` : ''}.`, 'We need to confirm whether a space is actually secured (owned or rented) before committing a slot.'] });
    }
    if (app.launchMonths !== null && app.launchMonths < CONFIG.noSpaceMinLaunchMonths) {
      trace.push(`Gate 4 Space readiness: FAIL (no space, launch ${app.launchMonths} mo)`);
      return fin({ status: 'hold', holdKind: app.launchMonths <= 1 ? 'launch' : 'space-none', decidedBy: 'Space readiness', reasons: [`No space identified and the target launch is ${app.launchMonths} month${app.launchMonths === 1 ? '' : 's'}; finding, signing and fitting out a shop takes longer.`, `We can only approve without a space if the launch window is at least ${CONFIG.noSpaceMinLaunchMonths} months and the profile is strong.`] });
    }
    conditions.push(`Secure a ${minSize}+ sq ft ground-floor or mall space in ${territory?.id ?? city.name} before signing the agreement`);
    trace.push('Gate 4 Space readiness: no space but launch window allows a conditional approval');
  } else {
    if (app.size === null || app.size <= 0) {
      trace.push('Gate 4 Space readiness: FAIL (size missing)');
      return fin({ status: 'hold', holdKind: 'space-size-missing', decidedBy: 'Space readiness', reasons: [`Space is ${app.space} but the size is blank, so we cannot check the Tier ${tier} minimum of ${minSize} sq ft.`] });
    }
    if (app.size < minSize) {
      trace.push(`Gate 4 Space readiness: FAIL (${app.size} < ${minSize})`);
      return fin({ status: 'hold', holdKind: 'space-size', decidedBy: 'Space readiness', reasons: [`Space is ${app.size} sq ft; Tier ${tier} needs ≥ ${minSize} sq ft.`, 'A larger unit (or an adjoining one) would clear this gate.'] });
    }
    if (app.floor === 'Upper' && territory?.priority === 'High') {
      trace.push('Gate 4 Space readiness: FAIL (upper floor in high-footfall territory)');
      return fin({ status: 'hold', holdKind: 'space-floor', decidedBy: 'Space readiness', reasons: [`Space is on an upper floor, but ${territory.id} is a High-priority (high-footfall) territory where walk-in visibility is essential.`, 'A ground-floor or mall-unit space would clear this gate.'] });
    }
    if (app.floor === 'Upper') conditions.push('Upper-floor unit: add street-level signage and a visibility plan');
    if (app.floor === 'Not known' || app.floor === null) conditions.push('Confirm which floor the space is on');
    trace.push(`Gate 4 Space readiness: pass (${app.space}, ${app.size} sq ft${app.floor ? ', ' + app.floor : ''})`);
  }

  // score band
  const R = [...reasons];
  const rated = sc.breakdown.filter((b) => b.max > 0);
  if (sc.score < CONFIG.holdAt) {
    trace.push(`Score ${sc.score} < ${CONFIG.holdAt}: Decline`);
    const weak = [...rated].sort((a, b) => a.score / a.max - b.score / b.max).slice(0, 2);
    return fin({ status: 'decline', declineKind: 'score', decidedBy: 'Overall score', reasons: [`Overall score is ${sc.score}/100, under the ${CONFIG.holdAt} minimum bar.`, `Weakest factors: ${weak.map((w) => `${w.label} ${w.score}/${w.max} (${w.note})`).join('; ')}.`], conditions });
  }
  if (sc.score < bar) {
    trace.push(`Score ${sc.score} in hold band (bar ${bar})`);
    const weak = [...rated].sort((a, b) => (b.max - b.score) - (a.max - a.score)).slice(0, 2);
    return fin({ status: 'hold', holdKind: 'score', decidedBy: 'Overall score', reasons: [`Overall score is ${sc.score}/100: above the ${CONFIG.holdAt} floor but below the ${bar} needed to approve in a ${territory?.priority ?? 'Medium'}-priority territory.`, `Biggest gaps: ${weak.map((w) => `${w.label} ${w.score}/${w.max} (${w.note})`).join('; ')}.`], conditions });
  }
  trace.push(`Score ${sc.score} ≥ ${bar}: eligible`);

  if (redirectKind) {
    return fin({ status: 'redirect', redirectKind, decidedBy, reasons: [...R, `Otherwise qualified: score ${sc.score}/100, investment ${fmt(inv)} clears the Tier ${tier} minimum.`], conditions, territory });
  }
  return fin({
    status: 'eligible', decidedBy: 'Overall score', conditions,
    reasons: [`Score ${sc.score}/100 clears the ${bar} approval bar for ${territory?.priority ?? 'Medium'}-priority territories; investment ${fmt(inv)} vs ${fmt(min)} minimum.`],
  });
}
