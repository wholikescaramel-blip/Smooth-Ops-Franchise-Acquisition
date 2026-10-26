import * as XLSX from 'xlsx';
import { CITIES, cityByName, cityByPrefix, matchCity } from '../data/cityGeo';
import { EXISTING_STORES } from '../data/existingStores';
import type { Application, Dataset, Flag, Floor, Lang, Priority, Space, Territory, Tier } from './types';

type Row = unknown[];
const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const str = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const isBlank = (v: unknown) => v === null || v === undefined || String(v).trim() === '';

/** Coerce "25 lakh", "₹25L", "25.0", "1.2 cr" to a number. Returns null for blank/unreadable. */
export function toNumber(v: unknown): { value: number | null; coerced: boolean; bad: boolean } {
  if (isBlank(v)) return { value: null, coerced: false, bad: false };
  if (typeof v === 'number') return { value: Number.isFinite(v) ? v : null, coerced: false, bad: !Number.isFinite(v) };
  const s = String(v).toLowerCase().replace(/[₹,]/g, '').replace(/\brs\.?|\binr\b/g, '');
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return { value: null, coerced: false, bad: true };
  let n = parseFloat(m[0]);
  if (/\bcr(ore)?s?\b/.test(s)) n *= 100;
  return { value: n, coerced: true, bad: false };
}

export const FLOORS: Floor[] = ['Ground', 'Upper', 'Mall unit', 'Not known'];

export function toSpace(v: unknown): Space | null {
  const t = norm(v);
  if (!t) return null;
  if (t.includes('own')) return 'Owned';
  if (t.includes('rent') || t.includes('lease')) return 'Rented';
  if (t.includes('not') || t.includes('no') || t.includes('identif') || t.includes('none') || t === 'na' || t === 'tbd') return 'Not yet identified';
  return null;
}
export function toFloor(v: unknown): Floor | null {
  const t = norm(v);
  if (!t) return null;
  if (t.includes('ground') || t === 'gf' || t === 'g') return 'Ground';
  if (t.includes('mall')) return 'Mall unit';
  if (t.includes('upper') || t.includes('first') || t.includes('1st') || t.includes('second') || t.includes('floor1') || t.includes('terrace')) return 'Upper';
  if (t.includes('not') || t.includes('unknown') || t === 'na') return 'Not known';
  return null;
}
export function toLang(v: unknown): Lang | null {
  const t = norm(v);
  if (t.startsWith('kan')) return 'Kannada';
  if (t.startsWith('eng')) return 'English';
  if (t.startsWith('hin')) return 'Hindi';
  return null;
}
export function toPriority(v: unknown): Priority | null {
  const t = norm(v);
  if (t.startsWith('h')) return 'High';
  if (t.startsWith('m')) return 'Medium';
  if (t.startsWith('l')) return 'Low';
  return null;
}

/* ------------------------------------------------------------ header mapping */

type FieldMap<K extends string> = Partial<Record<K, number>>;
type Matcher<K extends string> = [K, (h: string) => boolean];

const APP_MATCHERS: Matcher<string>[] = [
  ['combined', (h) => h.includes('city') && h.includes('pin')],
  ['id', (h) => /^(application|app)(id|no|number|ref)?$/.test(h) || h === 'id' || h === 'applicationid'],
  ['name', (h) => h.includes('name')],
  ['investment', (h) => h.includes('invest') || h.includes('capacity') || h.includes('budget')],
  ['experience', (h) => h.includes('experience') || h.includes('exp')],
  ['business', (h) => h.includes('business') || h.includes('occupation')],
  ['size', (h) => h.includes('size') || h.includes('sqft') || h.includes('area')],
  ['space', (h) => h.includes('space') || h.includes('premise')],
  ['floor', (h) => h.includes('floor')],
  ['launch', (h) => h.includes('launch') || h.includes('opening') || h.includes('timeline')],
  ['language', (h) => h.includes('lang')],
  ['notes', (h) => h.includes('note') || h.includes('remark') || h.includes('comment')],
  ['pin', (h) => h.includes('pin') || h.includes('postal') || h.includes('zip')],
  ['city', (h) => h === 'city' || h.startsWith('city') || h === 'town'],
  ['state', (h) => h.includes('state')],
];
const TER_MATCHERS: Matcher<string>[] = [
  ['pins', (h) => h.includes('pin') || h.includes('postal')],
  ['id', (h) => h.includes('territoryid') || h === 'territory' || h === 'id' || h.includes('territoryno')],
  ['tier', (h) => h.includes('tier')],
  ['slots', (h) => h.includes('slot') || h.includes('open')],
  ['priority', (h) => h.includes('priority')],
  ['combined', (h) => h.includes('city') && h.includes('state')],
  ['city', (h) => h.startsWith('city') || h === 'town'],
  ['state', (h) => h.includes('state')],
];

