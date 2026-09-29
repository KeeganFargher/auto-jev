import type { HeroDefinitionId, SetupWant } from "@jev-game/game";
import type { UnitStatusKind } from "../../game/unit-status.js";
import {
  heroGlyph,
  METER_GLYPHS,
  STATUS_GLYPHS,
  WANT_GLYPHS,
  type MeterMetric,
} from "./glyph-maps.js";
import { BotSilhouette, HumanSilhouette } from "./icons.js";
import { Glyph } from "./svg.js";

export function HeroIcon({ heroId }: { heroId: HeroDefinitionId }) {
  return <Glyph d={heroGlyph(heroId)} />;
}

export function StatusIcon({ status }: { status: UnitStatusKind }) {
  return <Glyph d={STATUS_GLYPHS[status]} />;
}

export function WantIcon({ want }: { want: SetupWant }) {
  return <Glyph d={WANT_GLYPHS[want]} />;
}

export function MeterIcon({ metric }: { metric: MeterMetric }) {
  return <Glyph d={METER_GLYPHS[metric]} />;
}

export function SeatSilhouette({ human }: { human: boolean }) {
  return human ? <HumanSilhouette /> : <BotSilhouette />;
}
