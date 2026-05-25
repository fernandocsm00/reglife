/**
 * lib/health/band.ts — Mapeia score 0-100 em banda de saúde.
 * Função pura. Fronteiras alinhadas com o spec (80/60/40).
 */

import type { HealthBand } from "./types";

export function bandFor(health: number): HealthBand {
  if (health >= 80) return "green";
  if (health >= 60) return "yellow";
  if (health >= 40) return "orange";
  return "red";
}

/** Label visual em pt-BR. */
export const BAND_LABEL: Record<HealthBand, string> = {
  green:  "Verde",
  yellow: "Amarelo",
  orange: "Laranja",
  red:    "Vermelho",
};