function mapHeaders(row: Row, matchers: Matcher<string>[]): FieldMap<string> {
  const map: FieldMap<string> = {};
  const claimed = new Set<number>();
  // exact-ish matches first, in matcher order, so "Space size" is not captured as "space"
  for (const [key, fn] of matchers) {
    for (let i = 0; i < row.length; i++) {
      if (claimed.has(i)) continue;
      const h = norm(row[i]);
      if (!h) continue;
      if (fn(h)) {
        map[key] = i;
        claimed.add(i);
        break;
      }
    }
  }
  return map;
}

function findHeader(rows: Row[], matchers: Matcher<string>[], need: string[]): { idx: number; map: FieldMap<string> } | null {
  let best: { idx: number; map: FieldMap<string>; score: number } | null = null;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const map = mapHeaders(rows[i] ?? [], matchers);
    const score = Object.keys(map).length + need.filter((k) => map[k] !== undefined).length * 2;
    if (score >= 4 && (!best || score > best.score)) best = { idx: i, map, score };
  }
  return best;
}

/* ----------------------------------------------------------------- applications */

const flag = (code: string, message: string, severity: Flag['severity'] = 'warn'): Flag => ({ code, severity, message });

export function parseApplications(rows: Row[]): { apps: Application[]; warnings: string[] } {
  const warnings: string[] = [];
  const hdr = findHeader(rows, APP_MATCHERS, ['id', 'investment', 'space']);
  if (!hdr) {
    warnings.push('Could not recognise the header row of the Applications sheet.');
    return { apps: [], warnings };
  }
  const m = hdr.map;
  const cell = (r: Row, k: string) => (m[k] === undefined ? undefined : r[m[k] as number]);
  const apps: Application[] = [];
  const seenIds = new Map<string, number>();
  let n = 0;
  for (let ri = hdr.idx + 1; ri < rows.length; ri++) {
    const r = rows[ri] ?? [];
    if (r.every(isBlank)) continue;
    n++;
    const pf: Flag[] = [];
    let label = str(cell(r, 'id'));
    if (!label) {
      label = `ROW-${ri + 1}`;
      pf.push(flag('id-missing', `No Application ID on row ${ri + 1}; assigned ${label}.`));
    }
    let id = label;
    const prior = seenIds.get(label.toUpperCase()) ?? 0;
    seenIds.set(label.toUpperCase(), prior + 1);
    if (prior > 0) {
      id = `${label}#${prior + 1}`;
      pf.push(flag('id-duplicate', `Application ID ${label} appears more than once; this row is tracked as ${id}.`));
    }

    // city / state / pin (combined or separate)
    let cityTxt = str(cell(r, 'city'));
    let stateTxt = str(cell(r, 'state'));
    let pinTxt = str(cell(r, 'pin'));
    const comb = str(cell(r, 'combined'));
    if (comb) {
      const pm = comb.match(/\b\d{5,7}\b/);
      if (pm && !pinTxt) pinTxt = pm[0];
      const parts = comb.split(/[·•|,;/\n-]+/).map((s) => s.trim()).filter(Boolean);
      if (!cityTxt) cityTxt = parts.find((p) => matchCity(p)) ?? parts[0] ?? '';
      if (!stateTxt) stateTxt = parts.find((p) => /karnataka|ka\b/i.test(p)) ?? '';
    }
    // pin as number cell → digits
    const pinDigits = pinTxt.replace(/\D/g, '');
    let city = matchCity(cityTxt)?.name ?? null;
    if (!city && cityTxt) pf.push(flag('city-unknown', `City "${cityTxt}" is not in the serviceable list.`));
    if (!city && pinDigits.length === 6) {
      const inf = cityByPrefix(pinDigits);
      if (inf) {
        city = inf.name;
        pf.push(flag('city-inferred', `City was blank/unknown; inferred ${inf.name} from the pin prefix ${inf.prefix}.`, 'info'));
      }
    }
    const state = stateTxt || (city ? cityByName(city)?.state ?? '' : '');

    const inv = toNumber(cell(r, 'investment'));
    if (inv.bad) pf.push(flag('investment-unreadable', `Investment "${str(cell(r, 'investment'))}" could not be read as a number.`));
    let invVal = inv.value;
    if (invVal !== null && invVal >= 100000) {
      pf.push(flag('investment-rupees', `Investment ${invVal} looks like rupees; converted to ₹${invVal / 100000} lakh.`, 'info'));
      invVal = invVal / 100000;
    } else if (inv.coerced && typeof cell(r, 'investment') === 'string') {
      pf.push(flag('investment-coerced', `Investment "${str(cell(r, 'investment'))}" read as ₹${invVal} lakh.`, 'info'));
    }
    const exp = toNumber(cell(r, 'experience'));
    if (exp.bad) pf.push(flag('experience-unreadable', `Experience "${str(cell(r, 'experience'))}" could not be read as a number.`));
    const size = toNumber(cell(r, 'size'));
    if (size.bad) pf.push(flag('size-unreadable', `Space size "${str(cell(r, 'size'))}" could not be read as a number.`));
    const launch = toNumber(cell(r, 'launch'));
    if (launch.bad) pf.push(flag('launch-unreadable', `Target launch "${str(cell(r, 'launch'))}" could not be read as a number of months.`));

    const spaceRaw = str(cell(r, 'space'));
    const space = toSpace(spaceRaw);
    if (spaceRaw && !space) pf.push(flag('space-unknown', `Space value "${spaceRaw}" not recognised; treated as blank.`));
    const floorRaw = str(cell(r, 'floor'));
    const floor = toFloor(floorRaw);
    if (floorRaw && !floor) pf.push(flag('floor-unknown', `Floor value "${floorRaw}" not recognised; treated as blank.`));
    const langRaw = str(cell(r, 'language'));
    let language = toLang(langRaw);
    if (!language) {
      language = 'English';
      pf.push(flag('language-fallback', langRaw ? `Language "${langRaw}" is outside Kannada/English/Hindi; falling back to English.` : 'Preferred language is blank; falling back to English.', langRaw ? 'warn' : 'info'));
    }

    apps.push({
      id, label,
      name: str(cell(r, 'name')) || `(no name, row ${ri + 1})`,
      city, state,
      pin: pinDigits.length === 6 ? pinDigits : null,
      pinRaw: pinTxt,
      investment: invVal,
      experience: exp.value,
      business: str(cell(r, 'business')),
      space, size: size.value, floor,
      launchMonths: launch.value,
      language,
      notes: str(cell(r, 'notes')),
      parseFlags: pf,
    });
  }
  if (n === 0) warnings.push('The Applications sheet has a header but no data rows.');
  return { apps, warnings };
}

