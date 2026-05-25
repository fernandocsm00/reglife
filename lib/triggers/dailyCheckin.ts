/**
 * lib/triggers/dailyCheckin.ts — Check-in diário do EV (cobrança leve).
 *
 * Regras desta Fase A (cadência ainda não existe — Fase C plugará):
 *   - Roda em dia útil (seg-sex local).
 *   - Pula se aluno teve atividade nas últimas 18h (ele já tá no ritmo).
 *   - Pula se já mandou daily_checkin nas últimas 20h.
 *   - Não usa force — respeita quiet hours.
 */

import { createClient } from "@supabase/supabase-js";
import { hasNotificationRecently, sendEvNotification } from "@/lib/notify";
import { type Cadence } from "@/lib/triggers/cadenceRules";

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "[triggers/dailyCheckin] NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios"
    );
  }
  return createClient(url, key);
}

/** True se hoje (em UTC, suficiente pra escala atual) é seg-sex. */
function isWeekday(): boolean {
  const d = new Date().getUTCDay(); // 0=dom, 6=sab
  return d >= 1 && d <= 5;
}

async function lastActivityHours(diagnosticId: string): Promise<number | null> {
  const supabase = service();
  const { data } = await supabase
    .from("diagnostic_activity")
    .select("created_at")
    .eq("diagnostic_id", diagnosticId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const ts = new Date((data as { created_at: string }).created_at).getTime();
  return (Date.now() - ts) / 3_600_000;
}

export async function fireDailyCheckin(args: {
  diagnosticId: string;
  playerName: string;
  cycleDay: number;
  currentPhase: string;
  tasksChecked: number;
  tasksExpected: number;
  cadence: Cadence;
}): Promise<"fired" | "throttled" | "noop"> {
  // Leve não recebe daily_checkin (nem in_app). Spec da Fase C decidiu.
  if (args.cadence === "leve") return "noop";

  if (!isWeekday()) return "noop";

  const hours = await lastActivityHours(args.diagnosticId);
  if (hours !== null && hours < 18) return "noop";

  if (await hasNotificationRecently(args.diagnosticId, "daily_checkin", 20)) {
    return "throttled";
  }

  const aderencia =
    args.tasksExpected > 0
      ? `${args.tasksChecked}/${args.tasksExpected}`
      : "ainda sem tasks";

  await sendEvNotification({
    diagnosticId: args.diagnosticId,
    kind: "daily_checkin",
    trigger: "daily_checkin",
    title: "Bate aqui rapidinho",
    facts: {
      dia_do_ciclo: args.cycleDay,
      fase_atual: args.currentPhase,
      aderencia_tasks: aderencia,
      horas_sem_atividade: hours !== null ? Math.round(hours) : "n/a",
    },
    fallback: `Dia ${args.cycleDay}/90 — ${args.currentPhase}. ${aderencia} tasks. O que falta pra fechar essa semana?`,
  });

  return "fired";
}
