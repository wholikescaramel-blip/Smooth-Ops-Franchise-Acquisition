import { describe, expect, it } from 'vitest';
import { sampleDataset } from '../data/sample';
import { buildDataset, patchApp, runEngine } from '../engine';

const H = ['Application ID', 'Applicant name', 'City · State · Pin code', 'Investment capacity (₹ lakh)', 'Retail experience (years)', 'Current / past business', 'Space available', 'Space size (sq ft)', 'Floor', 'Target launch (months)', 'Preferred language', 'Notes from applicant'];
const T = [
  ['Territory ID', 'City · State', 'Pin codes covered', 'City tier', 'Open slots', 'Priority'],
  ['TER-04', 'Mysuru · Karnataka', '570001, 570023', 'Tier 2', 2, 'Medium'],
  ['TER-05', 'Mysuru · Karnataka', '570023', 'Tier 2', 1, 'Low'],
];
const good = ['APP-1', 'Asha', 'Mysuru · Karnataka · 570001', 60, 4, 'apparel retail', 'Rented', 400, 'Ground', 4, 'English', ''];
const build = (rows: unknown[][]) => buildDataset([H, ...rows], T).dataset!;

describe('the engine never approves on guessed or unreadable details', () => {
  it('a clean row is approved (control)', () => {
    const r = runEngine(build([good]));
    expect(r.decisions['APP-1'].outcome).toBe('Approved');
    expect(r.decisions['APP-1'].missing).toEqual([]);
  });

  it('an unknown city is held and the pin-based guess is only a suggestion', () => {
    const ds = build([['APP-2', 'Ravi', 'Atlantis · Karnataka · 570001', 60, 4, 'apparel', 'Rented', 400, 'Ground', 4, 'English', '']]);
    const d = runEngine(ds).decisions['APP-2'];
    expect(d.outcome).toBe('Hold');
    expect(d.decidedBy).toBe('Data check');
    expect(d.missing.map((m) => m.field)).toContain('city');
    expect(d.missing.find((m) => m.field === 'city')?.suggest).toBe('Mysuru');
  });

  it('confirming the city by hand clears the hold and the decision is recomputed', () => {
    const ds = build([['APP-2', 'Ravi', 'Atlantis · Karnataka · 570001', 60, 4, 'apparel', 'Rented', 400, 'Ground', 4, 'English', '']]);
    const fixed = runEngine(patchApp(ds, 'APP-2', { city: 'Mysuru' }));
    expect(fixed.decisions['APP-2'].outcome).toBe('Approved');
    expect(fixed.decisions['APP-2'].missing).toEqual([]);
  });

  it('unreadable numbers are held, not silently treated as zero or blank', () => {
    const ds = build([['APP-3', 'Mala', 'Mysuru · Karnataka · 570023', 'abc', 4, 'apparel', 'Rented', 400, 'Ground', 4, 'English', '']]);
    const d = runEngine(ds).decisions['APP-3'];
    expect(d.outcome).toBe('Hold');
    expect(d.missing.map((m) => m.field)).toContain('investment');
    expect(runEngine(patchApp(ds, 'APP-3', { investment: 60 })).decisions['APP-3'].outcome).toBe('Approved');
  });

  it('a Hold for a blank investment lists exactly what to enter', () => {
    const d = runEngine(build([['APP-4', 'Nina', 'Mysuru · Karnataka · 570001', null, 4, 'apparel', 'Rented', 400, 'Ground', 4, 'English', '']])).decisions['APP-4'];
    expect(d.outcome).toBe('Hold');
    expect(d.missing.map((m) => m.field)).toEqual(['investment']);
  });

  it('a pin in two territories is reported for the whole file', () => {
    const ds = build([good]);
    expect(ds.warnings.join(' ')).toMatch(/570023 is listed in both TER-04 and TER-05/);
  });

  it('every approved pin really is listed in its territory', () => {
    const ds = sampleDataset();
    const r = runEngine(ds);
    for (const a of ds.applications) {
      const d = r.decisions[a.id];
      if (d.outcome !== 'Approved') continue;
      const t = ds.territories.find((x) => x.id === d.territoryId)!;
      expect(t.pins).toContain(d.assignedPin);
    }
  });
});
