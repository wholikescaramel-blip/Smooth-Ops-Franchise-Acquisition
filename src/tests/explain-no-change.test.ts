import { describe, expect, it } from 'vitest';
import { sampleDataset } from '../data/sample';
import { ask, getState, loadDataset } from '../state/store';

const lines = () => (getState().answer?.lines ?? []).join('\n');

describe('questions that change nothing say why', () => {
  it('an extra slot where someone is waiting moves them, and says so', () => {
    loadDataset(sampleDataset(), 'sample');
    ask('TER-04 now has 1 more slot');
    expect(lines()).toMatch(/APP-008: Waitlist → Redirect/);
  });

  it('an extra slot where nobody is waiting explains that slots were not the problem', () => {
    loadDataset(sampleDataset(), 'sample');
    ask('TER-09 now has 1 more slot'); // Davanagere: 1 slot, none used, nobody waiting
    const out = lines();
    expect(out).toMatch(/nobody there was waiting for a slot/);
    expect(out).toMatch(/What is actually holding back the applicants in Davanagere/);
    expect(out).toMatch(/APP-016/);
    expect(getState().answer?.tone).toBe('info');
  });

  it('an update that changes nothing says why the applicant stays where they are', () => {
    loadDataset(sampleDataset(), 'sample');
    ask('APP-016 now has ₹151 lakh'); // still held for the tiny upper-floor unit
    const out = lines();
    expect(out).toMatch(/No decision changed/);
    expect(out).toMatch(/APP-016 stays on Hold because/);
    expect(out).toMatch(/What would change it/);
  });
});
