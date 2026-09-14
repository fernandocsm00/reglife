// Verificação pura do fix de lib/poker/store.ts (mode "ordered" tratado como
// random). Exercita o zustand store fora do React (useDrillStore expõe
// getState/setState igual qualquer store zustand) com um spot real que já
// usa mode: "ordered". Roda com: npx tsx scripts/check-trainerStore.ts
import fs from "node:fs";
import path from "node:path";
import { useDrillStore } from "../lib/poker/store";

let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    console.error(`FAIL ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    failed++;
  }
}

const spotPath = path.join(__dirname, "../public/spots/reglife-rfi-prioridades.json");
const raw = JSON.parse(fs.readFileSync(spotPath, "utf8"));
check("fixture uses mode: ordered", raw.mode, "ordered");

useDrillStore.getState().loadConfig(raw);
const n = raw.expectedAnswers.length;

// "ordered" deve virar uma queue sequencial SEM shuffle: 0..n-1 na ordem do
// JSON (antes do fix, mode "ordered" caía em random: sequentialQueue ficava
// vazio e o drill não seguia a ordem nem parava de repetir).
const expectedQueue = Array.from({ length: n }, (_, i) => i);
check("sequentialQueue is 0..n-1 in JSON order (no shuffle)", useDrillStore.getState().sequentialQueue, expectedQueue);
check("sequentialCursor starts at 0", useDrillStore.getState().sequentialCursor, 0);

// O primeiro drill tem que ser o expectedAnswers[0] do JSON (posição/stack),
// e cada nextDrill() deve avançar pro próximo índice em ordem, sem repetir,
// até esgotar a lista.
function assertDrillMatches(label: string, idx: number) {
  const drill = useDrillStore.getState().drill;
  const ea = raw.expectedAnswers[idx];
  check(`${label} position`, drill?.heroPosition, ea.position);
  check(`${label} stackSize`, drill?.stackSize, ea.stackSize);
}

assertDrillMatches("drill[0]", 0);
useDrillStore.getState().nextDrill();
assertDrillMatches("drill[1]", 1);
useDrillStore.getState().nextDrill();
assertDrillMatches("drill[2]", 2);

// drillCompleted only flips via pickAnswer's sessionLimit check, but we can
// still confirm the queue never repeats an index: drain the rest and count
// distinct cursor positions.
const seenCursors = new Set<number>([0, 1, 2]);
for (let i = 3; i < n; i++) {
  useDrillStore.getState().nextDrill();
  seenCursors.add(useDrillStore.getState().sequentialCursor);
  assertDrillMatches(`drill[${i}]`, i);
}
check("all n indices visited exactly once", seenCursors.size, n);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("All trainerStore (ordered mode) checks passed");
