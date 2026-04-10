// Range / combo expansion utilities.
// Ported faithfully from PokerTrainer-3.1/src/app/global-utility.service.ts

// 13x13 range matrix: pairs on the diagonal, suited above, offsuit below.
export const FULL_RANGE: string[][] = [
  ["AA", "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s"],
  ["AKo", "KK", "KQs", "KJs", "KTs", "K9s", "K8s", "K7s", "K6s", "K5s", "K4s", "K3s", "K2s"],
  ["AQo", "KQo", "QQ", "QJs", "QTs", "Q9s", "Q8s", "Q7s", "Q6s", "Q5s", "Q4s", "Q3s", "Q2s"],
  ["AJo", "KJo", "QJo", "JJ", "JTs", "J9s", "J8s", "J7s", "J6s", "J5s", "J4s", "J3s", "J2s"],
  ["ATo", "KTo", "QTo", "JTo", "TT", "T9s", "T8s", "T7s", "T6s", "T5s", "T4s", "T3s", "T2s"],
  ["A9o", "K9o", "Q9o", "J9o", "T9o", "99", "98s", "97s", "96s", "95s", "94s", "93s", "92s"],
  ["A8o", "K8o", "Q8o", "J8o", "T8o", "98o", "88", "87s", "86s", "85s", "84s", "83s", "82s"],
  ["A7o", "K7o", "Q7o", "J7o", "T7o", "97o", "87o", "77", "76s", "75s", "74s", "73s", "72s"],
  ["A6o", "K6o", "Q6o", "J6o", "T6o", "96o", "86o", "76o", "66", "65s", "64s", "63s", "62s"],
  ["A5o", "K5o", "Q5o", "J5o", "T5o", "95o", "85o", "75o", "65o", "55", "54s", "53s", "52s"],
  ["A4o", "K4o", "Q4o", "J4o", "T4o", "94o", "84o", "74o", "64o", "54o", "44", "43s", "42s"],
  ["A3o", "K3o", "Q3o", "J3o", "T3o", "93o", "83o", "73o", "63o", "53o", "43o", "33", "32s"],
  ["A2o", "K2o", "Q2o", "J2o", "T2o", "92o", "82o", "72o", "62o", "52o", "42o", "32o", "22"],
];

const SUITS = ["s", "c", "d", "h"];
const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

export function isPairNotation(notation: string): boolean {
  return notation[0] === notation[1];
}

function findIndex(matrix: string[][], element: string): [number, number] {
  for (let i = 0; i < matrix.length; i++) {
    const j = matrix[i].indexOf(element);
    if (j !== -1) return [i, j];
  }
  return [-1, -1];
}

function returnAllPairsInMatrixWithinRange(
  matrix: string[][],
  startIndex: number,
  endIndex: number
): string[] {
  const pairs: string[] = [];
  for (let i = startIndex; i >= endIndex; i--) pairs.push(matrix[i][i]);
  return pairs;
}

function returnAllSuitedCombosWithinRange(
  matrix: string[][],
  rowIndex: number,
  colIndexStart: number,
  colIndexEnd: number
): string[] {
  const combos: string[] = [];
  for (let i = colIndexStart; i >= colIndexEnd; i--) {
    const el = matrix[rowIndex][i];
    if (isPairNotation(el)) break;
    combos.push(el);
  }
  return combos;
}

function returnAllOffCombosWithinRange(
  matrix: string[][],
  rowIndexStart: number,
  colIndex: number,
  rowIndexEnd: number
): string[] {
  const combos: string[] = [];
  for (let i = rowIndexStart; i >= rowIndexEnd; i--) {
    const el = matrix[i][colIndex];
    if (isPairNotation(el)) break;
    combos.push(el);
  }
  return combos;
}

function expandPlusNotation(notation: string): string[] {
  const suited = notation[2] === "s";
  const offsuit = notation[2] === "o";
  const isPair = isPairNotation(notation);
  const stripped = notation.slice(0, -1);
  const [row, col] = findIndex(FULL_RANGE, stripped);
  if (row < 0) return [];
  if (isPair) return returnAllPairsInMatrixWithinRange(FULL_RANGE, row, 0);
  if (suited) return returnAllSuitedCombosWithinRange(FULL_RANGE, row, col, 0);
  if (offsuit) return returnAllOffCombosWithinRange(FULL_RANGE, row, col, 0);
  return [];
}