/* ------------------------------------------------------------------ territories */

export function parseTerritories(rows: Row[]): { territories: Territory[]; warnings: string[] } {
  const warnings: string[] = [];
  const hdr = findHeader(rows, TER_MATCHERS, ['pins', 'slots', 'priority']);
  if (!hdr) {
    warnings.push('Could not recognise the header row of the Territories sheet.');
    return { territories: [], warnings };
  }
  const m = hdr.map;
  const cell = (r: Row, k: string) => (m[k] === undefined ? undefined : r[m[k] as number]);
  const out: Territory[] = [];
  let n = 0;
  for (let ri = hdr.idx + 1; ri < rows.length; ri++) {
    const r = rows[ri] ?? [];
    if (r.every(isBlank)) continue;
    n++;
    const id = str(cell(r, 'id')) || `TER-${String(n).padStart(2, '0')}`;
    const cityTxt = str(cell(r, 'combined')) || str(cell(r, 'city'));
    const pins = Array.from(new Set((String(cell(r, 'pins') ?? '').match(/\d{6}/g) ?? [])));
    let ci = matchCity(cityTxt);
    if (!ci && pins.length) ci = cityByPrefix(pins[0]);
    if (!ci) {
      warnings.push(`Territory ${id}: city "${cityTxt}" not recognised; skipped from the map but kept in the list.`);
    }
    const tierN = toNumber(cell(r, 'tier')).value;
    let tier: Tier = (tierN === 1 || tierN === 2 || tierN === 3 ? tierN : ci?.tier ?? 2) as Tier;
    if (ci && tier !== ci.tier) {
      warnings.push(`Territory ${id}: tier ${tier} differs from the usual tier ${ci.tier} for ${ci.name}; using the sheet value.`);
    }
    const slots = toNumber(cell(r, 'slots'));
    if (slots.value === null) warnings.push(`Territory ${id}: open slots blank; treated as 0.`);
    const pr = toPriority(cell(r, 'priority'));
    if (!pr) warnings.push(`Territory ${id}: priority missing/unreadable; treated as Medium.`);
    if (!pins.length) warnings.push(`Territory ${id}: no 6-digit pin codes found.`);
    out.push({
      id,
      city: ci?.name ?? cityTxt,
      state: ci?.state ?? 'Karnataka',
      pins,
      tier,
      slots: Math.max(0, Math.floor(slots.value ?? 0)),
      priority: pr ?? 'Medium',
    });
  }
  if (n === 0) warnings.push('The Territories sheet has a header but no data rows.');
  return { territories: out, warnings };
}

