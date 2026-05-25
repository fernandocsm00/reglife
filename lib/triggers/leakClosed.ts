/**
 * lib/triggers/leakClosed.ts — Dispara notificação quando o aluno fecha
 * um (ou mais) leaks no retake. Chamado pelo cron de health-score.
 *
 * Throttle: 24h entre disparos do mesmo aluno (anti double-fire em
 * re-runs do cron). force=true ignora quiet hours porque é celebratório
 * e perde valor se atrasado.
 */

import { hasNotificationRecently, sendEvNotification } from "@/lib/notify";

export async function fireLeakClosed(args: {
  diagnosticId: string;
  newlyClosedCount: number;
  totalClosed: number;
  totalLeaks: number;
}): Promise<"fired" | "throttled" | "noop"> {
  if (args.newlyClosedCount <= 0) return "noop";
  if (await hasNotificationRecently(args.diagnosticId, "leak_closed", 24)) {
    return "throttled";
  }

  await sendEvNotification({
    diagnosticId: args.diagnosticId,
    kind: "leak_closed",
    trigger: "leak_closed",
    title: args.newlyClosedCount === 1
      ? "🎯 Leak fechado"
      : `🎯 ${args.newlyClosedCount} leaks fechados`,
    facts: {
      fechados_hoje: args.newlyClosedCount,
      total_fechados: args.totalClosed,
      total_leaks_originais: args.totalLeaks,
      progresso_de_fechamento: `${args.totalClosed}/${args.totalLeaks}`,
    },
    fallback:
      args.newlyClosedCount === 1
        ? `Você fechou 1 leak no retake (${args.totalClosed}/${args.totalLeaks}). Próximo alvo?`
        : `Você fechou ${args.newlyClosedCount} leaks no retake (${args.totalClosed}/${args.totalLeaks}). Próximo alvo?`,
    force: true,
  });

  return "fired";
}
