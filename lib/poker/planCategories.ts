// lib/poker/planCategories.ts — Agrega o byTrainer em "categorias estratégicas"
// pra a seção Performance por Categoria no /meu-plano.
//
// Mapeia o spotLabel (que é o `config.name` do JSON do spot, ex.: "Vs RFI —
// reg.life") em uma categoria human-readable. Spots não mapeados caem em
// "Outros".

import type { SavedPlan } from "./planStorage";

/** Tier de cada spot por nome (config.name do JSON). Usado no grid de resultado. */
const TIER_BY_SPOT_LABEL: Record<string, 1 | 2 | 3> = {
  "RFI": 1,
  "Vs RFI": 1,
  "Jogando do BB": 1,
  "Blind War Pré Flop": 1,
  "Cbet em posição vs BB": 1,
  // Spots antigos (turn e river separados) — mantidos por compatibilidade
  // com planos antigos no localStorage de alunos que já testaram.
  "Cbet Turn em posição vs o BB": 1,
  "Cbet River em posição vs o BB": 1,
  // Spot novo merged (turn+river num único bloco)
  "Cbet Turn e River em Posição vs BB": 1,
  "Jogando vs Cbet do BB": 1,
  "Defesa de BB Multway": 2,
  "Enfrentando uma 3bet": 2,
  "Cbet Fora de Posição": 2,
  "Jogando em Posição": 2,
};

export function tierForSpotLabel(label: string): 1 | 2 | 3 | null {
  return TIER_BY_SPOT_LABEL[label] ?? null;
}

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
  "RFI": "Pré-flop Open",

  // Pré-flop defesa
  "Vs RFI": "Vs RFI",
  "Jogando do BB": "Defesa de BB",

  // Blind war pré-flop
  "Blind War Pré Flop": "Blind War",

  // Pots 3-betados
  "Enfrentando uma 3bet": "Pots 3-betados",

  // Pós-flop como agressor
  "Cbet em posição vs BB": "Cbet Pós-flop",
  "Cbet Turn em posição vs o BB": "Cbet Pós-flop",
  "Cbet River em posição vs o BB": "Cbet Pós-flop",
  "Cbet Turn e River em Posição vs BB": "Cbet Pós-flop",
  "Cbet Fora de Posição": "Cbet Pós-flop",

  // Pós-flop como defensor (e bet vs missed)
  "Jogando vs Cbet do BB": "Vs Cbet",
  "Jogando em Posição": "Vs Cbet",

  // Multiway
  "Defesa de BB Multway": "Multiway",
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
