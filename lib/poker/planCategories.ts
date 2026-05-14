// lib/poker/planCategories.ts — Agrega o byTrainer em "categorias estratégicas"
// pra a seção Performance por Categoria no /meu-plano.
//
// Mapeia o spotLabel (que é o `config.name` do JSON do spot, ex.: "Vs RFI —
// reg.life") em uma categoria human-readable. Spots não mapeados caem em
// "Outros".

import type { SavedPlan } from "./planStorage";

/** Categorias na ordem em que devem ser exibidas. */
export const CATEGORY_ORDER = [
  "Pré-flop Open",
  "Vs RFI",
  "Defesa de BB",
  "Blind War",
  "Pots 3-betados",
  "Cbet Pós-flop",
  "Vs Cbet",
  "Multiway",
  "Outros",
] as const;

const CATEGORY_BY_SPOT_LABEL: Record<string, string> = {
  // Pré-flop opening
  "RFI Prioridades — reg.life": "Pré-flop Open",

  // Pré-flop defesa
  "Vs RFI — reg.life": "Vs RFI",
  "Defesa de Big Blind — reg.life": "Defesa de BB",

  // Blind war pré-flop
  "Blind War — SB GAP — reg.life": "Blind War",
  "Blind War — SB vs ISO — reg.life": "Blind War",
  "Blind War — BB vs Limp — reg.life": "Blind War",
  "Blind War — BB vs Raise — reg.life": "Blind War",

  // Pots 3-betados
  "Vs 3-Bet EP/MP — reg.life": "Pots 3-betados",
  "Vs 3-Bet BTN vs SB — reg.life": "Pots 3-betados",

  // Pós-flop como agressor
  "C-Bet Flop vs BB — reg.life": "Cbet Pós-flop",
  "C-Bet Turn vs BB — reg.life": "Cbet Pós-flop",
  "C-Bet River vs BB — reg.life": "Cbet Pós-flop",
  "Cbet vs BTN — reg.life": "Cbet Pós-flop",
  "Bet vs Missed Cbet (BTN vs CO) — reg.life": "Cbet Pós-flop",

  // Pós-flop como defensor
  "Vs C-Bet Flop do BB — reg.life": "Vs Cbet",
  "Vs C-Bet Flop do BTN — reg.life": "Vs Cbet",

  // Multiway
  "Defesa de BB Multiway — reg.life": "Multiway",
};

export interface CategoryPerformance {
  category: string;
  correct: number;
  total: number;
  pct: number;
}

/**
 * Agrega o byTrainer do SavedPlan em categorias.
 * Retorna apenas as categorias que tiveram pelo menos 1 spot jogado,
 * ordenadas pela ordem canônica.
 */
export function performanceByCategory(
  plan: SavedPlan
): CategoryPerformance[] {
  const map = new Map<string, { correct: number; total: number }>();

  for (const entry of plan.byTrainer) {
    const category = CATEGORY_BY_SPOT_LABEL[entry.label] ?? "Outros";
    const cur = map.get(category) ?? { correct: 0, total: 0 };
    cur.correct += entry.correct;
    cur.total += entry.total;
    map.set(category, cur);
  }

  const order = new Map<string, number>(
    CATEGORY_ORDER.map((c, i) => [c as string, i])
  );

  return Array.from(map.entries())
    .map(([category, v]) => ({
      category,
      correct: v.correct,
      total: v.total,
      pct: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
    }))
    .filter((c) => c.total > 0)
    .sort((a, b) => {
      const oa = order.get(a.category) ?? 999;
      const ob = order.get(b.category) ?? 999;
      return oa - ob;
    });
}

/** Top N spots fortes (pct >= 70%, ordenados do mais forte). */
export function topStrengths(plan: SavedPlan, n: number = 3) {
  return [...plan.byTrainer]
    .filter((b) => b.pct >= 70 && b.total >= 1)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, n)
    .map((b) => ({
      label: b.label.replace(/ — reg\.life$/, ""),
      pct: b.pct,
      correct: b.correct,
      total: b.total,
    }));
}

/** Top N pontos fracos (pct < 70%, ordenados do mais fraco). */
export function topWeaknesses(plan: SavedPlan, n: number = 3) {
  return [...plan.byTrainer]
    .filter((b) => b.pct < 70 && b.total >= 1)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, n)
    .map((b) => ({
      label: b.label.replace(/ — reg\.life$/, ""),
      pct: b.pct,
      correct: b.correct,
      total: b.total,
    }));
}
