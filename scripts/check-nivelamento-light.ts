// Verificação — roda com: npx tsx scripts/check-nivelamento-light.ts
// Confere que public/spots/*.json batem com scripts/nivelamento-light.data.ts.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { NIVELAMENTO_LIGHT, type DocHand } from "./nivelamento-light.data";
import {
  createDrill,
  initializeDrillContext,
  validateSpotConfig,
} from "../lib/poker/spotEngine";
import type { ExpectedAnswer, SpotConfigFile } from "../lib/poker/types";

const SPOTS_DIR = join(process.cwd(), "public", "spots");

let failed = 0;
function expect(name: string, cond: boolean, detail = "") {
  if (!cond) {
    console.error(`FAIL ${name} ${detail}`);
    failed++;
  }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function villainsOf(e: ExpectedAnswer): string[] {
  return e.villainPositions ?? (e.villainPosition ? [e.villainPosition] : []);
}
function docVillains(hand: DocHand): string[] {
  return hand.vs === undefined ? [] : Array.isArray(hand.vs) ? hand.vs : [hand.vs];
}
/** Um conjunto de cartas (board + mão) por combo específico (ex.: "AhKd"). */
function cardsOf(hand: DocHand): string[][] {
  const board = hand.board ? hand.board.split("-") : [];
  return hand.combos
    .filter((c) => /^([2-9TJQKA][cdhs]){2}$/.test(c))
    .map((c) => [...board, c.slice(0, 2), c.slice(2, 4)]);
}

// Cobertura: todo JSON de public/spots está nos dados e vice-versa.
const files = readdirSync(SPOTS_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
expect("slugs cover public/spots", same([...files].sort(), NIVELAMENTO_LIGHT.map((m) => m.slug).sort()),
  `${files.join(",")}`);

const totals: Record<number, number> = { 1: 0, 2: 0 };

for (const mod of NIVELAMENTO_LIGHT) {
  const config = JSON.parse(readFileSync(join(SPOTS_DIR, `${mod.slug}.json`), "utf-8")) as SpotConfigFile;
  const tag = mod.slug;
  totals[mod.tier] += mod.hands.length;

  expect(`${tag} validateSpotConfig`, validateSpotConfig(config));
  expect(`${tag} tier`, config.tier === mod.tier, `got ${config.tier}`);
  expect(`${tag} mode ordered`, config.mode === "ordered", `got ${config.mode}`);
  expect(`${tag} sessionSize`, config.sessionSize === mod.hands.length, `got ${config.sessionSize}`);
  expect(`${tag} count`, config.expectedAnswers.length === mod.hands.length,
    `got ${config.expectedAnswers.length}, expected ${mod.hands.length}`);

  const ctx = initializeDrillContext(config);

  mod.hands.forEach((hand, i) => {
    const e = config.expectedAnswers[i];
    const at = `${tag}#${i + 1}`;
    if (!e) return;
    expect(`${at} position`, e.position === hand.pos, `got ${e.position}`);
    expect(`${at} stack`, e.stackSize === hand.stack, `got ${e.stackSize}`);
    expect(`${at} villains`, same(villainsOf(e), docVillains(hand)), `got ${villainsOf(e)}`);
    expect(`${at} board`, (e.board ?? "") === (hand.board ?? ""), `got ${e.board}`);
    expect(`${at} combos/answers`,
      same(e.expectedAnswers, [{ combos: hand.combos, answer: hand.answers }]),
      JSON.stringify(e.expectedAnswers));

    const buttons = (e.spotConfig?.actionButtons ?? config.actionButtons).map((b) => b.text);
    for (const a of hand.answers) {
      expect(`${at} answer "${a}" is a button`, buttons.includes(a), buttons.join("/"));
    }
    if (hand.pot !== undefined) {
      expect(`${at} pot`, e.spotConfig?.potSize === hand.pot && e.spotConfig?.currentPotSize === hand.pot,
        JSON.stringify(e.spotConfig));
    }
    if (hand.heroStack !== undefined) {
      expect(`${at} heroStack`,
        e.spotConfig?.heroStackSize === hand.heroStack && e.spotConfig?.villainStackSize === hand.heroStack,
        JSON.stringify(e.spotConfig));
    }
    for (const cards of cardsOf(hand)) {
      expect(`${at} no duplicate cards`, new Set(cards).size === cards.length, cards.join(","));
    }

    try {
      const drill = createDrill(ctx, { expectedAnswerIndex: i });
      expect(`${at} drill deals cards`, drill.cardsOnHand.length >= 4, drill.cardsOnHand);
    } catch (err) {
      expect(`${at} createDrill`, false, String(err));
    }
  });
}

expect("tier 1 total 115", totals[1] === 115, `got ${totals[1]}`);
expect("tier 2 total 75", totals[2] === 75, `got ${totals[2]}`);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("All nivelamento-light checks passed");
