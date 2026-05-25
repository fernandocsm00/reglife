/**
 * lib/triggers/weeklyReview.ts — Review de domingo do EV.
 *
 * Roda só DOMINGO (UTC; suficiente pra escala atual, refina na Fase C
 * com timezone do aluno). Faz um balanço numérico simples:
 *   - tasks marcadas na semana
 *   - dia do ciclo + fase atual
 *   - SharkScope summary (se houver)
 *
 * Throttle: 6 dias (não repete em re-runs do mesmo domingo).
 */

import { createClient } from "@supabase/supabase-js";
import { hasNotificationRecently, sendEvNotification } from "@/lib/notify";

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "[triggers/weeklyReview] NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios"
    );
  }
  return createClient(url, key);
}

function isSunday(): boolean {
  return new Date().getUTCDay() === 0;
}

export async function fireWeeklyReview(args: {
  diagnosticId: string;
  playerName: string;
  cycleDay: number;
  currentPhase: string;
}): Promise<"fired" | "throttled" | "noop"> {
  if (!isSunday()) return "noop";
  if (await hasNotificationRecently(args.diagnosticId, "weekly_review", 24 * 6)) {
    return "throttled";
  }

  const supabase = service();

  // Tasks marcadas nos últimos 7 dias (via diagnostic_activity)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { count: tasksWeek } = await supabase
    .from("diagnostic_activity")
    .select("*", { count: "exact", head: true })
    .eq("diagnostic_id", args.diagnosticId)
    .eq("event_type", "task_checked")
    .gte("created_at", sevenDaysAgo);

  // SharkScope summary atual
  const { data: diag } = await supabase
    .from("reglife_diagnostic_results")
    .select("sharkscope_summary")
    .eq("id", args.diagnosticId)
    .single();
  const ss = (diag?.sharkscope_summary as { entries?: number; avgRoi?: number; itm?: number } | null) ?? null;

  await sendEvNotification({
    diagnosticId: args.diagnosticId,
    kind: "weekly_review",
    trigger: "weekly_review",
    title: "Domingo é review",
    facts: {
      dia_do_ciclo: args.cycleDay,
      fase: args.currentPhase,
      tasks_nesta_semana: tasksWeek ?? 0,
      sharkscope_torneios_acumulado: ss?.entries ?? "n/a",
      sharkscope_roi_acumulado: ss?.avgRoi != null ? `${ss.avgRoi.toFixed(1)}%` : "n/a",
    },
    fallback: `Semana fechou. ${tasksWeek ?? 0} tasks marcadas, dia ${args.cycleDay}/90. Onde foi o foco e onde travou?`,
  });

  return "fired";
}
