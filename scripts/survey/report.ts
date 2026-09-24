import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { HeroRow, MatchupRow, PieceRow, RunSummary, TeamRow } from "./analysis.js";
import { percent, points, seconds, ticksToSeconds } from "./stats.js";

export const SUMMARY_VERSION = 1;

export interface SurveyParams {
  tiers: string[];
  mode: string;
  surveySeed: number;
  teamSize: number;
  sanitySeeds: number;
  mirrorSeeds: number;
  teamSeeds: number;
  confirmSeeds: number;
  pieceSeeds: number;
  runCount: number;
  roundCap: number;
  startingHealth: number;
  maxLossCost: number;
  seatCount: number;
}

export interface Flag {
  severity: "warn" | "info";
  text: string;
}

export interface SurveySummary {
  version: number;
  contentHash: string;
  paramsSignature: string;
  params: SurveyParams;
  heroWinRates: Record<string, number>;
  medianFightSeconds: number | null;
  p90FightSeconds: number | null;
  timeoutRate: number | null;
  southRate: number | null;
  pieceDeltas: Record<string, number>;
  heroAveragePlacement: Record<string, number>;
  flags: string[];
}

export interface SurveyReport {
  params: SurveyParams;
  contentHash: string;
  flags: Flag[];
  sanity: MatchupRow[];
  teams: MatchupRow[];
  confirmed: MatchupRow[];
  unconfirmedExtremes: number;
  heroes: HeroRow[];
  teamRows: TeamRow[];
  pieces: PieceRow[];
  runs: RunSummary | null;
  fight: { medianTicks: number; p90Ticks: number; timeoutRate: number } | null;
  southRate: number | null;
  medianDistinctOutcomes: number | null;
}

export function paramsSignature(params: SurveyParams): string {
  return JSON.stringify(params);
}

function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const lines = [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`];

  for (const row of rows) {
    lines.push(`| ${row.join(" | ")} |`);
  }

  return lines.join("\n");
}

function csv(headers: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  const escape = (value: string | number): string => {
    const text = String(value);

    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };

  return [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))].join("\n") + "\n";
}

function matchupTable(rows: readonly MatchupRow[]): string {
  return table(
    ["First", "Second", "Battles", "First score", "Distinct outcomes", "Median length", "Timeouts", "Failures"],
    rows.map((row) => [
      row.first,
      row.second,
      String(row.battles),
      percent(row.firstRate),
      String(row.distinctOutcomes),
      seconds(row.medianTicks),
      String(row.timeouts),
      String(row.failures),
    ]),
  );
}

function summarise(report: SurveyReport): SurveySummary {
  const heroWinRates: Record<string, number> = {};
  const pieceDeltas: Record<string, number> = {};
  const heroAveragePlacement: Record<string, number> = {};

  for (const hero of report.heroes) {
    heroWinRates[hero.heroId] = hero.swapWinRate;
  }

  for (const piece of report.pieces) {
    pieceDeltas[`${piece.heroId}:${piece.label}`] = piece.delta;
  }

  for (const hero of report.runs?.heroes ?? []) {
    heroAveragePlacement[hero.id] = hero.averagePlacement;
  }

  return {
    version: SUMMARY_VERSION,
    contentHash: report.contentHash,
    paramsSignature: paramsSignature(report.params),
    params: report.params,
    heroWinRates,
    medianFightSeconds: report.fight === null ? null : ticksToSeconds(report.fight.medianTicks),
    p90FightSeconds: report.fight === null ? null : ticksToSeconds(report.fight.p90Ticks),
    timeoutRate: report.fight?.timeoutRate ?? null,
    southRate: report.southRate,
    pieceDeltas,
    heroAveragePlacement,
    flags: report.flags.map((flag) => flag.text),
  };
}

function readSummary(path: string): SurveySummary | null {
  if (!existsSync(path)) {
    return null;
  }

  const parsed: SurveySummary = JSON.parse(readFileSync(path, "utf8"));

  return parsed.version === SUMMARY_VERSION ? parsed : null;
}

export function findPreviousSummary(outputRoot: string, params: SurveyParams): { directory: string; summary: SurveySummary } | null {
  if (!existsSync(outputRoot)) {
    return null;
  }

  const directories: string[] = [];

  for (const entry of readdirSync(outputRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      directories.push(entry.name);
    }
  }

  directories.sort().reverse();

  const signature = paramsSignature(params);

  for (const directory of directories) {
    const summary = readSummary(join(outputRoot, directory, "summary.json"));

    if (summary !== null && summary.paramsSignature === signature) {
      return { directory, summary };
    }
  }

  return null;
}

function comparisonSection(current: SurveySummary, previous: { directory: string; summary: SurveySummary } | null): string {
  if (previous === null) {
    return "No earlier survey with the same parameters to compare against.";
  }

  const lines: string[] = [`Compared with \`${previous.directory}\` (content ${previous.summary.contentHash}).`, ""];

  if (previous.summary.contentHash === current.contentHash) {
    lines.push("Content is unchanged since that survey, so any difference below would mean nondeterminism.", "");
  }

  const heroIds = [...new Set([...Object.keys(current.heroWinRates), ...Object.keys(previous.summary.heroWinRates)])].sort();
  const rows: string[][] = [];

  for (const heroId of heroIds) {
    const before = previous.summary.heroWinRates[heroId];
    const after = current.heroWinRates[heroId];

    if (before === undefined || after === undefined) {
      rows.push([heroId, before === undefined ? "new" : percent(before), after === undefined ? "gone" : percent(after), ""]);
    } else if (Math.abs(after - before) >= 0.005) {
      rows.push([heroId, percent(before), percent(after), points(after - before)]);
    }
  }

  if (rows.length === 0) {
    lines.push("Hero win rates: no change of half a point or more.");
  } else {
    lines.push(table(["Hero", "Before", "After", "Change"], rows));
  }

  const newFlags = current.flags.filter((flag) => !previous.summary.flags.includes(flag));
  const clearedFlags = previous.summary.flags.filter((flag) => !current.flags.includes(flag));

  lines.push("", `New flags: ${newFlags.length === 0 ? "none" : ""}`);

  for (const flag of newFlags) {
    lines.push(`- ${flag}`);
  }

  lines.push("", `Cleared flags: ${clearedFlags.length === 0 ? "none" : ""}`);

  for (const flag of clearedFlags) {
    lines.push(`- ${flag}`);
  }

  return lines.join("\n");
}

