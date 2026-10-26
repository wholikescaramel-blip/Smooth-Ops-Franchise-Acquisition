import { cityByName } from '../data/cityGeo';
import { CONFIG } from './config';
import { buildCtx, evaluate, pinDistance, whitespacePoints, type HoldKind, type Pre } from './evaluate';
import { findMissing } from './missing';
import { holdSteps, trainingPlan } from './plan';
import { OUTCOMES, type Application, type Dataset, type Decision, type EngineResult, type Outcome, type Overrides, type PinStatus, type Step, type Territory, type TerritoryResult } from './types';

const HOLD_SHORT: Record<HoldKind, string> = {
  location: 'location needs clarifying',
  'investment-missing': 'investment capacity is missing',
  'investment-near': 'a small investment gap',
  'space-none': 'no space identified yet',
  'space-contradiction': 'space details contradict each other',
  'space-size': 'space is below the minimum size',
  'space-size-missing': 'space size is missing',
  'space-floor': 'upper-floor space in a high-footfall area',
  launch: 'launch date is unrealistic without a space',
  score: 'score is below the approval bar',
  'notes-conflict': 'the notes contradict the form',
  'data-to-confirm': 'some details need confirming',
};
const DECLINE_SHORT = { investment: 'investment is below the tier minimum', score: 'score is below the minimum bar', duplicate: 'duplicate entry' } as const;

const rankOf = (p: Pre) => p.breakdown.find((b) => b.key === 'space')?.score ?? 0;
function compare(a: Pre, b: Pre): number {
  return (
    b.score - a.score ||
    rankOf(b) - rankOf(a) ||
    (b.app.investment ?? 0) - (a.app.investment ?? 0) ||
    (b.app.experience ?? 0) - (a.app.experience ?? 0) ||
    (a.app.launchMonths ?? 99) - (b.app.launchMonths ?? 99) ||
    a.app.id.localeCompare(b.app.id, undefined, { numeric: true })
  );
}

export function runEngine(ds: Dataset, overrides: Overrides = {}): EngineResult {
  try {
    return runInner(ds, overrides);
  } catch (e) {
    return fallbackResult(ds, (e as Error).message);
  }
}

function emptyDecision(a: Application): Decision {
  return {
    id: a.id, outcome: 'Hold', headline: 'On hold: engine could not evaluate this row', reasons: ['The engine hit an unexpected problem with this row; a human should review it.'],
    decidedBy: 'Engine safety net', score: 0, breakdown: [], territoryId: null, pin: a.pin, assignedPin: null, redirect: null, waitlistPos: null,
    conditions: [], flags: [...a.parseFlags], nextSteps: [{ text: 'Review this row manually and re-enter the details', when: 'This week' }], plan: null, trace: [], lostTo: null, overridden: null, missing: [],
  };
}

function fallbackResult(ds: Dataset, msg: string): EngineResult {
  const decisions: Record<string, Decision> = {};
  for (const a of ds.applications) {
    const d = emptyDecision(a);
    d.reasons.push(`Internal note: ${msg}`);
    decisions[a.id] = d;
  }
  return summarise(ds, decisions, [], new Map(), []);
}

