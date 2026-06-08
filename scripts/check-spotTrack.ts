// Verificação pura — roda com: npx tsx scripts/check-spotTrack.ts
//
// buildSpotTrack consome topLeaks() de lib/pdf/utils, que computa pct a partir
// de (total - errors) / total e usa actionLabel como label público. Fixtures
// abaixo refletem essa contract.

import type { SavedPlan } from "../lib/poker/planStorage";
import { buildSpotTrack, buildResources } from "../lib/poker/spotTrack";

let failed = 0;
function expect(name: string, cond: boolean) {
  if (!cond) { console.error(`FAIL ${name}`); failed++; }
}

function leak(opts: {
  id: string;
  actionLabel: string;
  total: number;
  errors: number;
}) {
  return {
    id: opts.id,
    actionLabel: opts.actionLabel,
    total: opts.total,
    errors: opts.errors,
    recommendation: "",
    severity: 0,
    lessons: [],
    label: opts.actionLabel,
  };
}

const planWith3Leaks = {
  leaks: [
    leak({ id: "cBet-BTN-40",  actionLabel: "Cbet do BTN em 40bb", total: 20, errors: 13 }), // 35%
    leak({ id: "RFI-BTN-15",   actionLabel: "RFI do BTN 15bb",     total: 20, errors: 12 }), // 40%
    leak({ id: "vsOpen-BB-25", actionLabel: "BB vs RFI 25bb",      total: 20, errors: 10 }), // 50%
  ],
  byTrainer: [],
  stakeGrade: 4,
} as unknown as SavedPlan;

const track = buildSpotTrack(planWith3Leaks);
expect("track length 3", track.length === 3);

// topLeaks ordena pelos piores; buildSpotTrack reordena pela ordem canônica
// de estudo: RFI=1, cBet IP=2, vsOpen-BB=5. Logo ordem final:
expect("first is RFI",       track[0].leakId === "RFI-BTN-15");
expect("second is cBet",     track[1].leakId === "cBet-BTN-40");
expect("third is vsOpen-BB", track[2].leakId === "vsOpen-BB-25");

expect("indexes 0..2", track[0].index === 0 && track[2].index === 2);
expect("track[0] label vem do actionLabel", track[0].label === "RFI do BTN 15bb");
expect("track[0] pct computed (40%)", track[0].pct === 40);

expect("all have internal trainer", track.every((t) => t.hasInternalTrainer === true));
expect("track[0] has trainerSlug", typeof track[0].trainerSlug === "string");
expect("track[0] has lessonUrl",   typeof track[0].lessonUrl === "string");

const planNoLeaks = { leaks: [], byTrainer: [], stakeGrade: undefined } as unknown as SavedPlan;
const emptyTrack = buildSpotTrack(planNoLeaks);
expect("empty plan -> empty track", emptyTrack.length === 0);

// Tier 3 — sem trainer interno, mas ainda aparece na trilha
const planTier3 = {
  leaks: [
    leak({ id: "squeeze-CO-30", actionLabel: "Squeeze do CO", total: 10, errors: 7 }),
  ],
  byTrainer: [],
  stakeGrade: undefined,
} as unknown as SavedPlan;
const tier3Track = buildSpotTrack(planTier3);
expect("Tier 3 still appears in track", tier3Track.length === 1);
expect("Tier 3 has no internal trainer", tier3Track[0].hasInternalTrainer === false);
expect("Tier 3 has null trainerSlug",   tier3Track[0].trainerSlug === null);

// Resources — grade saiu daqui (A7): agora vive em GradeCard separado.
const resources = buildResources(planWith3Leaks);
expect("1 resource (só career; grade migrou pra GradeCard)", resources.length === 1);
expect("first is career", resources[0].kind === "career");

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("All spotTrack checks passed");
