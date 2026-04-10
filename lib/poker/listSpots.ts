// Server-only utility to list spot config files from /public/spots
// and extract a few metadata fields for the selector grid.

import { promises as fs } from "fs";
import path from "path";
import type { SpotConfigFile } from "./types";

export interface SpotSummary {
  slug: string; // filename without .json
  name: string;
  action: string;
  tableSize: number;
  buttonsCount: number;
  potSize: number;
  scenarioCount: number; // number of expectedAnswers entries
}

const SPOTS_DIR = path.join(process.cwd(), "public", "spots");

export async function listSpots(): Promise<SpotSummary[]> {
  const files = await fs.readdir(SPOTS_DIR);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));

  const summaries = await Promise.all(
    jsonFiles.map(async (file) => {
      const raw = await fs.readFile(path.join(SPOTS_DIR, file), "utf-8");
      const data = JSON.parse(raw) as SpotConfigFile;
      const slug = file.replace(/\.json$/, "");
      return {
        slug,
        name: data.name ?? slug,
        action: data.action,
        tableSize: data.tableSize,
        buttonsCount: data.actionButtons?.length ?? 0,
        potSize: data.potSize,
        scenarioCount: data.expectedAnswers?.length ?? 0,
      } satisfies SpotSummary;
    })
  );

  // Sort: RFI → vsOpen → vs3Bet → cBet, then by name
  const order: Record<string, number> = { RFI: 0, vsOpen: 1, vs3Bet: 2, cBet: 3 };
  return summaries.sort((a, b) => {
    const oa = order[a.action] ?? 99;
    const ob = order[b.action] ?? 99;
    if (oa !== ob) return oa - ob;
    return a.name.localeCompare(b.name);
  });
}

export async function loadSpotConfig(slug: string): Promise<SpotConfigFile | null> {
  // Guard against path traversal — slugs must be plain filenames
  if (!/^[A-Za-z0-9_\- ]+$/.test(slug)) return null;
  const filePath = path.join(SPOTS_DIR, `${slug}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as SpotConfigFile;
  } catch {
    return null;
  }
}
