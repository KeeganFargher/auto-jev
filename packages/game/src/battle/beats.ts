import type { Beat } from "./events.js";

export const CAST_SLOW: Beat = { kind: "slow", rate: 0.3, ticks: 4 };

export const HAMMER_SLOW: Beat = { kind: "slow", rate: 0.25, ticks: 4 };

export const HAMMER_FREEZE: Beat = { kind: "freeze", seconds: 0.1 };

export const EXPLOSION_FREEZE: Beat = { kind: "freeze", seconds: 0.06 };

export const YANK_FREEZE: Beat = { kind: "freeze", seconds: 0.06 };

export const CRIT_FREEZE: Beat = { kind: "freeze", seconds: 0.04 };

export const COMBO_FREEZE: Beat = { kind: "freeze", seconds: 0.08 };

export const RAMPAGE_FREEZE: Beat = { kind: "freeze", seconds: 0.08 };

export const HAMMER_SLOW_LEAD_TICKS = 10;
