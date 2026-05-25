/**
 * lib/health/score.ts — Fórmula pura do Health Score.
 *
 * HealthScore = 0.8·Resultado + 0.1·Conclusão + 0.1·Sentimento
 *
 * Resultado:
 *   resultado = 0.7·leakScore + 0.3·roiScore
 *   leakScore = (fechados / total) × 100, ou null se total=0
 *   roiScore  = clip(50 + 10·ΔROI, 0, 100), ou null se sem SS
 *   Se roiScore=null → resultado = leakScore (peso 1.0 dentro do Resultado).
 *   Se leakScore=null e roiScore=null → resultado=null.
 *
 * Conclusão:
 *   conclusao = min(100, tasksChecked / tasksExpected × 100), null se expected=0
 *
 * Sentimento:
 *   média dos últimos 4 pulses (😣=0 / 😐=33 / 🙂=66 / 😄=100); null se vazio.
 *
 * Redistribuição de pesos:
 *   Os componentes null saem do somatório; os pesos restantes são renormalizados
 *   pra somar 1. Se todos forem null → health=0 e banda=red.
 */

import {
  WEIGHT_RESULTADO,
  WEIGHT_CONCLUSAO,
  WEIGHT_SENTIMENTO,
  type HealthBreakdown,
  type HealthScore,
  type PlayerState,
} from "./types";
import { closedLeaks } from "./leakClosed";
import { bandFor } from "./band";

const PULSE_VALUE: Record<"sad" | "meh" | "smile" | "grin", number> = {
  sad: 0, meh: 33, smile: 66, grin: 100,
};

function clip(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function calcLeakScore(closed: number, total: number): number | null {
  if (total <= 0) return null;
  return (closed / total) * 100;
}

function calcRoiScore(baseline: number | null, current: number | null): number | null {
  if (baseline === null || current === null) return null;
  return clip(50 + 10 * (current - baseline), 0, 100);
}

function calcResultado(leakScore: number | null, roiScore: number | null): number | null {
  if (leakScore === null && roiScore === null) return null;
  if (roiScore === null) return leakScore;        // só leak vale
  if (leakScore === null) return roiScore;        // sem leaks identificados, só ROI
  return 0.7 * leakScore + 0.3 * roiScore;
}

function calcConclusao(checked: number, expected: number): number | null {
  if (expected <= 0) return null;
  return Math.min(100, (checked / expected) * 100);
}

function calcSentimento(recent: Array<"sad" | "meh" | "smile" | "grin">): number | null {
  if (recent.length === 0) return null;
  const slice = recent.slice(0, 4);
  const sum = slice.reduce((acc, e) => acc + PULSE_VALUE[e], 0);
  return sum / slice.length;
}

/**
 * Combina os componentes com pesos default e renormaliza ignorando nulls.
 * Retorna 0 se TODOS forem null (caso degenerado).
 */
function combine(
  resultado: number | null,
  conclusao: number | null,
  sentimento: number | null
): { health: number; weights: HealthBreakdown["weights"] } {
  const parts: Array<{ value: number; weight: number; key: "resultado" | "conclusao" | "sentimento" }> = [];
  if (resultado !== null) parts.push({ value: resultado, weight: WEIGHT_RESULTADO, key: "resultado" });
  if (conclusao !== null) parts.push({ value: conclusao, weight: WEIGHT_CONCLUSAO, key: "conclusao" });
  if (sentimento !== null) parts.push({ value: sentimento, weight: WEIGHT_SENTIMENTO, key: "sentimento" });

  const weights = { resultado: 0, conclusao: 0, sentimento: 0 };
  if (parts.length === 0) return { health: 0, weights };

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  let health = 0;
  for (const p of parts) {
    const w = p.weight / totalWeight;
    weights[p.key] = w;
    health += p.value * w;
  }
  return { health, weights };
}

export function computeHealth(state: PlayerState): HealthScore {
  const { closed, total } = closedLeaks(state.diagnosticSpots, state.retakeSpots);

  const leakScore = calcLeakScore(closed.length, total);
  const roiScore = calcRoiScore(state.roiBaseline, state.roi30d);
  const resultado = calcResultado(leakScore, roiScore);
  const conclusao = calcConclusao(state.tasksChecked, state.tasksExpected);
  const sentimento = calcSentimento(state.recentPulses);

  const { health, weights } = combine(resultado, conclusao, sentimento);
  const band = bandFor(health);

  const breakdown: HealthBreakdown = {
    leaksClosed: closed.length,
    leaksTotal: total,
    leakScore,
    roiScore,
    resultado,
    tasksChecked: state.tasksChecked,
    tasksExpected: state.tasksExpected,
    conclusao,
    pulsesUsed: state.recentPulses.slice(0, 4).length,
    sentimento,
    weights,
  };

  return {
    health: Number(health.toFixed(2)),
    band,
    breakdown,
  };
}
