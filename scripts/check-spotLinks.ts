// Verificação pura — roda com: npx tsx scripts/check-spotLinks.ts
import { hasInternalTrainer, slugForLeak } from "../lib/poker/spotLinks";

const cases: Array<{ leakId: string; hasTrainer: boolean }> = [
  { leakId: "RFI-BTN-15",       hasTrainer: true  },
  { leakId: "cBet-BTN-40",      hasTrainer: true  },
  { leakId: "vsOpen-BB-25",     hasTrainer: true  },
  { leakId: "squeeze-CO-30",    hasTrainer: false },
  { leakId: "probeTurn-BB-20",  hasTrainer: false },
  { leakId: "delayCbet-BTN-25", hasTrainer: false },
];

let failed = 0;
for (const c of cases) {
  const got = hasInternalTrainer(c.leakId);
  if (got !== c.hasTrainer) {
    console.error(`FAIL: hasInternalTrainer(${c.leakId}) -> ${got}, expected ${c.hasTrainer}`);
    failed++;
  }
}

for (const c of cases) {
  const slug = slugForLeak(c.leakId);
  if (c.hasTrainer && !slug) {
    console.error(`FAIL: slugForLeak(${c.leakId}) -> null, expected non-null`);
    failed++;
  }
  if (!c.hasTrainer && slug) {
    console.error(`FAIL: slugForLeak(${c.leakId}) -> ${slug}, expected null`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
} else {
  console.log("All spotLinks checks passed");
}
