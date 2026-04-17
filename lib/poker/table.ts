// Table positioning logic.
// Ported from PokerTrainer-3.1/src/app/global-utility.service.ts (buildTablePositionsProperties + helpers)

import type { PlayerSeat, PokerAction, TableConfigOverride } from "./types";

const RING_BY_SIZE: Record<number, string[]> = {
  2: ["BB", "SB"],
  3: ["BB", "SB", "BTN"],
  4: ["BB", "SB", "BTN", "CO"],
  5: ["BB", "SB", "BTN", "CO", "HJ"],
  6: ["BB", "SB", "BTN", "CO", "HJ", "LJ"],
  7: ["BB", "SB", "BTN", "CO", "HJ", "LJ", "MP"],
  8: ["BB", "SB", "BTN", "CO", "HJ", "LJ", "UTG1", "UTG"],
  9: ["BB", "SB", "BTN", "CO", "HJ", "LJ", "MP", "UTG1", "UTG"],
};

function ringPositionsBasedOnSize(tableSize: number): string[] {
  return RING_BY_SIZE[tableSize] ?? [];
}

// Reorders ring so that startingPosition becomes index 0 (which is the hero seat at the bottom).
function reorderTablePositions(startingPosition: string, tableSize: number): string[] {
  const ring = ringPositionsBasedOnSize(tableSize);
  const idx = ring.indexOf(startingPosition);
  if (idx === -1) return ring;
  return ring.slice(idx).concat(ring.slice(0, idx));
}

// In the legacy UI, the seat index `1` is reserved for hero (bottom). This helper
// returns 1..tableSize where 1 = hero seat, then walks around the table.
function getSeatIndex(tablePositions: string[], position: string): number {
  return tablePositions.indexOf(position) + 1;
}

interface BuildArgs {
  heroPosition: string;
  villainPositions: string[];
  villainBetSize: number;
  action: PokerAction;
  tableSize: number;
  stackSize: number;
  heroBetSize: number;
  villainStackSize: number; // -1 = use stackSize
  heroStackSize: number; // -1 = use stackSize
  selectedVillainPosition: string;
  tableConfiguration?: TableConfigOverride[];
}

function generatePreFlopSeats(args: BuildArgs): PlayerSeat[] {
  const { heroPosition, villainPositions, villainBetSize, tableSize, stackSize,
    heroBetSize, villainStackSize, heroStackSize, selectedVillainPosition } = args;

  const tablePositions = reorderTablePositions(heroPosition, tableSize);
  const players: PlayerSeat[] = [];
  const isBBHero = tablePositions.indexOf("BB") === 0;
  let isHero = true;

  for (const position of tablePositions) {
    const seatIndex = getSeatIndex(tablePositions, position);
    const isBB = position === "BB";
    const isSB = position === "SB";
    const isVillain = selectedVillainPosition === position || villainPositions.includes(position);
    const hasBBFolded = heroBetSize > 0 && villainBetSize > 0;
    const hasSBFolded = isBBHero || (heroBetSize > 0 && villainBetSize > 0);

    let amountOfChips =
      isVillain && villainBetSize > 0 ? villainBetSize :
      isHero && heroBetSize > 0 ? heroBetSize :
      isBB && hasBBFolded ? 0 :
      isBB ? 1 :
      isSB && hasSBFolded ? 0 :
      isSB ? 0.5 : 0;

    // hasCards = "is an active opponent currently in the hand"
    const hasCards =
      !isHero &&
      (((tablePositions.indexOf(position) >= tablePositions.indexOf("BB") && !isBBHero) &&
        heroBetSize <= 0) ||
        amountOfChips > 0);

    const rawStack =
      isHero && heroStackSize >= 0
        ? heroStackSize
        : isVillain && villainStackSize >= 0
        ? villainStackSize
        : stackSize;

    players.push({
      index: seatIndex,
      position,
      hasChipsInFront: amountOfChips > 0,
      hasCards,
      amountOfChips,
      isHero,
      isVillain,
      stackSize: Math.max(0, rawStack - amountOfChips),
      bounty: 0,
    });

    isHero = false;
  }

  return players;
}

function generatePostFlopSeats(args: BuildArgs): PlayerSeat[] {
  const { heroPosition, villainBetSize, tableSize, stackSize, heroBetSize,
    villainStackSize, heroStackSize, selectedVillainPosition } = args;

  const tablePositions = reorderTablePositions(heroPosition, tableSize);
  const players: PlayerSeat[] = [];
  let isHero = true;

  for (const position of tablePositions) {
    const seatIndex = getSeatIndex(tablePositions, position);
    const isVillain = selectedVillainPosition === position;
    const amountOfChips = isVillain ? villainBetSize : isHero ? heroBetSize : 0;

    const rawStack =
      isHero && heroStackSize >= 0
        ? heroStackSize
        : isVillain && villainStackSize >= 0
        ? villainStackSize
        : stackSize;

    players.push({
      index: seatIndex,
      position,
      hasChipsInFront: amountOfChips > 0,
      hasCards: isVillain, // post-flop: only the active villain shows cards
      amountOfChips,
      isHero,
      isVillain,
      stackSize: Math.max(0, rawStack - amountOfChips),
      bounty: 0,
    });
    isHero = false;
  }

  return players;
}

export function buildTableSeats(args: BuildArgs): PlayerSeat[] {
  let players: PlayerSeat[] = [];
  if (args.action === "RFI") {
    players = generatePreFlopSeats({ ...args, villainPositions: [], villainBetSize: 0 });
  } else if (
    args.action === "vsOpen" ||
    args.action === "vs3Bet" ||
    args.action === "vsBBISO" ||
    args.action === "multiway" ||
    args.action === "blindWar"
  ) {
    players = generatePreFlopSeats(args);
  } else if (
    args.action === "cBet" ||
    args.action === "vsCbet" ||
    args.action === "cbetTurn" ||
    args.action === "cbetRiver"
  ) {
    players = generatePostFlopSeats(args);
  }

  // Apply per-position table overrides
  if (args.tableConfiguration?.length) {
    for (const override of args.tableConfiguration) {
      const seat = players.find((p) => p.position === override.position);
      if (seat) {
        seat.stackSize = override.stackSize;
        seat.bounty = override.bounty;
      }
    }
  }

  return players;
}

export { ringPositionsBasedOnSize };