function runInner(ds: Dataset, overrides: Overrides): EngineResult {
  const ctx = buildCtx(ds);
  const pres = new Map<string, Pre>();
  for (const a of ds.applications) {
    try {
      pres.set(a.id, evaluate(a, ds, ctx));
    } catch {
      /* handled below with the safety-net decision */
    }
  }
  const appById = new Map(ds.applications.map((a) => [a.id, a]));
  const terrById = new Map(ds.territories.map((t) => [t.id, t]));
  const approvedPins = new Map<string, string>(); // pin → app id
  const terrCount = new Map<string, number>();
  const result = new Map<string, Decision>();
  const forcedApproved = new Set<string>();
  const forcedOther = new Map<string, Outcome>();
  const rejectedOverride = new Map<string, string>();

  const idx = (id: string) => ds.applications.findIndex((a) => a.id === id);
  const partnerDist = (app: Application, pin: string, exceptId?: string) => {
    const ds2: number[] = [];
    for (const [p, id] of approvedPins) if (id !== exceptId && cityOfPin(p, appById.get(id)) === app.city) ds2.push(pinDistance(p, pin));
    return ds2.length ? Math.min(...ds2) : null;
  };
  const cityOfPin = (_p: string, a?: Application) => a?.city;

  const seat = (a: Application, pre: Pre, t: Territory, pin: string) => {
    approvedPins.set(pin, a.id);
    terrCount.set(t.id, (terrCount.get(t.id) ?? 0) + 1);
    void pre;
  };

  /* ---- overrides first: forced non-approvals leave the pool, forced approvals are pre-seated if legal ---- */
  const ovIds = Object.keys(overrides).filter((id) => appById.has(id)).sort((a, b) => idx(a) - idx(b));
  for (const id of ovIds) {
    const o = overrides[id];
    const a = appById.get(id) as Application;
    const pre = pres.get(id);
    if (!pre) continue;
    if (o.outcome !== 'Approved') {
      forcedOther.set(id, o.outcome);
      continue;
    }
    const pin = a.pin;
    const t = pin ? ctx.pinTerr.get(pin) : undefined;
    let why = '';
    if (!pin || !t) why = 'the pin is not inside any territory';
    else if (ctx.storeByPin.has(pin)) why = `pin ${pin} already has store ${ctx.storeByPin.get(pin)}`;
    else if (approvedPins.has(pin)) why = `pin ${pin} is already held by ${approvedPins.get(pin)}`;
    else if ((terrCount.get(t.id) ?? 0) >= t.slots) why = `${t.id} has no open slot left`;
    if (why) rejectedOverride.set(id, `Override to Approved was not applied because ${why}. The one-store-per-pin and slot limits cannot be overridden.`);
    else {
      seat(a, pre, t as Territory, pin as string);
      forcedApproved.add(id);
    }
  }

  /* ---- allocation ---- */
  const pool = [...pres.values()].filter((p) => p.status === 'eligible' && !forcedApproved.has(p.app.id) && !forcedOther.has(p.app.id));
  const terrOrder = [...ds.territories].sort((a, b) => CONFIG.priorityRank[a.priority] - CONFIG.priorityRank[b.priority] || a.id.localeCompare(b.id, undefined, { numeric: true }));
  const losers: { pre: Pre; kind: 'pin' | 'slots' | 'spacing'; to: string | null; rank: number }[] = [];
  const allocScore = new Map<string, number>();
  const allocNotes = new Map<string, string[]>();
  const rankIn = new Map<string, { rank: number; of: number }>();
  for (const t of terrOrder) {
    const ranked = pool.filter((p) => p.territory?.id === t.id).sort(compare);
    ranked.forEach((p, i) => rankIn.set(p.app.id, { rank: i + 1, of: ranked.length }));
    for (const p of ranked) {
      const a = p.app;
      const pin = a.pin as string;
      const holder = approvedPins.get(pin);
      if (holder) {
        losers.push({ pre: p, kind: 'pin', to: holder, rank: rankIn.get(a.id)?.rank ?? 0 });
        continue;
      }
      if ((terrCount.get(t.id) ?? 0) >= t.slots) {
        const first = [...approvedPins.entries()].find(([, id]) => pres.get(id)?.territory?.id === t.id)?.[1] ?? null;
        losers.push({ pre: p, kind: 'slots', to: first, rank: rankIn.get(a.id)?.rank ?? 0 });
        continue;
      }
      const pd = partnerDist(a, pin);
      if (pd !== null && pd <= CONFIG.minSpacing) {
        const near = [...approvedPins.entries()].find(([pp, id]) => appById.get(id)?.city === a.city && pinDistance(pp, pin) === pd)?.[1] ?? null;
        losers.push({ pre: p, kind: 'spacing', to: near, rank: rankIn.get(a.id)?.rank ?? 0 });
        continue;
      }
      let sc = p.score;
      const notes: string[] = [];
      if (pd !== null) {
        const eff = p.storeDist === null ? pd : Math.min(pd, p.storeDist);
        const pen = Math.max(0, whitespacePoints(p.storeDist) - whitespacePoints(eff));
        if (pen > 0.05) {
          sc = Math.round((sc - pen) * 10) / 10;
          const near = [...approvedPins.entries()].find(([pp, id]) => appById.get(id)?.city === a.city && pinDistance(pp, pin) === pd)?.[1];
          notes.push(`Cannibalisation warning: only ${pd} pin-steps from approved partner ${near}; score reduced by ${pen.toFixed(1)} to ${sc}.`);
        }
      }
      allocScore.set(a.id, sc);
      allocNotes.set(a.id, notes);
      seat(a, p, t, pin);
    }
  }

  /* ---- redirects & waitlist for everyone who qualified but did not get a seat ---- */
  const toPlace: { pre: Pre; kind: 'pin' | 'slots' | 'spacing' | 'store' | 'no-territory' | 'forced'; to: string | null; rank: number }[] = [
    ...losers,
    ...[...pres.values()].filter((p) => p.status === 'redirect' && !forcedApproved.has(p.app.id) && !forcedOther.has(p.app.id)).map((p) => ({ pre: p, kind: (p.redirectKind === 'store-pin' ? 'store' : p.redirectKind === 'no-territory' ? 'no-territory' : 'spacing') as 'store' | 'no-territory' | 'spacing', to: null as string | null, rank: 0 })),
    ...[...forcedOther.entries()].filter(([, o]) => o === 'Redirect' || o === 'Waitlist').map(([id]) => ({ pre: pres.get(id) as Pre, kind: 'forced' as const, to: null as string | null, rank: 0 })),
  ].sort((x, y) => compare(x.pre, y.pre));

  const suggested = new Set<string>();
  const reserved = new Map<string, number>(); // each suggestion softly reserves one slot so it is never offered twice
  const applicantsAt = new Map<string, number>();
  for (const a of ds.applications) if (a.pin) applicantsAt.set(a.pin, (applicantsAt.get(a.pin) ?? 0) + 1);
  const allPartnerDist = (city: string | null, pin: string) => {
    const ds2: number[] = [];
    for (const s of ds.stores) if (s.city === city) ds2.push(pinDistance(s.pin, pin));
    for (const [p, id] of approvedPins) if (appById.get(id)?.city === city) ds2.push(pinDistance(p, pin));
    return ds2.length ? Math.min(...ds2) : 99;
  };
  const findAlt = (a: Application, own: Territory | null): { t: Territory; pin: string } | null => {
    const cands = ds.territories
      .filter((t) => t.city === a.city)
      .sort((x, y) => Number(y.id === own?.id) - Number(x.id === own?.id) || CONFIG.priorityRank[x.priority] - CONFIG.priorityRank[y.priority] || x.id.localeCompare(y.id, undefined, { numeric: true }));
    for (const t of cands) {
      if (t.slots - (terrCount.get(t.id) ?? 0) - (reserved.get(t.id) ?? 0) <= 0) continue;
      const free = t.pins
        .filter((p) => !ctx.storeByPin.has(p) && !approvedPins.has(p) && !suggested.has(p) && p !== a.pin && allPartnerDist(a.city, p) > CONFIG.minSpacing)
        .sort((p, q) =>
          (applicantsAt.get(p) ?? 0) - (applicantsAt.get(q) ?? 0) ||
          (a.pin ? pinDistance(a.pin, p) - pinDistance(a.pin, q) : 0) ||
          p.localeCompare(q),
        );
      if (free.length) return { t, pin: free[0] };
    }
    return null;
  };

  type Placed = { outcome: 'Redirect' | 'Waitlist'; alt?: { t: Territory; pin: string }; waitT?: Territory | null; item: (typeof toPlace)[number] };
  const placed: Placed[] = [];
  for (const item of toPlace) {
    const a = item.pre.app;
    const own = item.pre.territory;
    const forcedWait = forcedOther.get(a.id) === 'Waitlist';
    const alt = forcedWait ? null : findAlt(a, own);
    if (alt) {
      suggested.add(alt.pin);
      reserved.set(alt.t.id, (reserved.get(alt.t.id) ?? 0) + 1);
      placed.push({ outcome: 'Redirect', alt, item });
    } else {
      const wt = own ?? ds.territories.filter((t) => t.city === a.city).sort((x, y) => CONFIG.priorityRank[x.priority] - CONFIG.priorityRank[y.priority])[0] ?? null;
      placed.push({ outcome: 'Waitlist', waitT: wt, item });
    }
  }
  const queue = new Map<string, number>();
  const waitPos = new Map<string, number>();
  for (const p of placed) {
    if (p.outcome !== 'Waitlist') continue;
    const key = p.waitT?.id ?? '-';
    const n = (queue.get(key) ?? 0) + 1;
    queue.set(key, n);
    waitPos.set(p.item.pre.app.id, n);
  }

  /* ---- build decisions ---- */
  const fmtS = (n: number) => `${n}`;
  for (const a of ds.applications) {
    const pre = pres.get(a.id);
    if (!pre) {
      result.set(a.id, emptyDecision(a));
      continue;
    }
    const base: Decision = {
      id: a.id, outcome: 'Hold', headline: '', reasons: [...pre.reasons], decidedBy: pre.decidedBy, score: pre.score, breakdown: pre.breakdown,
      territoryId: pre.territory?.id ?? null, pin: a.pin, assignedPin: null, redirect: null, waitlistPos: null, conditions: [...pre.conditions],
      flags: pre.flags, nextSteps: [], plan: null, trace: [...pre.trace], lostTo: null, overridden: null, missing: [],
    };
    const tier = pre.tier;
    const minSize = tier ? CONFIG.tierMinSize[tier] : 250;
    const seated = approvedPins.get(a.pin ?? '') === a.id;
    const pl = placed.find((x) => x.item.pre.app.id === a.id);

    if (seated) {
      const t = terrById.get(base.territoryId ?? '') ?? (a.pin ? ctx.pinTerr.get(a.pin) : undefined);
      const forced = forcedApproved.has(a.id);
      const sc = allocScore.get(a.id) ?? pre.score;
      base.outcome = 'Approved';
      base.score = sc;
      base.territoryId = t?.id ?? null;
      base.assignedPin = a.pin;
      base.decidedBy = forced ? 'Expansion-team override' : 'Allocation';
      const rk = rankIn.get(a.id);
      const rivals = losers.filter((l) => l.to === a.id).map((l) => l.pre);
      const beaten = rivals.filter((r) => r.app.pin === a.pin);
      base.reasons = [
        forced ? `Approved by the expansion team: ${overrides[a.id].reason}` : `Score ${fmtS(sc)}/100 clears the ${CONFIG.approveByPriority[t?.priority ?? 'Medium']} bar for ${t?.priority ?? 'Medium'}-priority territories${rk ? ` and ranks #${rk.rank} of ${rk.of} eligible in ${t?.id}` : ''}.`,
        `Gets pin ${a.pin} in ${t?.id}: ${(terrCount.get(t?.id ?? '') ?? 0)} of ${t?.slots} slot(s) used, and no other store or partner holds this pin.`,
        ...(beaten.length ? [`Won pin ${a.pin} over ${beaten.map((b) => `${b.app.id} (${b.score})`).join(', ')}.`] : []),
        ...(allocNotes.get(a.id) ?? []),
      ];
      base.headline = `Approved for ${t?.id} · pin ${a.pin}${base.conditions.length ? ' (with conditions)' : ''}`;
      base.trace.push(`Allocation: seated at ${a.pin} (${t?.id})`);
      if (tier && t) base.plan = trainingPlan(a, tier, t.id);
      base.nextSteps = approvedSteps(a, base, base.plan, minSize);
      if (forced) base.overridden = { outcome: 'Approved', reason: overrides[a.id].reason, applied: true, note: 'Override applied (pin and slot were free).' };
    } else if (forcedOther.has(a.id)) {
      const fo = forcedOther.get(a.id) as Outcome;
      base.outcome = fo;
      base.decidedBy = 'Expansion-team override';
      base.reasons = [`Set to ${fo} by the expansion team: ${overrides[a.id].reason}`, `Engine's own assessment was: ${pre.reasons[0]}`];
      base.overridden = { outcome: fo, reason: overrides[a.id].reason, applied: true, note: 'Override applied.' };
      if (pl && fo === 'Redirect' && pl.alt) {
        base.redirect = { territoryId: pl.alt.t.id, pin: pl.alt.pin };
        base.reasons.push(`Suggested alternative: pin ${pl.alt.pin} in ${pl.alt.t.id}.`);
      }
      if (fo === 'Waitlist') base.waitlistPos = waitPos.get(a.id) ?? null;
      base.headline = `${fo} (override): ${overrides[a.id].reason}`;
      base.nextSteps = otherSteps(fo, base, pre, minSize);
    } else if (pl) {
      const it = pl.item;
      const lostTo = it.to ? { id: it.to, kind: it.kind as 'pin' | 'slots' | 'spacing' } : null;
      const rival = it.to ? pres.get(it.to) : null;
      const reasons: string[] = [];
      if (it.kind === 'pin' && it.to) {
        reasons.push(`Qualified (score ${pre.score}/100), but ${it.to} (score ${allocScore.get(it.to) ?? rival?.score}) won pin ${a.pin}: only one store per pin code.`);
        base.lostTo = lostTo;
      } else if (it.kind === 'slots') {
        reasons.push(`Qualified (score ${pre.score}/100), but all ${pre.territory?.slots} slot(s) in ${pre.territory?.id} ${pre.territory?.slots === 0 ? 'are already closed (0 open)' : 'went to higher-ranked applicants'}.`);
        base.lostTo = lostTo;
      } else if (it.kind === 'spacing' && it.to) {
        reasons.push(`Qualified (score ${pre.score}/100), but pin ${a.pin} is within ${CONFIG.minSpacing} pin-step of newly approved partner ${it.to}; too close.`);
        base.lostTo = lostTo;
      } else {
        reasons.push(...pre.reasons.slice(0, 2));
      }
      if (pl.outcome === 'Redirect' && pl.alt) {
        base.outcome = 'Redirect';
        base.redirect = { territoryId: pl.alt.t.id, pin: pl.alt.pin };
        reasons.push(`Better fit: pin ${pl.alt.pin} in ${pl.alt.t.id} (${pl.alt.t.priority} priority, ${pl.alt.t.slots - (terrCount.get(pl.alt.t.id) ?? 0)} slot(s) open; held for this applicant if they accept) is free and meets minimum spacing.`);
        base.headline = `Redirect to pin ${pl.alt.pin} (${pl.alt.t.id})`;
        base.decidedBy = it.kind === 'store' ? 'Pin availability' : it.kind === 'no-territory' ? 'Territory match' : it.kind === 'spacing' ? 'White-space' : 'Allocation';
        base.trace.push(`Allocation: redirected to ${pl.alt.pin} (${pl.alt.t.id})`);
      } else {
        base.outcome = 'Waitlist';
        const pos = waitPos.get(a.id) ?? 1;
        base.waitlistPos = pos;
        base.territoryId = pl.waitT?.id ?? base.territoryId;
        reasons.push(`No other free pin with an open slot in ${a.city} right now, so they join the waitlist${pl.waitT ? ` for ${pl.waitT.id}` : ''} at position #${pos}; they move up if a slot or pin frees up or a competitor drops.`);
        base.headline = `Waitlisted #${pos}${pl.waitT ? ` for ${pl.waitT.id}` : ''}`;
        base.decidedBy = it.kind === 'store' ? 'Pin availability' : it.kind === 'slots' ? 'Territory capacity' : it.kind === 'pin' ? 'Allocation' : it.kind === 'spacing' ? 'White-space' : 'Territory match';
        base.trace.push(`Allocation: waitlist #${pos}`);
      }
      base.reasons = reasons;
      base.nextSteps = otherSteps(base.outcome, base, pre, minSize);
    } else if (pre.status === 'hold') {
      base.outcome = 'Hold';
      base.headline = `On hold: ${HOLD_SHORT[pre.holdKind as HoldKind] ?? 'needs more information'}`;
      base.nextSteps = holdSteps(pre, minSize);
    } else if (pre.status === 'decline') {
      base.outcome = 'Decline';
      base.headline = `Declined: ${DECLINE_SHORT[pre.declineKind ?? 'score']}`;
      base.nextSteps = otherSteps('Decline', base, pre, minSize);
    } else {
      // eligible but not seated and not placed: cannot happen; keep safe
      base.outcome = 'Hold';
      base.headline = 'On hold: awaiting allocation review';
      base.nextSteps = [{ text: 'Expansion team to review manually', when: 'This week' }];
    }
    if (rejectedOverride.has(a.id)) {
      base.reasons.push(rejectedOverride.get(a.id) as string);
      base.overridden = { outcome: 'Approved', reason: overrides[a.id].reason, applied: false, note: rejectedOverride.get(a.id) as string };
    }
    if (base.reasons.length === 0) base.reasons = ['See the decision trace for details.'];
    if (base.outcome === 'Hold') base.missing = findMissing(a, pre);
    result.set(a.id, base);
  }

  return summarise(ds, Object.fromEntries(result), terrOrder, approvedPins, [...pres.values()], { rankIn, allocScore, ctxStore: ctx.storeByPin, pool, losers });
}

