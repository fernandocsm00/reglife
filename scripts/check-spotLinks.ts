// Verificação pura — roda com: npx tsx scripts/check-spotLinks.ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { hasInternalTrainer, slugForLeak } from "../lib/poker/spotLinks";

const SPOTS_DIR = join(process.cwd(), "public", "spots");

const cases: Array<{ leakId: string; hasTrainer: boolean; expectedSlug?: string }> = [
  // Tier 1/2 — devem ter trainer interno e o slug deve existir em /public/spots/
  { leakId: "RFI-BTN-15",       hasTrainer: true,  expectedSlug: "reglife-rfi-prioridades" },
  { leakId: "RFI-UTG-25",       hasTrainer: true,  expectedSlug: "reglife-rfi-prioridades" },
  { leakId: "cBet-BTN-40",      hasTrainer: true,  expectedSlug: "reglife-cbet-flop-btn-missed" }, // override
  { leakId: "cBet-BTN-25",      hasTrainer: true,  expectedSlug: "reglife-cbet-flop-vs-bb" },
  { leakId: "cBet-CO-25",       hasTrainer: true,  expectedSlug: "reglife-cbet-vs-btn" },
  { leakId: "cbetTurn-BTN-25",  hasTrainer: true,  expectedSlug: "reglife-cbet-turn-river-vs-bb" },
  { leakId: "cbetRiver-BTN-25", hasTrainer: true,  expectedSlug: "reglife-cbet-turn-river-vs-bb" },
  { leakId: "vsOpen-BB-25",     hasTrainer: true,  expectedSlug: "reglife-defesa-bb" },
  { leakId: "vsOpen-BTN-25",    hasTrainer: true,  expectedSlug: "reglife-vs-rfi" },
  { leakId: "vsCbet-BB-25",     hasTrainer: true,  expectedSlug: "reglife-vs-cbet-flop-bb" },
  { leakId: "vsCbet-BTN-25",    hasTrainer: true,  expectedSlug: "reglife-vs-cbet-flop-btn" },
  { leakId: "vs3Bet-BTN-40",    hasTrainer: true,  expectedSlug: "reglife-vs-3bet-btn" },
  { leakId: "vs3Bet-UTG-40",    hasTrainer: true,  expectedSlug: "reglife-vs-3bet-ep" },
  { leakId: "vs3Bet-HJ-40",     hasTrainer: true,  expectedSlug: "reglife-vs-3bet-ep" },
  { leakId: "vs3Bet-LJ-40",     hasTrainer: true,  expectedSlug: "reglife-vs-3bet-ep" },
  { leakId: "multiway-BB-25",   hasTrainer: true,  expectedSlug: "reglife-multiway-bb" },
  { leakId: "blindWar-BB-25",   hasTrainer: true,  expectedSlug: "reglife-blind-war-bb-vs-raise" },
  { leakId: "blindWar-SB-25",   hasTrainer: true,  expectedSlug: "reglife-blind-war-sb-gap" },
  { leakId: "vsBBISO-BB-25",    hasTrainer: true,  expectedSlug: "reglife-blind-war-bb-vs-raise" },

  // Tier 3 — sem spot interno
  { leakId: "squeeze-CO-30",     hasTrainer: false },
  { leakId: "probeTurn-BB-20",   hasTrainer: false },
  { leakId: "probeRiver-BB-20",  hasTrainer: false },
  { leakId: "vsCheckRaise-BTN-30", hasTrainer: false },
  { leakId: "delayCbet-BTN-25",  hasTrainer: false },
  { leakId: "pot3bet-BTN-25",    hasTrainer: false },
  { leakId: "cbetVsSb-BTN-25",   hasTrainer: false },
];

let failed = 0;
function fail(msg: string) { console.error(`FAIL: ${msg}`); failed++; }

// 1. hasInternalTrainer matches expected boolean
for (const c of cases) {
  const got = hasInternalTrainer(c.leakId);
  if (got !== c.hasTrainer) {
    fail(`hasInternalTrainer(${c.leakId}) -> ${got}, expected ${c.hasTrainer}`);
  }
}

// 2. slugForLeak returns expected slug (or null when no trainer)
for (const c of cases) {
  const slug = slugForLeak(c.leakId);
  if (c.hasTrainer) {
    if (!slug) {
      fail(`slugForLeak(${c.leakId}) -> null, expected non-null`);
      continue;
    }
    if (c.expectedSlug && slug !== c.expectedSlug) {
      fail(`slugForLeak(${c.leakId}) -> ${slug}, expected ${c.expectedSlug}`);
    }
  } else {
    if (slug !== null) {
      fail(`slugForLeak(${c.leakId}) -> ${slug}, expected null`);
    }
  }
}

// 3. Every non-null slug must correspond to a real file in /public/spots/
for (const c of cases) {
  const slug = slugForLeak(c.leakId);
  if (!slug) continue;
  const filePath = join(SPOTS_DIR, `${slug}.json`);
  if (!existsSync(filePath)) {
    fail(`slug "${slug}" (from ${c.leakId}) has no file at public/spots/${slug}.json`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log(`All spotLinks checks passed (${cases.length} cases)`);