function expandHifenNotation(notation: string): string[] {
  const suited = notation[2] === "s";
  const offsuit = notation[2] === "o";
  const isPair = notation.length === 5; // "22-66"
  const startNotation = isPair ? notation.slice(0, 2) : notation.slice(0, 3);
  const endNotation = isPair ? notation.slice(3) : notation.slice(4);
  const [rowStart, colStart] = findIndex(FULL_RANGE, startNotation);
  const [rowEnd, colEnd] = findIndex(FULL_RANGE, endNotation);
  if (rowStart < 0 || rowEnd < 0) return [];
  if (isPair) return returnAllPairsInMatrixWithinRange(FULL_RANGE, rowStart, rowEnd);
  if (suited) return returnAllSuitedCombosWithinRange(FULL_RANGE, rowStart, colStart, colEnd);
  if (offsuit) return returnAllOffCombosWithinRange(FULL_RANGE, rowStart, colStart, rowEnd);
  return [];
}

// Expand a single short notation (e.g. "AKs", "T9o", "QQ") into all 4-char combos.
// If the notation already looks like a 4-char combo (e.g. "AcKd"), it is returned as-is.
export function generateCombosFromSingleNotation(notation: string): string[] {
  const firstCard = notation[0].toUpperCase();
  const secondCard = notation[1].toUpperCase();
  const isPair = isPairNotation(notation);
  const suited = notation[2] === "s";
  const offsuit = notation[2] === "o";
  const cardsCombos: string[] = [];

  if (isPair) {
    for (let i = 0; i < SUITS.length; i++) {
      for (let j = i + 1; j < SUITS.length; j++) {
        cardsCombos.push(firstCard + SUITS[i] + secondCard + SUITS[j]);
      }
    }
  } else if (suited) {
    for (let i = 0; i < SUITS.length; i++) {
      cardsCombos.push(firstCard + SUITS[i] + secondCard + SUITS[i]);
    }
  } else if (offsuit) {
    for (let i = 0; i < SUITS.length; i++) {
      for (let j = 0; j < SUITS.length; j++) {
        if (i !== j) cardsCombos.push(firstCard + SUITS[i] + secondCard + SUITS[j]);
      }
    }
  } else {
    // Already a 4-char specific combo like "AcKd"
    const combo = notation[0].toUpperCase() + notation[1] + notation[2].toUpperCase() + notation[3];
    cardsCombos.push(combo);
  }
  return cardsCombos;
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

export function generateCombosFromNotationRange(range: string[]): string[] {
  const allNotations: string[] = [];
  for (const item of range) {
    if (item.includes("+")) allNotations.push(...expandPlusNotation(item));
    else if (item.includes("-")) allNotations.push(...expandHifenNotation(item));
    else allNotations.push(item);
  }
  const allCombos: string[] = [];
  for (const n of allNotations) allCombos.push(...generateCombosFromSingleNotation(n));
  return dedupe(allCombos);
}

export function listAllCardsCombos(): string[] {
  const allCards: string[] = [];
  for (const r of RANKS) for (const s of SUITS) allCards.push(r + s);
  const combos: string[] = [];
  for (let i = 0; i < allCards.length; i++) {
    for (let j = i + 1; j < allCards.length; j++) {
      combos.push(allCards[i] + allCards[j]);
    }
  }
  return combos;
}

export function listCardsCombosFromRange(notationRange: string[]): string[] {
  if (notationRange.length > 0 && notationRange[0]?.toLowerCase() === "all") {
    return listAllCardsCombos();
  }
  return generateCombosFromNotationRange(notationRange);
}

export function pickRandomCardCombo(notationRange: string[], filterBoard: string): string {
  let combos = listCardsCombosFromRange(notationRange);
  if (filterBoard !== "") {
    const filters = filterBoard.split("-");
    combos = combos.filter((combo) => !filters.some((f) => combo.includes(f)));
  }
  return combos[Math.floor(Math.random() * combos.length)];
}
