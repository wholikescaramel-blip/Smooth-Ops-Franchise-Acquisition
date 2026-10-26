import { CONFIG } from '../engine';
import { Card, SectionTitle } from './ui';

const W = CONFIG.weights;
const row = (k: string, v: string) => (
  <tr key={k} className="border-t border-hair"><td className="py-1.5 pr-3 text-muted">{k}</td><td className="py-1.5 text-right font-mono text-ink">{v}</td></tr>
);

export function RulesPanel() {
  return (
    <div className="space-y-3">
      <Card className="p-4">
        <SectionTitle>How the engine decides</SectionTitle>
        <p className="text-[15px] leading-snug text-body">Code decides; text only explains. One pure function turns the file and any overrides into decisions, so the same input always gives the same output. <b className="text-ink">Decline</b> means the applicant cannot fix it soon; <b className="text-ink">Hold</b> means they can.</p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-body">
          <li>Clean data and flag problems (nothing is dropped)</li>
          <li>Gates: duplicate · territory match · pin free of an existing store · minimum investment · notes vs form · space readiness</li>
          <li>Score out of 100 · approve bar depends on territory priority</li>
          <li>Allocate per territory, High priority first; one approved store per pin, ever</li>
          <li>Label, then next steps and training plan for Approved</li>
        </ol>
      </Card>
      <Card className="p-4">
        <SectionTitle>Assumed requirements (editable in config.ts)</SectionTitle>
        <table className="w-full text-xs"><tbody>
          {row('Minimum investment, Tier 1 / 2 / 3', `₹${CONFIG.tierMinInvestment[1]}L / ₹${CONFIG.tierMinInvestment[2]}L / ₹${CONFIG.tierMinInvestment[3]}L`)}
          {row('Near miss → Hold (else Decline)', `within ${Math.round(CONFIG.nearMissPct * 100)}%`)}
          {row('Minimum space, Tier 1 / 2 / 3', `${CONFIG.tierMinSize[1]} / ${CONFIG.tierMinSize[2]} / ${CONFIG.tierMinSize[3]} sq ft`)}
          {row('Approve bar: High / Medium / Low priority', `${CONFIG.approveByPriority.High} / ${CONFIG.approveByPriority.Medium} / ${CONFIG.approveByPriority.Low}`)}
          {row('Below this score → Decline', `${CONFIG.holdAt}`)}
          {row('No space: conditional approval needs launch ≥', `${CONFIG.noSpaceMinLaunchMonths} months`)}
          {row('Too close to a store / partner', `≤ ${CONFIG.minSpacing} pin-step (same city)`)}
          {row('Full white-space points from', `${CONFIG.fullSpacing} pin-steps`)}
        </tbody></table>
      </Card>
      <Card className="p-4">
        <SectionTitle>Score weights (100)</SectionTitle>
        <table className="w-full text-xs"><tbody>
          {row('Investment fit (vs typical capex)', `${W.investment}`)}
          {row('Experience & business relevance', `${W.experience}`)}
          {row('Space readiness & quality', `${W.space}`)}
          {row('Territory priority', `${W.priority}`)}
          {row('Timeline realism', `${W.timeline}`)}
          {row('White-space / cannibalisation', `${W.whitespace}`)}
          {row('Data-quality penalty', `−${CONFIG.dataQualityPenalty} per soft flag, max −${CONFIG.dataQualityCap}`)}
        </tbody></table>
      </Card>
      <Card className="p-4">
        <SectionTitle>Tie-breaks and fairness</SectionTitle>
        <p className="text-sm text-body">Score → space readiness → investment → experience → shorter timeline → earliest Application ID. Slots are never force-filled: an applicant below the bar stays on Hold or Declined even if slots are open.</p>
      </Card>
      <Card className="p-4">
        <SectionTitle>Geography is approximate</SectionTitle>
        <p className="text-sm text-body">Pins are placed at the city centre plus a deterministic offset from the last 3 digits. Spacing uses pin-number proximity, not road distance. A pin-to-coordinate table (<code>PIN_COORDS</code> in cityGeo.ts) overrides this wherever real coordinates are known.</p>
      </Card>
    </div>
  );
}
