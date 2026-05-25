/**
 * lib/health/leakClosed.ts — Decide se um leak foi fechado.
 *
 * Critério (espelhando o spec):
 *   - O bucket de spots aparece no diagnóstico original como "leak"
 *     (passed === false).
 *   - O retake mais recente tem o MESMO bucket com:
 *       pct >= LEAK_CLOSED_ACCURACY * 100  (≥ 85% por padrão)
 *       hands >= LEAK_CLOSED_MIN_HANDS     (≥ 10 mãos por padrão)
 *
 * Função pura: recebe arrays, devolve a lista de labels fechados.
 * Quem busca os arrays é `collect.ts`.
 */

import {
  LEAK_CLOSED_ACCURACY,
  LEAK_CLOSED_MIN_HANDS,
  type SpotSummary,
} from "./types";

export function leaksFromDiagnostic(spots: SpotSummary[]): SpotSummary[] {
  return spots.filter((s) => !s.passed);
}

export function isClosed(
  leak: SpotSummary,
  retakeSpots: SpotSummary[]
): boolean {
  const retake = retakeSpots.find((r) => r.label === leak.label);
  if (!retake) return false;
  if (retake.pct < LEAK_CLOSED_ACCURACY * 100) return false;
  if ((retake.hands ?? 0) < LEAK_CLOSED_MIN_HANDS) return false;
  return true;
}

export function closedLeaks(
  diagnosticSpots: SpotSummary[],
  retakeSpots: SpotSummary[] | null
): { closed: string[]; total: number } {
  const leaks = leaksFromDiagnostic(diagnosticSpots);
  if (!retakeSpots || retakeSpots.length === 0) {
    return { closed: [], total: leaks.length };
  }
  const closed = leaks.filter((l) => isClosed(l, retakeSpots)).map((l) => l.label);
  return { closed, total: leaks.length };
}
