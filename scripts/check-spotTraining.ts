import {
  computeProgress,
  isSpotComplete,
  THRESHOLD_PCT,
  THRESHOLD_HANDS,
  type SpotTrainingRow,
} from "../lib/poker/spotTraining";

let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    console.error(`FAIL ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    failed++;
  }
}

check("THRESHOLD_PCT", THRESHOLD_PCT, 0.70);
check("THRESHOLD_HANDS", THRESHOLD_HANDS, 50);

check("computeProgress(null)", computeProgress(null), {
  handsPlayed: 0, handsCorrect: 0, pct: 0, completed: false,
});

const row1: SpotTrainingRow = { hands_played: 30, hands_correct: 21, completed_at: null };
check("computeProgress(30/21)", computeProgress(row1), {
  handsPlayed: 30, handsCorrect: 21, pct: 0.70, completed: false,
});
check("isSpotComplete(30/21)", isSpotComplete(row1), false);

const row2: SpotTrainingRow = { hands_played: 50, hands_correct: 35, completed_at: null };
check("isSpotComplete(50/35 at threshold)", isSpotComplete(row2), true);

const row3: SpotTrainingRow = { hands_played: 60, hands_correct: 35, completed_at: null };
check("isSpotComplete(60/35 = 58%)", isSpotComplete(row3), false);

const row4: SpotTrainingRow = {
  hands_played: 50, hands_correct: 35, completed_at: "2026-05-28T10:00:00Z",
};
check("completed=true when completed_at set", computeProgress(row4).completed, true);

if (failed > 0) {
  console.error(`\n${failed} checks failed`);
  process.exit(1);
}
console.log("All spotTraining checks passed");
