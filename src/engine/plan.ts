import type { Step } from './types';
import { CONFIG } from './config';
import type { HoldKind, Pre } from './evaluate';
import { guessedBlockers } from './missing';

import { trainingPlan } from './training';
export { trainingPlan };

const L = (n: number) => `₹${Math.round(n * 10) / 10}L`;

export function holdSteps(pre: Pre, tierMinSize: number): Step[] {
  const k: HoldKind | undefined = pre.holdKind;
  const s: Step[] = [];
  switch (k) {
    case 'location':
      s.push({ text: 'Confirm the correct city and 6-digit pin code for the proposed store (call or WhatsApp the applicant)', when: 'This week' });
      s.push({ text: 'Re-run placement once the pin is corrected; the engine will assign a territory automatically', when: 'Within 2 days of reply' });
      break;
    case 'investment-missing':
      s.push({ text: 'Collect the applicant’s investment capacity with proof of funds', when: 'Within 1 week' });
      break;
    case 'investment-near':
      s.push({ text: `Ask whether the applicant can raise ${L(pre.shortfall ?? 0)} more (partner, loan, phased payment) and collect proof`, when: 'Within 2 weeks' });
      break;
    case 'space-none':
    case 'launch':
      s.push({ text: `Applicant to identify a ground-floor or mall unit of ${tierMinSize}+ sq ft; send address, photos and owner contact`, when: 'Within 3–4 weeks' });
      s.push({ text: 'Share the space-search checklist and local broker contacts; schedule a site visit', when: 'This week' });
      if (k === 'launch') s.push({ text: 'Reset the target launch to at least 4 months (or confirm a space within 2 weeks)', when: 'This week' });
      break;
    case 'space-contradiction':
      s.push({ text: 'Confirm whether a space is actually secured; if so update Space to Owned/Rented and share the lease or ownership paper', when: 'Within 1 week' });
      break;
    case 'space-size-missing':
      s.push({ text: 'Get the carpet-area size (sq ft) of the proposed space', when: 'Within 1 week' });
      break;
    case 'space-size':
      s.push({ text: `Find a larger unit (≥ ${tierMinSize} sq ft) or an adjoining unit to merge`, when: 'Within 3–4 weeks' });
      break;
    case 'space-floor':
      s.push({ text: 'Find a ground-floor or mall-unit space in this territory (upper floors lose walk-ins in high-footfall areas)', when: 'Within 3–4 weeks' });
      break;
    case 'data-to-confirm':
      for (const m of pre.app.parseFlags.length ? guessedBlockers(pre.app) : []) s.push({ text: `Confirm ${m.label.toLowerCase()}: ${m.why}`, when: 'Within 1 week' });
      break;
    case 'notes-conflict':
      for (const c of pre.conflicts ?? []) s.push({ text: c.replace(/\. Confirm/, ' → confirm'), when: 'Within 1 week' });
      break;
    case 'score':
      s.push({ text: 'Walk the applicant through their weakest scoring factors and agree what to strengthen', when: 'Within 1 week' });
      s.push({ text: 'Expansion team re-review after the applicant updates their details', when: 'In 2 weeks' });
      break;
    default:
      s.push({ text: 'Clarify the open points with the applicant', when: 'This week' });
  }
  s.push({ text: 'Update the application here; the decision recomputes instantly and may move to Approved', when: 'On reply' });
  return s;
}
