export type LineMoment = "pick" | "cast" | "death" | "win";

export interface LineRules {
  interrupts: boolean;
  globalGapMs: number;
  heroGapMs: number;
  friendlyChance: number;
  enemyChance: number;
}

export const LINE_RULES: Readonly<Record<LineMoment, LineRules>> = {
  pick: { interrupts: true, globalGapMs: 0, heroGapMs: 0, friendlyChance: 1, enemyChance: 1 },
  win: { interrupts: true, globalGapMs: 0, heroGapMs: 0, friendlyChance: 1, enemyChance: 0 },
  death: { interrupts: false, globalGapMs: 1500, heroGapMs: 0, friendlyChance: 0.9, enemyChance: 0.35 },
  cast: { interrupts: false, globalGapMs: 4000, heroGapMs: 12000, friendlyChance: 0.5, enemyChance: 0.2 },
};

export interface LineState {
  busyUntil: number;
  lastLineAt: number | undefined;
  heroLastAt: ReadonlyMap<string, number>;
}

export type LineSkipReason = "busy" | "gap" | "hero-gap" | "chance";

export type LineDecision = { kind: "play"; interrupt: boolean } | { kind: "skip"; reason: LineSkipReason };

export function decideLine(moment: LineMoment, heroId: string, friendly: boolean, state: LineState, now: number, roll: number): LineDecision {
  const rules = LINE_RULES[moment];
  const busy = now < state.busyUntil;

  if (busy && !rules.interrupts) {
    return { kind: "skip", reason: "busy" };
  }

  if (state.lastLineAt !== undefined && now - state.lastLineAt < rules.globalGapMs) {
    return { kind: "skip", reason: "gap" };
  }

  const heroLast = state.heroLastAt.get(heroId);

  if (heroLast !== undefined && now - heroLast < rules.heroGapMs) {
    return { kind: "skip", reason: "hero-gap" };
  }

  if (roll >= (friendly ? rules.friendlyChance : rules.enemyChance)) {
    return { kind: "skip", reason: "chance" };
  }

  return { kind: "play", interrupt: busy };
}
