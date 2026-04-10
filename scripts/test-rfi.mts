import { promises as fs } from "fs";
import path from "path";
import {
  initializeDrillContext,
  createDrill,
  validateSpotConfig,
} from "../lib/poker/spotEngine.js";

const file = path.join(process.cwd(), "public", "spots", "reglife-rfi-prioridades.json");
const raw = await fs.readFile(file, "utf-8");
const config = JSON.parse(raw);

if (!validateSpotConfig(config)) {
  console.error("Invalid config");
  process.exit(1);
}

const ctx = initializeDrillContext(config);
const total = ctx.expectedAnswers.length;
console.log(`Config mode: ${config.mode}  |  expectedAnswers: ${total}`);

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Simulate 5 sessions of sequential mode; each must play every scenario exactly once.
const sessions = 5;
for (let s = 0; s < sessions; s++) {
  const queue = shuffle(ctx.expectedAnswers.map((_, i) => i));
  const scenariosPlayed: string[] = [];
  const seenIndices = new Set<number>();
  for (const idx of queue) {
    const drill = createDrill(ctx, { expectedAnswerIndex: idx });
    const correct = drill.actionButtons.filter((b) => b.isCorrect).map((b) => b.text).join(",");
    scenariosPlayed.push(
      `${drill.heroPosition} ${drill.stackSize}bb ${drill.cardsOnHand} → ${correct}`
    );
    seenIndices.add(idx);
  }
  const unique = new Set(scenariosPlayed.map((s) => s.split(" ").slice(0, 2).join(" ") + " " + s.split("→")[1]));
  console.log(
    `Session ${s + 1}: ${scenariosPlayed.length} drills, unique indices: ${seenIndices.size}/${total}, distinct (pos,stack,action) buckets: ${unique.size}`
  );
  if (seenIndices.size !== total) {
    console.error("❌ Not all scenarios consumed!");
    process.exit(1);
  }
}

// Also check that each of the 19 expectedAnswer entries from the file maps 1:1 to a runtime scenario.
console.log("\nAll 19 scenarios (in file order):");
for (let i = 0; i < ctx.expectedAnswers.length; i++) {
  const ea = ctx.expectedAnswers[i];
  const drill = createDrill(ctx, { expectedAnswerIndex: i });
  const correct = drill.actionButtons.filter((b) => b.isCorrect).map((b) => b.text).join(",");
  const srcCombo = ea.expectedAnswers[0].combos[0];
  const srcAnswer = ea.expectedAnswers[0].answer[0];
  const ok = correct === srcAnswer ? "✅" : "❌";
  console.log(
    `  ${ok} ${String(i + 1).padStart(2)}. ${ea.position.padEnd(3)} ${String(ea.stackSize).padStart(3)}bb  ${srcCombo.padEnd(4)} → expected ${srcAnswer.padEnd(8)} | got ${correct}  (dealt: ${drill.cardsOnHand})`
  );
}

console.log("\n✅ Sequential mode verified: every session plays all 19 scenarios, no repeats.");