function renderMarkdown(report: SurveyReport, comparison: string): string {
  const { params } = report;
  const sections: string[] = [];

  sections.push(
    "# Balance survey",
    "",
    `Content ${report.contentHash}. Mode ${params.mode}, tiers ${params.tiers.join(", ")}, survey seed ${params.surveySeed}.`,
    "",
    "The survey reports numbers, not verdicts. Flags are things to be aware of; nothing is tuned automatically.",
  );

  sections.push("", "## Flags", "");

  if (report.flags.length === 0) {
    sections.push("None.");
  } else {
    for (const flag of report.flags) {
      sections.push(`- **${flag.severity}**: ${flag.text}`);
    }
  }

  sections.push("", "## Changes since the last survey", "", comparison);

  if (report.fight !== null) {
    sections.push(
      "",
      "## Fight length (team round-robin)",
      "",
      `Median ${seconds(report.fight.medianTicks)}, 90th percentile ${seconds(report.fight.p90Ticks)}, timeouts ${percent(report.fight.timeoutRate)}. Target: 25–40 s median, 90% under 50 s, timeouts under 2%.`,
    );
  }

  if (report.southRate !== null || report.medianDistinctOutcomes !== null) {
    sections.push("", "## Symmetry and variance", "");

    if (report.southRate !== null) {
      sections.push(`- South side scores ${percent(report.southRate)} across all battles (50% means no side bias).`);
    }

    if (report.medianDistinctOutcomes !== null) {
      sections.push(
        `- A matchup has a median of ${report.medianDistinctOutcomes} distinct outcomes across its seeds. With only a handful, seeds barely change fights and the win-rate noise estimates don't mean much yet.`,
      );
    }
  }

  if (report.heroes.length > 0) {
    sections.push(
      "",
      "## Heroes (team round-robin)",
      "",
      "\"One swap\" is the balance number: it pits teams that differ by exactly one hero against each other, so across heroes it averages 50% and a gap means one hero beats another. \"Only one side\" counts matchups where just one team has the hero, which rewards heroes that make a varied team. \"Every copy\" counts each copy in every battle and always averages 50%. Draws count as half a win.",
      "",
      table(
        ["Hero", "One swap", "Only one side", "Every copy", "Hero-battles", "Damage per fight", "Death rate", "Signature casts per fight", "First signature"],
        report.heroes.map((hero) => [
          hero.heroId,
          percent(hero.swapWinRate),
          percent(hero.exclusiveWinRate),
          percent(hero.winRate),
          String(hero.battles),
          hero.damagePerAppearance.toFixed(0),
          percent(hero.deathRate),
          hero.signatureCastsPerAppearance.toFixed(2),
          hero.firstSignatureTick === null ? "never" : seconds(hero.firstSignatureTick),
        ]),
      ),
    );
  }

  if (report.teamRows.length > 0) {
    const shown = report.teamRows.length <= 12 ? report.teamRows : [...report.teamRows.slice(0, 6), ...report.teamRows.slice(-6)];

    sections.push(
      "",
      report.teamRows.length <= 12 ? "## Teams" : "## Best and worst teams",
      "",
      table(
        ["Team", "Win rate", "Battles"],
        shown.map((row) => [row.team, percent(row.winRate), String(row.battles)]),
      ),
    );
  }

  if (report.confirmed.length > 0 || report.unconfirmedExtremes > 0) {
    sections.push(
      "",
      "## Hard counters (confirmed at the larger seed count)",
      "",
      report.confirmed.length === 0 ? "None survived confirmation." : matchupTable(report.confirmed),
    );

    if (report.unconfirmedExtremes > 0) {
      sections.push("", `${report.unconfirmedExtremes} more extreme matchups were over the confirmation cap and weren't re-run.`);
    }
  }

  if (report.pieces.length > 0) {
    sections.push(
      "",
      "## Pieces, one change at a time",
      "",
      "Change in win rate when one copy of the hero carries the piece, against the same opponents and seeds. Legendaries and tier-3 talents are allowed to be rare power spikes, so they're held to a looser line.",
      "",
      table(
        ["Piece", "Kind", "Hero", "Change", "Pairs"],
        report.pieces.map((piece) => [
          piece.label,
          piece.rarePowerSpike ? `${piece.category}, rare spike` : piece.category,
          piece.heroId,
          points(piece.delta),
          String(piece.pairs),
        ]),
      ),
    );
  }

  if (report.sanity.length > 0) {
    sections.push("", "## Sanity pass (1v1)", "", matchupTable(report.sanity));
  }

  if (report.runs !== null) {
    const { runs } = report;

    sections.push(
      "",
      "## Full runs",
      "",
      `${runs.runs} runs with ${params.seatCount} random bot seats: health ${params.startingHealth}, a loss costs 1 + surviving enemies up to ${params.maxLossCost}, round cap ${params.roundCap}. Finished ${runs.finished}, stalled ${runs.stalled}, aborted ${runs.aborted}. Median length ${runs.medianRounds} rounds, longest ${runs.maxRounds}.`,
      "",
      "Placement numbers for late pieces (tier-3 talents, legendaries) are flattered: only seats that survive long enough ever see them.",
      "",
      "Heroes, by average placement (1 is best):",
      "",
      table(
        ["Hero", "Pick rate", "Average placement", "Win rate when picked"],
        runs.heroes.map((row) => [row.id, percent(row.pickRate), row.averagePlacement.toFixed(2), percent(row.winRate)]),
      ),
    );

    if (runs.eliminationRounds.length > 0) {
      const sorted = [...runs.eliminationRounds].sort((x, y) => x - y);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      const reachedNine = runs.eliminationRounds.filter((round) => round >= 9).length / runs.eliminationRounds.length;

      sections.push(
        "",
        `Eliminated seats go out at a median of round ${median}; ${percent(reachedNine)} of them lasted to round 9 or later.`,
      );
    }

    const pickTables: [string, typeof runs.heroes][] = [
      ["Talents and upgrades", runs.upgrades],
      ["Items", runs.items],
      ["Runes", runs.runes],
    ];

    for (const [title, rows] of pickTables) {
      if (rows.length === 0) {
        continue;
      }

      sections.push(
        "",
        `${title}, by average placement:`,
        "",
        table(
          ["Piece", "Pick rate", "Average placement", "Win rate when picked"],
          rows.map((row) => [row.id, percent(row.pickRate), row.averagePlacement.toFixed(2), percent(row.winRate)]),
        ),
      );
    }
  }

  const notable = [...report.sanity, ...report.teams].filter((row) => row.notable.length > 0);

  if (notable.length > 0) {
    sections.push("", "## Battles worth watching", "", "Replay any of these with `pnpm survey replay <first> <second> <seed> <south|north>`.", "");

    for (const row of notable.slice(0, 20)) {
      for (const battle of row.notable) {
        sections.push(`- ${row.first} vs ${row.second}, seed ${battle.seed}, first team ${battle.firstSouth ? "south" : "north"}: ${battle.outcome}`);
      }
    }
  }

  return sections.join("\n") + "\n";
}

