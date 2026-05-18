// Aggregates raw drill results into a leak diagnosis + action plan.

import type { ResultEntry } from "./diagnosticoStore";
import {
  LESSON_CATALOG,
  stackBandFor,
  type Lesson,
  type LessonRef,
} from "./lessonCatalog";

export interface LeakBucket {
  /** Stable id, e.g. "RFI-BTN-15" */
  id: string;
  action: string; // "RFI" / "cBet" / etc
  actionLabel: string; // human-readable: "Vs RFI", "C-Bet" …
  position: string;
  stackBand: string; // "10bb", "15bb", "100bb"
  errors: number;
  total: number;
  examples: ResultEntry[];
  recommendation: string;
  lessons: LessonRef[];
}

export interface TierSummary {
  tier: number;
  correct: number;
  total: number;
  pct: number;
}

export interface DiagnosticSummary {
  totalCorrect: number;
  totalErrors: number;
  totalDrills: number;
  accuracyPct: number;
  /** Tier global atribuído ao jogador */
  playerTier: number;
  playerTierLabel: string;
  byTier: TierSummary[];
  byTrainer: { label: string; correct: number; total: number; pct: number }[];
  leaks: LeakBucket[];
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

// Labels que não dependem de posição. Para os que dependem (vsOpen, cBet,
// vsCbet), use `spotDisplayLabel(action, position)` abaixo.
const ACTION_LABELS: Record<string, string> = {
  RFI: "RFI",
  cbetTurn: "Cbet Turn e River em Posição vs BB",
  cbetRiver: "Cbet Turn e River em Posição vs BB",
  vs3Bet: "Enfrentando uma 3bet",
  vsBBISO: "Blind War Pré Flop",
  blindWar: "Blind War Pré Flop",
  multiway: "Defesa de BB Multiway",
  squeeze: "Squeeze",
  probeTurn: "Probe Turn",
  probeRiver: "Probe River",
  vsCheckRaise: "Enfrentando um Check-Raise",
  delayCbet: "Delay Cbet",
  pote3bet: "Pote 3betado",
  cbetVsSB: "Cbet vs SB",
};

export function actionDisplayLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/**
 * Label do spot considerando posição. Necessário porque a mesma action pode
 * representar spots diferentes dependendo da posição do hero:
 *  - vsOpen + BB    → "Jogando do BB"   (vsOpen em outras posições → "Vs RFI")
 *  - cBet  + BTN/UTG1 → "Cbet em posição vs BB" (cBet em CO/UTG → "Cbet Fora de Posição")
 *  - vsCbet + BB    → "Jogando vs Cbet do BB" (vsCbet em outras posições → "Jogando em Posição")
 *
 * Mantém alinhamento 1:1 com a lista de spots da Comunidade Reg Life
 * (mesmos nomes usados em spotLinks.ts).
 */
export function spotDisplayLabel(action: string, position: string): string {
  switch (action) {
    case "vsOpen":
      return position === "BB" ? "Jogando do BB" : "Vs RFI";
    case "cBet":
      return position === "BTN" || position === "UTG1"
        ? "Cbet em posição vs BB"
        : "Cbet Fora de Posição";
    case "vsCbet":
      return position === "BB"
        ? "Jogando vs Cbet do BB"
        : "Jogando em Posição";
    default:
      return actionDisplayLabel(action);
  }
}

const TIER_LABELS: Record<number, string> = {
  1: "Tier 1 · Fundamentos",
  2: "Tier 2 · Intermediário",
  3: "Tier 3 · Avançado",
};

export function tierLabel(tier: number): string {
  return TIER_LABELS[tier] ?? `Tier ${tier}`;
}

// ---------------------------------------------------------------------------
// Stack band + recommendation
// ---------------------------------------------------------------------------

function stackBand(stack: number): string {
  return `${stack}bb`;
}

function recommendationFor(
  action: string,
  position: string,
  stack: number
): string {
  if (action === "RFI") {
    if (stack <= 10)
      return `Em RFI ${position} com ${stack}bb a decisão é binária: push ou fold. Reveja gráficos de Nash/HRC e memorize os limites de cada mão.`;
    if (stack <= 15)
      return `Em RFI ${position} com ${stack}bb você ainda está em zona de all-in/fold com algumas mãos open. Estude o range de open vs all-in nessa stack específica.`;
    if (stack <= 25)
      return `Em RFI ${position} com ${stack}bb seu range fica mais polarizado. Foque nos blockers e na seleção de mãos suited fracas.`;
    return `Em RFI ${position} com ${stack}bb (stack profundo) o range fica mais largo. Revise sua tabela de open por posição com calma.`;
  }
  if (action === "cBet") {
    return `Em C-Bet IP ${position} com ${stack}bb você precisa equilibrar valor e blefe pela textura do bordo. Estude a frequência ótima de cbet 1/3 nesse tipo de flop.`;
  }
  if (action === "vsOpen") {
    if (stack <= 15)
      return `Enfrentando um open de ${position} com ${stack}bb seu range é basicamente 3-bet shove ou fold. Decore os ranges de push vs open por posição.`;
    if (stack <= 25)
      return `Enfrentando open em ${position} com ${stack}bb a decisão entre call, 3-bet e fold depende da posição do abridor. Estude os ranges de flat vs 3-bet para essa stack.`;
    return `Enfrentando open em ${position} com ${stack}bb (deep) você tem mais flexibilidade para flat e 3-bet. Revise a seleção entre call e 3-bet por posição.`;
  }
  return `Revise a estratégia para ${spotDisplayLabel(action, position)} ${position} ${stack}bb.`;
}

// ---------------------------------------------------------------------------
// Lesson scoring — cross-action affinities
// ---------------------------------------------------------------------------

/**
 * Maps a trainer action to related lesson actions that also help the player.
 * The primary action always scores +5; related actions score +3.
 * Example: a "vsOpen" leak from BB benefits from bbDefense and RFI lessons.
 */
const RELATED_ACTIONS: Record<string, string[]> = {
  RFI: ["blindWar"], // SB/BB open concepts overlap
  vsOpen: ["RFI", "bbDefense"], // understand opener range + BB defense
  cBet: ["cbetOOP", "cbetVsSB"], // cbet family
  cbetTurn: ["cBet", "cbetRiver"], // multi-street cbet
  cbetRiver: ["cBet", "cbetTurn"],
  vsCbet: ["playingIP"], // facing bets & continuing
  vs3Bet: ["vsOpen"], // pre-flop facing aggression
  blindWar: ["RFI", "bbDefense"], // SB open + BB defense
  multiway: ["cBet", "playingIP"],
  bbDefense: ["vsOpen", "blindWar"],
  cbetOOP: ["cBet"],
  playingIP: ["vsCbet"],
  squeeze: ["vs3Bet", "vsOpen"],
  probeTurn: ["cbetTurn", "delayCbet"],
  probeRiver: ["cbetRiver"],
  vsCheckRaise: ["cBet", "cbetOOP"],
  delayCbet: ["cbetTurn", "probeTurn"],
  pote3bet: ["vs3Bet"],
  cbetVsSB: ["cBet", "cbetOOP"],
};

export function recommendLessons(
  action: string,
  position: string,
  stack: number,
  limit = 4
): LessonRef[] {
  const band = stackBandFor(stack);
  const related = RELATED_ACTIONS[action] ?? [];

  const scored = LESSON_CATALOG.map((lesson: Lesson) => {
    let score = 0;

    // Primary match
    if (lesson.tags.action === action) score += 5;
    // Related action bonus
    else if (related.includes(lesson.tags.action)) score += 3;
    // Generic lessons always get a small boost
    if (lesson.tags.action === "geral") score += 1;

    // Position & stack refinement
    if (lesson.tags.positions?.includes(position)) score += 3;
    if (lesson.tags.stackBands?.includes(band)) score += 3;

    // Trainers (simulators) are extra valuable
    if (lesson.type === "treino") score += 1;
    return { lesson, score };
  });

  return scored
    .filter((s) => s.score >= 5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ lesson }) => ({
      title: lesson.title,
      url: lesson.url,
      module: lesson.module,
      type: lesson.type,
    }));
}

