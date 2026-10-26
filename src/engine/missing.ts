import type { Application, Missing } from './types';
import type { Pre } from './evaluate';

const has = (app: Application, code: string) => app.parseFlags.find((f) => f.code === code);

/**
 * Details that were guessed or could not be read when the file was parsed. The engine never approves on these:
 * a person has to confirm them first.
 */
export function guessedBlockers(app: Application): Missing[] {
  const out: Missing[] = [];
  const c = has(app, 'city-unknown') ?? has(app, 'city-inferred');
  if (c) {
    const unknown = has(app, 'city-unknown');
    out.push({
      field: 'city',
      label: 'City',
      why: unknown
        ? `${unknown.message}${app.city ? ` The pin suggests ${app.city}, but we will not guess.` : ''}`
        : `The city was blank${app.city ? `; the pin suggests ${app.city}, but we will not guess` : ''}.`,
      suggest: app.city ?? undefined,
    });
  }
  const unreadable: [string, Missing['field'], string][] = [
    ['investment-unreadable', 'investment', 'Investment'],
    ['experience-unreadable', 'experience', 'Retail experience'],
    ['size-unreadable', 'size', 'Space size'],
    ['launch-unreadable', 'launchMonths', 'Target launch'],
    ['space-unknown', 'space', 'Space'],
    ['floor-unknown', 'floor', 'Floor'],
  ];
  for (const [code, field, label] of unreadable) {
    const f = has(app, code);
    if (f) out.push({ field, label, why: `${f.message} Enter the right value.` });
  }
  return out;
}

/** Everything a person could fill in to unblock a Hold. Other kinds of Hold (too small, score too low) are real-world gaps, not data entry. */
export function findMissing(app: Application, pre: Pre): Missing[] {
  const out: Missing[] = [...guessedBlockers(app)];
  const add = (m: Missing) => {
    if (!out.some((x) => x.field === m.field)) out.push(m);
  };
  const first = pre.reasons[0] ?? '';
  switch (pre.holdKind) {
    case 'location':
      if (!app.city) add({ field: 'city', label: 'City', why: first });
      add({ field: 'pin', label: 'Pin code', why: first });
      break;
    case 'investment-missing':
      add({ field: 'investment', label: 'Investment (₹ lakh)', why: first });
      break;
    case 'space-contradiction':
      add({ field: 'space', label: 'Space', why: first });
      add({ field: 'size', label: 'Space size (sq ft)', why: 'Confirm or clear the size.' });
      add({ field: 'floor', label: 'Floor', why: 'Confirm or clear the floor.' });
      break;
    case 'space-size-missing':
      add({ field: 'size', label: 'Space size (sq ft)', why: first });
      break;
    case 'notes-conflict':
      for (const c of pre.conflicts ?? []) {
        if (/^Experience/.test(c)) add({ field: 'experience', label: 'Retail experience (years)', why: c });
        else if (/^Space/.test(c)) add({ field: 'space', label: 'Space', why: c });
        else if (/^Investment/.test(c)) add({ field: 'investment', label: 'Investment (₹ lakh)', why: c });
      }
      break;
    default:
      break;
  }
  return out;
}