function approvedSteps(a: Application, d: Decision, plan: Decision['plan'], minSize: number): Step[] {
  const m = plan?.milestones;
  const dw = (i: number, back = 0) => (m ? Math.max(0, m[i].dueWeek - back) : undefined);
  const wk = (i: number, back = 0) => (m ? `Week ${Math.max(1, m[i].week - back)}` : 'Early');
  const fin = a.investment !== null ? `₹${a.investment}L` : 'the stated investment';
  const s: Step[] = [
    { text: 'Submit ID proof, PAN and GST registration documents; complete KYC', when: wk(0, 1), dueWeek: dw(0, 1) },
    { text: `Provide proof of funds (bank statement or FD) covering ${fin}`, when: wk(0, 1), dueWeek: dw(0, 1) },
  ];
  if (a.space === 'Owned') s.push({ text: 'Submit ownership documents (sale deed, property-tax receipt) for legal verification', when: wk(1, 1), dueWeek: dw(1, 1) });
  else if (a.space === 'Rented') s.push({ text: 'Share the lease: draft goes to legal review (term ≥ 5 yrs, registered, landlord consent for signage)', when: wk(1, 1), dueWeek: dw(1, 1) });
  else s.push({ text: `Secure a ${minSize}+ sq ft ground-floor or mall space; share address, photos and owner contact`, when: wk(1, 1), dueWeek: dw(1, 1) });
  s.push({ text: 'Site inspection by the expansion team (footfall, frontage, size check)', when: wk(1), dueWeek: dw(1) });
  for (const c of d.conditions) if (!/Secure a/.test(c)) s.push({ text: c, when: 'Before fit-out', dueWeek: dw(3, 2) });
  s.push({ text: 'Sign the franchise agreement', when: wk(0), dueWeek: dw(0) });
  s.push({ text: 'Pay security deposit and initial franchise fee', when: wk(0), dueWeek: dw(0) });
  s.push({ text: `Start the ${plan?.track.split(' (')[0] ?? 'training'} programme in ${a.language} (six core modules)`, when: m ? `Week ${m[0].week}–${m[2].week}` : 'Week 2', dueWeek: dw(0) });
  s.push({ text: 'Brand fit-out: design approval, vendors, signage', when: m ? `Week ${m[1].week}–${m[3].week}` : 'Week 3+', dueWeek: dw(1) });
  s.push({ text: 'Initial stock order, POS and inventory set-up', when: m ? `Week ${m[3].week}–${m[4].week}` : 'Fit-out end', dueWeek: dw(3) });
  s.push({ text: 'Soft launch, then grand opening', when: m ? `Week ${m[5].week}–${m[6].week}` : 'End of plan', dueWeek: dw(5) });
  return s;
}
function otherSteps(o: Outcome, d: Decision, pre: Pre, minSize: number): Step[] {
  if (o === 'Waitlist') {
    return [
      { text: `Tell the applicant they are #${d.waitlistPos ?? 1} on the waitlist${d.territoryId ? ` for ${d.territoryId}` : ''} and why`, when: 'Within 2 days' },
      { text: 'Keep KYC and space documents ready so approval can be instant when a slot or pin frees up', when: 'While waiting' },
      { text: 'Expansion team to contact within 2 working days of a slot freeing up or a competitor dropping', when: 'On trigger' },
      ...(pre.holdKind ? holdSteps(pre, minSize).slice(0, 1) : []),
    ];
  }
  if (o === 'Redirect') {
    const r = d.redirect;
    return [
      { text: r ? `Offer the alternative: pin ${r.pin} in ${r.territoryId}; explain what changes (area, footfall, catchment)` : 'Offer the alternative location', when: 'Within 2 days' },
      { text: `Applicant to identify a ${minSize}+ sq ft ground-floor or mall space in the new pin (their current space does not carry over)`, when: 'Within 3–4 weeks' },
      { text: 'If declined, keep them on the waitlist for their original territory', when: 'Within 1 week of reply' },
    ];
  }
  if (o === 'Decline') {
    const k = pre.declineKind;
    return [
      { text: `Send a respectful decline note in ${pre.app.language}, with the specific reason`, when: 'Within 2 days' },
      k === 'investment'
        ? { text: `Invite re-application when capacity reaches ₹${pre.tier ? CONFIG.tierMinInvestment[pre.tier] : 25}L or more (or consider a lower-tier city)`, when: 'Re-apply any time' }
        : k === 'duplicate'
          ? { text: 'Merge with the original application and make sure only one record stays active', when: 'This week' }
          : { text: 'Share the scoring gaps and invite re-application once they are addressed', when: 'Re-apply in 3–6 months' },
    ];
  }
  return [{ text: 'Expansion team to follow up with the applicant', when: 'This week' }];
}

