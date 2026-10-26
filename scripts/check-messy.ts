import { readFileSync } from 'node:fs';
import { parseWorkbook, runEngine } from '../src/engine';

const buf = readFileSync('test-data/messy-applications.xlsx');
const res = parseWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
if (!res.dataset) throw new Error(res.error ?? 'no dataset');
const ds = res.dataset;
console.log('applications read:', ds.applications.length, '| territories read:', ds.territories.length);
console.log('file warnings:', ds.warnings);
const r = runEngine(ds);
console.log('counts:', r.counts, '| flags:', r.flagCount, '| violations:', r.invariantViolations);
for (const a of ds.applications) {
  const d = r.decisions[a.id];
  console.log(`${a.id.padEnd(9)} ${d.outcome.padEnd(9)} ${String(d.score).padStart(5)}  ${d.headline}`);
}
