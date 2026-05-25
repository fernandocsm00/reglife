/**
 * lib/triggers/healthBandChange.ts — Dispara quando o Health Score muda
 * de faixa. Chamado pelo cron de health-score após detectar diff.
 *
 * Regras:
 *   - Sobe (red→orange, orange→yellow, yellow→green) → tom positivo, sem force.
 *   - Desce (green→yellow, yellow→orange, orange→red) → tom de check, force=true
 *     pra atravessar quiet hours quando vai pra laranja/vermelho (sinal de alerta).
 *   - Throttle: 48h (evita ping-pong de faixa).
 */

import { hasNotificationRecently, sendEvNotification } from "@/lib/notify";
import type { HealthBand } from "@/lib/health/types";

const ORDER: HealthBand[] = ["red", "orange", "yellow", "green"];

function isImprovement(from: HealthBand, to: HealthBand): boolean {
  return ORDER.indexOf(to) > ORDER.indexOf(from);
}

export async function fireHealthBandChange(args: {
  diagnosticId: string;
  from: HealthBand;
  to: HealthBand;
  health: number;
}): Promise<"fired" | "throttled" | "noop"> {
  if (args.from === args.to) return "noop";
  if (await hasNotificationRecently(args.diagnosticId, "health_band_change", 48)) {
    return "throttled";
  }

  const improved = isImprovement(args.from, args.to);
  const forceWhenWorrying = !improved && (args.to === "orange" || args.to === "red");

  await sendEvNotification({
    diagnosticId: args.diagnosticId,
    kind: "health_band_change",
    trigger: "health_band_change",
    title: improved
      ? `📈 Saúde subiu pra ${args.to}`
      : `⚠️ Saúde caiu pra ${args.to}`,
    facts: {
      direcao: improved ? "subida" : "descida",
      faixa_anterior: args.from,
      faixa_nova: args.to,
      health_score_atual: args.health.toFixed(0),
    },
    fallback: improved
      ? `Seu indicador subiu de ${args.from} pra ${args.to} (HS ${args.health.toFixed(0)}). Mantém o que tá funcionando.`
      : `Indicador caiu de ${args.from} pra ${args.to} (HS ${args.health.toFixed(0)}). O que tá pesando?`,
    force: forceWhenWorrying,
  });

  return "fired";
}
