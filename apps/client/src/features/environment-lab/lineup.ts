import { berserker, bubbleCleric, firebrand, harpooner, paladin } from "@jev-game/content";
import type { BoardCell, BoardSide, HeroDefinitionId } from "@jev-game/game";

export interface LineupMember {
  heroId: HeroDefinitionId;
  cell: BoardCell;
}

export interface Squad {
  side: BoardSide;
  color: string;
  members: readonly LineupMember[];
}

export const SQUADS: readonly Squad[] = [
  {
    side: "south",
    color: "#4ea1ff",
    members: [
      { heroId: paladin.id, cell: { column: 3, row: 0 } },
      { heroId: harpooner.id, cell: { column: 1, row: 2 } },
      { heroId: firebrand.id, cell: { column: 5, row: 3 } },
    ],
  },
  {
    side: "north",
    color: "#ff6b6b",
    members: [
      { heroId: berserker.id, cell: { column: 4, row: 0 } },
      { heroId: bubbleCleric.id, cell: { column: 2, row: 1 } },
      { heroId: harpooner.id, cell: { column: 6, row: 3 } },
    ],
  },
];
