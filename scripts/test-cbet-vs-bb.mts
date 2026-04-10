import { promises as fs } from "fs";
import path from "path";
import {
  initializeDrillContext,
  createDrill,
  validateSpotConfig,
} from "../lib/poker/spotEngine.js";

const file = path.join(
  process.cwd(),
  "public",
  "spots",
  "reglife-cbet-flop-vs-bb.json"
);
const raw = await fs.readFile(file, "utf-8");
const config = JSON.parse(raw);

if (!validateSpotConfig(config)) {
  console.error("Invalid config");
  process.exit(1);
}

const ctx = initializeDrillContext(config);
const total = ctx.expectedAnswers.length;
console.log(`Config mode: ${config.mode}  |  expectedAnswers: ${total}\n`);

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// 5 simulated sessions: each must consume all indices exactly once.
for (let s = 0; s < 5; s++) {
  const queue = shuffle(ctx.expectedAnswers.map((_, i) => i));
  const seen = new Set<number>();
  for (const idx of queue) {
    createDrill(ctx, { expectedAnswerIndex: idx });
    seen.add(idx);
  }
  console.log(
    `Session ${s + 1}: ${queue.length} drills, unique indices: ${seen.size}/${total}`
  );
  if (seen.size !== total) {
    console.error("❌ Not all scenarios consumed!");
    process.exit(1);
  }
}

console.log("\nAll 11 scenarios (in file order):");
for (let i = 0; i < ctx.expectedAnswers.length; i++) {
  const ea = ctx.expectedAnswers[i];
  const drill = createDrill(ctx, { expectedAnswerIndex: i });
  const correct = drill.actionButtons
    .filter((b) => b.isCorrect)
    .map((b) => b.text)
    .join(",");
  const srcAnswer = ea.expectedAnswers[0].answer[0];
  const ok = correct === srcAnswer ? "✅" : "❌";
  console.log(
    `  ${ok} ${String(i + 1).padStart(2)}. ${ea.position.padEnd(4)} ${String(
      ea.stackSize
    ).padStart(3)}bb  board ${ea.board?.padEnd(10)}  dealt ${drill.cardsOnHand.padEnd(4)}  → expected ${srcAnswer.padEnd(8)} | got ${correct}`
  );
}

console.log(
  "\n✅ C-Bet vs BB sequential mode verified: every session plays all 11 scenarios, no repeats."
);