// ---------------------------------------------------------------------------
// Tier assessment
// ---------------------------------------------------------------------------

const TIER_PASS_THRESHOLD = 70; // % acerto pra "passar" de tier

function assessTier(byTier: TierSummary[]): number {
  // Sorted by tier asc
  const sorted = [...byTier].sort((a, b) => a.tier - b.tier);
  for (const t of sorted) {
    if (t.pct < TIER_PASS_THRESHOLD) return t.tier;
  }
  // Passed all tiers → next tier (ou o maior + 1)
  const maxTier = sorted.length > 0 ? sorted[sorted.length - 1].tier : 0;
  return Math.min(maxTier + 1, 3);
}

// ---------------------------------------------------------------------------
// Main analysis
// ---------------------------------------------------------------------------

export function analyzeResults(results: ResultEntry[]): DiagnosticSummary {
  const totalDrills = results.length;
  const totalCorrect = results.filter((r) => r.isCorrect).length;
  const totalErrors = totalDrills - totalCorrect;

  // by trainer
  const trainerMap = new Map<string, { correct: number; total: number }>();
  for (const r of results) {
    const cur = trainerMap.get(r.spotLabel) ?? { correct: 0, total: 0 };
    cur.total += 1;
    if (r.isCorrect) cur.correct += 1;
    trainerMap.set(r.spotLabel, cur);
  }
  const byTrainer = Array.from(trainerMap.entries()).map(([label, v]) => ({
    label,
    correct: v.correct,
    total: v.total,
    pct: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
  }));

  // by tier
  const tierMap = new Map<number, { correct: number; total: number }>();
  for (const r of results) {
    const cur = tierMap.get(r.tier) ?? { correct: 0, total: 0 };
    cur.total += 1;
    if (r.isCorrect) cur.correct += 1;
    tierMap.set(r.tier, cur);
  }
  const byTier: TierSummary[] = Array.from(tierMap.entries())
    .map(([tier, v]) => ({
      tier,
      correct: v.correct,
      total: v.total,
      pct: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
    }))
    .sort((a, b) => a.tier - b.tier);

  const playerTier = assessTier(byTier);

  // leak buckets only for errors, grouped by (action, position, stack)
  const leakMap = new Map<string, LeakBucket>();
  for (const r of results) {
    const id = `${r.action}-${r.position}-${r.stackSize}`;
    const existing = leakMap.get(id);
    if (existing) {
      existing.total += 1;
      if (!r.isCorrect) {
        existing.errors += 1;
        existing.examples.push(r);
      }
    } else {
      leakMap.set(id, {
        id,
        action: r.action,
        actionLabel: spotDisplayLabel(r.action, r.position),
        position: r.position,
        stackBand: stackBand(r.stackSize),
        errors: r.isCorrect ? 0 : 1,
        total: 1,
        examples: r.isCorrect ? [] : [r],
        recommendation: recommendationFor(r.action, r.position, r.stackSize),
        lessons: recommendLessons(r.action, r.position, r.stackSize),
      });
    }
  }

  const leaks = Array.from(leakMap.values())
    .filter((l) => l.errors > 0)
    .sort((a, b) => b.errors - a.errors);

  return {
    totalCorrect,
    totalErrors,
    totalDrills,
    accuracyPct:
      totalDrills > 0 ? Math.round((totalCorrect / totalDrills) * 100) : 0,
    playerTier,
    playerTierLabel: tierLabel(playerTier),
    byTier,
    byTrainer,
    leaks,
  };
}