/* ------------------------------------------------------------------- dataset */

export interface ParseResult {
  dataset: Dataset | null;
  error: string | null;
}

export function buildDataset(appRows: Row[], terRows: Row[]): ParseResult {
  const a = parseApplications(appRows);
  const t = parseTerritories(terRows);
  const warnings = [...a.warnings, ...t.warnings];
  if (!a.apps.length && !t.territories.length) {
    return { dataset: null, error: 'No applications or territories could be read from this file. Check that Sheet 1 is Applications and Sheet 2 is Territories, each with a header row.' };
  }
  const owner = new Map<string, string>();
  for (const ter of t.territories) {
    for (const pin of ter.pins) {
      const o = owner.get(pin);
      if (o && o !== ter.id) warnings.push(`Pin ${pin} is listed in both ${o} and ${ter.id}; ${o} is used and ${ter.id} ignores it. Remove it from one of them.`);
      else owner.set(pin, ter.id);
    }
  }
  if (!t.territories.length) warnings.push('No territories were found: every application will be held for location.');
  if (!a.apps.length) warnings.push('No applications were found.');
  return { dataset: { applications: a.apps, territories: t.territories, stores: EXISTING_STORES, warnings }, error: null };
}

export function parseWorkbook(buf: ArrayBuffer): ParseResult {
  try {
    const wb = XLSX.read(buf, { type: 'array' });
    const names = wb.SheetNames.filter((n) => !/gloss/i.test(n));
    if (!names.length) return { dataset: null, error: 'The workbook has no readable sheets.' };
    const rowsOf = (n: string): Row[] => XLSX.utils.sheet_to_json<Row>(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false });
    let appName = names.find((n) => /applic/i.test(n));
    let terName = names.find((n) => /territor/i.test(n));
    // header-content fallback, then sheet order
    if (!terName) terName = names.find((n) => n !== appName && !!findHeader(rowsOf(n), TER_MATCHERS, ['pins', 'slots', 'priority']) && /slot|priority/i.test(JSON.stringify(rowsOf(n).slice(0, 5))));
    if (!appName) appName = names.find((n) => n !== terName && /invest|space/i.test(JSON.stringify(rowsOf(n).slice(0, 5))));
    if (!appName) appName = names.find((n) => n !== terName) ?? names[0];
    if (!terName) terName = names.find((n) => n !== appName);
    const res = buildDataset(rowsOf(appName), terName ? rowsOf(terName) : []);
    if (res.dataset && !terName) res.dataset.warnings.push('No Territories sheet was found.');
    return res;
  } catch (e) {
    return { dataset: null, error: `This file could not be read as an Excel workbook (${(e as Error).message}). Please upload a .xlsx file.` };
  }
}

export { CITIES };