export function writeReport(outputRoot: string, directoryName: string, report: SurveyReport): string {
  const summary = summarise(report);
  const previous = findPreviousSummary(outputRoot, report.params);
  const directory = join(outputRoot, directoryName);

  mkdirSync(directory, { recursive: true });

  writeFileSync(join(directory, "report.md"), renderMarkdown(report, comparisonSection(summary, previous)));
  writeFileSync(join(directory, "summary.json"), JSON.stringify(summary, null, 2) + "\n");

  const matchupHeaders = ["tier", "first", "second", "battles", "first_score", "south_score", "distinct_outcomes", "median_ticks", "mutual_eliminations", "timeouts", "failures", "budget_trips", "combos"];

  const matchupRows = [...report.sanity, ...report.teams, ...report.confirmed].map((row) => [
    row.tier,
    row.first,
    row.second,
    row.battles,
    row.firstRate.toFixed(4),
    row.southRate.toFixed(4),
    row.distinctOutcomes,
    row.medianTicks,
    row.mutualEliminations,
    row.timeouts,
    row.failures,
    row.budgetTrips,
    row.combos,
  ]);

  writeFileSync(join(directory, "matchups.csv"), csv(matchupHeaders, matchupRows));

  writeFileSync(
    join(directory, "heroes.csv"),
    csv(
      ["hero", "swap_win_rate", "one_side_win_rate", "win_rate", "hero_battles", "damage_per_fight", "death_rate", "signature_casts_per_fight", "first_signature_ticks"],
      report.heroes.map((hero) => [
        hero.heroId,
        hero.swapWinRate.toFixed(4),
        hero.exclusiveWinRate.toFixed(4),
        hero.winRate.toFixed(4),
        hero.battles,
        hero.damagePerAppearance.toFixed(1),
        hero.deathRate.toFixed(4),
        hero.signatureCastsPerAppearance.toFixed(3),
        hero.firstSignatureTick === null ? "" : hero.firstSignatureTick.toFixed(1),
      ]),
    ),
  );

  if (report.pieces.length > 0) {
    writeFileSync(
      join(directory, "pieces.csv"),
      csv(
        ["piece", "hero", "delta", "pairs"],
        report.pieces.map((piece) => [piece.label, piece.heroId, piece.delta.toFixed(4), piece.pairs]),
      ),
    );
  }

  if (report.runs !== null) {
    writeFileSync(
      join(directory, "runs.csv"),
      csv(
        ["kind", "id", "picks", "pick_rate", "average_placement", "win_rate"],
        [
          ...report.runs.heroes.map((row) => ["hero", row.id, row.picks, row.pickRate.toFixed(4), row.averagePlacement.toFixed(3), row.winRate.toFixed(4)]),
          ...report.runs.upgrades.map((row) => ["upgrade", row.id, row.picks, row.pickRate.toFixed(4), row.averagePlacement.toFixed(3), row.winRate.toFixed(4)]),
          ...report.runs.items.map((row) => ["item", row.id, row.picks, row.pickRate.toFixed(4), row.averagePlacement.toFixed(3), row.winRate.toFixed(4)]),
          ...report.runs.runes.map((row) => ["rune", row.id, row.picks, row.pickRate.toFixed(4), row.averagePlacement.toFixed(3), row.winRate.toFixed(4)]),
        ],
      ),
    );
  }

  return directory;
}
