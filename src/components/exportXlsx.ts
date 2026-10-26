import * as XLSX from 'xlsx';
import { counterfactuals, type Dataset, type EngineResult, type Overrides } from '../engine';

export function exportDecisions(ds: Dataset, result: EngineResult, overrides: Overrides) {
  const rows = ds.applications.map((a) => {
    const d = result.decisions[a.id];
    const cfs = d.outcome === 'Approved' ? [] : counterfactuals(ds, overrides, a.id).map((c) => c.text);
    return {
      'Application ID': a.label,
      'Tracked as': a.id,
      Applicant: a.name,
      City: a.city ?? '',
      Pin: a.pinRaw,
      Outcome: d.outcome,
      Score: d.score,
      Headline: d.headline,
      'Reasons': d.reasons.join(' | '),
      'Decided by': d.decidedBy,
      Territory: d.territoryId ?? '',
      'Assigned pin': d.assignedPin ?? '',
      'Suggested redirect': d.redirect ? `${d.redirect.pin} (${d.redirect.territoryId})` : '',
      'Waitlist position': d.waitlistPos ?? '',
      Conditions: d.conditions.join(' | '),
      'Flips to Approved if': cfs.join(' | '),
      'Next steps': d.nextSteps.map((s, i) => `${i + 1}. ${s.text} (${s.when})`).join('\n'),
      'Training plan': d.plan ? `${d.plan.track}; ${d.plan.language}; ${d.plan.modules.join(', ')}; ${d.plan.feasibility}` : '',
      'Milestones': d.plan ? d.plan.milestones.map((m) => `W${m.week} ${m.name}`).join(' → ') : '',
      'Needs input': d.missing.map((m) => m.label).join(', '),
      'Data-quality flags': d.flags.map((f) => f.message).join(' | '),
      Override: d.overridden ? `${d.overridden.outcome}: ${d.overridden.reason} (${d.overridden.applied ? 'applied' : 'not applied'})` : '',
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = Object.keys(rows[0] ?? { a: 1 }).map((k) => ({ wch: ['Reasons', 'Next steps', 'Training plan', 'Flips to Approved if', 'Data-quality flags', 'Headline'].includes(k) ? 60 : 16 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Decisions');
  const terr = result.territories.map((t) => ({ Territory: t.territory.id, City: t.territory.city, Priority: t.territory.priority, Slots: t.territory.slots, Filled: t.filled, Approved: t.approved.join(', '), 'Why': t.winnerWhy }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(terr), 'Territories');
  XLSX.writeFile(wb, 'franchise-decisions.xlsx');
}
