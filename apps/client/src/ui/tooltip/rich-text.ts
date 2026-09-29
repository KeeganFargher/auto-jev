import type { UnitStatusKind } from "../../game/unit-status.js";

export type RichPart =
  | { kind: "text"; text: string }
  | { kind: "number"; text: string }
  | { kind: "status"; text: string; status: UnitStatusKind };

const STATUS_WORDS: ReadonlyMap<string, UnitStatusKind> = new Map<string, UnitStatusKind>([
  ["primed", "primed"],
  ["burning", "burning"],
  ["floating", "floating"],
  ["airborne", "airborne"],
  ["downed", "downed"],
  ["frozen", "frozen"],
  ["stunned", "stunned"],
]);

const TOKEN_PATTERN =
  /([+\-−×]?\d+(?:\.\d+)?(?:%|×| s\b| cells?\b| HP\b| mana\b)?|\b(?:primed|burning|floating|airborne|downed|frozen|stunned)\b)/gi;

export function parseRichText(text: string): RichPart[] {
  const parts: RichPart[] = [];
  let cursor = 0;

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const token = match[0];
    const start = match.index;

    if (start > cursor) {
      parts.push({ kind: "text", text: text.slice(cursor, start) });
    }

    const status = STATUS_WORDS.get(token.toLowerCase());

    parts.push(
      status === undefined
        ? { kind: "number", text: token }
        : { kind: "status", text: token, status },
    );

    cursor = start + token.length;
  }

  if (cursor < text.length) {
    parts.push({ kind: "text", text: text.slice(cursor) });
  }

  return parts;
}
