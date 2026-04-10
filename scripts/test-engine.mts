import { promises as fs } from "fs";
import path from "path";
import {
  initializeDrillContext,
  createDrill,
  validateSpotConfig,
} from "../lib/poker/spotEngine.js";

const dir = path.join(process.cwd(), "public", "spots");
const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));

for (const f of files) {
  try {
    const raw = await fs.readFile(path.join(dir, f), "utf-8");
    const config = JSON.parse(raw);
    if (!validateSpotConfig(config)) {
      console.error(f, "=> INVALID shape");
      continue;
    }
    const ctx = initializeDrillContext(config);
    // Try creating 10 drills to exercise randomness
    for (let i = 0; i < 10; i++) {
      const drill = createDrill(ctx);
      if (!drill.cardsOnHand || drill.cardsOnHand.length < 4) {
        throw new Error(`Empty cardsOnHand on iter ${i}: "${drill.cardsOnHand}"`);
      }
    }
    console.log(f, "=> OK");
  } catch (e) {
    console.error(f, "=> FAILED:", (e as Error).message);
    console.error((e as Error).stack);
  }
}
