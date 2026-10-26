export type Outcome = 'Approved' | 'Hold' | 'Waitlist' | 'Redirect' | 'Decline';
export const OUTCOMES: Outcome[] = ['Approved', 'Hold', 'Waitlist', 'Redirect', 'Decline'];
export type Space = 'Owned' | 'Rented' | 'Not yet identified';
export type Floor = 'Ground' | 'Upper' | 'Mall unit' | 'Not known';
export type Lang = 'Kannada' | 'English' | 'Hindi';
export type Priority = 'High' | 'Medium' | 'Low';
export type Tier = 1 | 2 | 3;

export interface Flag {
  code: string;
  severity: 'info' | 'warn' | 'error';
  message: string;
}

export interface Application {
  id: string; // unique key (duplicates get a #n suffix)
  label: string; // id as written in the file
  name: string;
  city: string | null;
  state: string;
  pin: string | null; // 6 digits when valid, otherwise null
  pinRaw: string;
  investment: number | null; // lakh
  experience: number | null;
  business: string;
  space: Space | null;
  size: number | null;
  floor: Floor | null;
  launchMonths: number | null;
  language: Lang;
  notes: string;
  parseFlags: Flag[]; // coercion issues found while reading the file
  /** Set when a confirmed update replaced a field the notes talked about, so stale notes stop raising conflicts. */
  notesSuperseded?: boolean;
}

export interface Territory {
  id: string;
  city: string;
  state: string;
  pins: string[];
  tier: Tier;
  slots: number;
  priority: Priority;
}

export interface Store {
  id: string;
  city: string;
  pin: string;
  opened: number;
}

export interface Dataset {
  applications: Application[];
  territories: Territory[];
  stores: Store[];
  warnings: string[];
}

export type AppPatch = Partial<
  Pick<Application, 'name' | 'investment' | 'space' | 'floor' | 'size' | 'launchMonths' | 'pin' | 'experience' | 'language' | 'city'>
>;

export interface Override {
  outcome: Outcome;
  reason: string;
  at: number;
}
export type Overrides = Record<string, Override>;

export interface FactorScore {
  key: string;
  label: string;
  score: number;
  max: number;
  note: string;
}

export interface Step {
  text: string;
  when: string; // suggested time frame
  /** Weeks from today (back-scheduled from the launch target); the UI turns this into a calendar date. */
  dueWeek?: number;
}

export interface Milestone {
  name: string;
  week: number; // week within the plan
  dueWeek: number; // weeks from today, back-scheduled from the launch date
  note?: string;
}

export interface TrainingPlan {
  track: string;
  language: Lang;
  modules: string[];
  milestones: Milestone[];
  totalWeeks: number;
  availableWeeks: number | null;
  /** Weeks from today to the opening date actually planned (re-dated when the target is too short). */
  openWeek: number;
  redated: boolean;
  feasibility: string;
}

/** A detail the engine will not guess. The UI turns each into a field to fill in. */
export type FixField = 'name' | 'city' | 'pin' | 'investment' | 'experience' | 'space' | 'size' | 'floor' | 'launchMonths' | 'language';
export interface Missing {
  field: FixField;
  label: string;
  why: string;
  suggest?: string | number;
}

export interface Decision {
  id: string;
  outcome: Outcome;
  headline: string;
  reasons: string[];
  decidedBy: string;
  score: number;
  breakdown: FactorScore[];
  territoryId: string | null;
  pin: string | null;
  assignedPin: string | null; // for Approved
  redirect: { territoryId: string; pin: string } | null;
  waitlistPos: number | null;
  conditions: string[];
  flags: Flag[];
  nextSteps: Step[];
  plan: TrainingPlan | null;
  trace: string[];
  lostTo: { id: string; kind: 'pin' | 'slots' | 'spacing' } | null;
  overridden: { outcome: Outcome; reason: string; applied: boolean; note: string } | null;
  /** Details to enter or confirm before this application can move forward (Hold only). */
  missing: Missing[];
}

export interface TerritoryResult {
  territory: Territory;
  approved: string[];
  filled: number;
  ranking: { id: string; score: number; outcome: Outcome; note: string }[];
  winnerWhy: string;
}

export interface PinStatus {
  pin: string;
  city: string;
  territoryId: string | null;
  status: 'blocked' | 'taken' | 'contested' | 'available';
  holder: string | null; // store id or application id
  applicants: string[];
}

export interface EngineResult {
  decisions: Record<string, Decision>;
  order: string[];
  territories: TerritoryResult[];
  pins: PinStatus[];
  counts: Record<Outcome, number>;
  flagCount: number;
  slotsFilled: number;
  slotsTotal: number;
  invariantViolations: string[];
}