function summarise(
  ds: Dataset,
  decisions: Record<string, Decision>,
  terrOrder: Territory[],
  approvedPins: Map<string, string>,
  pres: Pre[],
  extra?: { rankIn: Map<string, { rank: number; of: number }>; allocScore: Map<string, number>; ctxStore: Map<string, string>; pool: Pre[]; losers: { pre: Pre; kind: string; to: string | null }[] },
): EngineResult {
  const counts = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<Outcome, number>;
  let flagCount = 0;
  for (const a of ds.applications) {
    const d = decisions[a.id];
    counts[d.outcome]++;
    flagCount += d.flags.filter((f) => f.severity !== 'info').length;
  }
  const order = ds.applications.map((a) => a.id);

  const terrResults: TerritoryResult[] = ds.territories.map((t) => {
    const approved = order.filter((id) => decisions[id].outcome === 'Approved' && decisions[id].territoryId === t.id);
    const ranking = pres
      .filter((p) => p.territory?.id === t.id && (p.status === 'eligible' || approved.includes(p.app.id)))
      .sort(compare)
      .map((p) => {
        const d = decisions[p.app.id];
        return { id: p.app.id, score: d.score, outcome: d.outcome, note: d.outcome === 'Approved' ? 'won a slot' : d.lostTo ? `lost to ${d.lostTo.id} on ${d.lostTo.kind}` : d.headline };
      });
    let winnerWhy = 'No approved applicants yet.';
    if (approved.length) {
      const w = approved[0];
      const ru = ranking.find((r) => r.outcome !== 'Approved');
      const ws = decisions[w].score;
      winnerWhy = ru
        ? `${w} leads: score ${ws} vs ${ru.id} at ${ru.score}${ws === ru.score ? ' (tie broken by space readiness → investment → experience → earliest ID)' : ''}.`
        : `${w} is the only eligible applicant for this territory.`;
    }
    return { territory: t, approved, filled: approved.length, ranking, winnerWhy };
  });

  const pinSet = new Map<string, { city: string; terr: string | null }>();
  for (const t of ds.territories) for (const p of t.pins) if (!pinSet.has(p)) pinSet.set(p, { city: t.city, terr: t.id });
  for (const s of ds.stores) if (!pinSet.has(s.pin)) pinSet.set(s.pin, { city: s.city, terr: null });
  const apps = new Map<string, string[]>();
  for (const a of ds.applications) if (a.pin && decisions[a.id].outcome !== 'Decline') apps.set(a.pin, [...(apps.get(a.pin) ?? []), a.id]);
  const storePins = new Map(ds.stores.map((s) => [s.pin, s.id]));
  const pins: PinStatus[] = [...pinSet.entries()].map(([pin, v]) => {
    const applicants = apps.get(pin) ?? [];
    const store = storePins.get(pin);
    const holder = approvedPins.get(pin) ?? null;
    const competing = applicants.filter((id) => ['Approved', 'Waitlist', 'Hold'].includes(decisions[id].outcome) || decisions[id].lostTo).length;
    const status: PinStatus['status'] = store ? 'blocked' : holder ? 'taken' : competing >= 2 ? 'contested' : 'available';
    return { pin, city: v.city, territoryId: v.terr, status, holder: store ?? holder, applicants };
  });

  const violations: string[] = [];
  const seenPin = new Map<string, string>();
  for (const a of ds.applications) {
    const d = decisions[a.id];
    if (d.outcome !== 'Approved') continue;
    if (!d.assignedPin) violations.push(`${a.id} approved without a pin`);
    else {
      if (seenPin.has(d.assignedPin)) violations.push(`${a.id} and ${seenPin.get(d.assignedPin)} share pin ${d.assignedPin}`);
      seenPin.set(d.assignedPin, a.id);
      if (storePins.has(d.assignedPin)) violations.push(`${a.id} approved on store pin ${d.assignedPin}`);
    }
  }
  for (const tr of terrResults) if (tr.filled > tr.territory.slots) violations.push(`${tr.territory.id} over capacity (${tr.filled}/${tr.territory.slots})`);
  void extra;
  void cityByName;

  return {
    decisions, order, territories: terrResults, pins, counts, flagCount,
    slotsFilled: terrResults.reduce((s, t) => s + t.filled, 0),
    slotsTotal: ds.territories.reduce((s, t) => s + t.slots, 0),
    invariantViolations: violations,
  };
}
