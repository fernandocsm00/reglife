/**
 * GET /api/cron/daily-pulse
 *
 * Cron diário 21h UTC (18h BRT). É o "olho" do EV que verifica condições
 * que dependem do tempo:
 *   - streak_risk: aluno sem atividade há ≥36h
 *   - phase_transition: dia 31 ou 61 do ciclo (mudança de fase)
 *
 * Cada trigger é throttled — EV não fala 2x do mesmo no mesmo dia.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hasNotificationRecently, sendEvNotification } from "@/lib/notify";
import { fireDailyCheckin } from "@/lib/triggers/dailyCheckin";
// TODO(T14): uncomment when weeklyReview lands
// import { fireWeeklyReview } from "@/lib/triggers/weeklyReview";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface DiagRow {
  id: string;
  player_name: string;
  created_at: string;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = service();

  const { data: rows, error } = await supabase
    .from("reglife_diagnostic_results")
    .select("id, player_name, created_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const stats = {
    total: rows?.length ?? 0,
    streak_risk: 0,
    phase_transition: 0,
    daily_checkin: 0,
    weekly_review: 0,
    skipped: 0,
  };

  for (const row of (rows ?? []) as DiagRow[]) {
    // ---- Streak em risco -------------------------------------------------
    const streakHandled = await maybeStreakRisk(row);
    if (streakHandled === "fired") stats.streak_risk += 1;
    else if (streakHandled === "throttled") stats.skipped += 1;

    // ---- Phase transition (dia 31 e 61 do ciclo) ------------------------
    const phaseHandled = await maybePhaseTransition(row);
    if (phaseHandled === "fired") stats.phase_transition += 1;
    else if (phaseHandled === "throttled") stats.skipped += 1;

    // ---- Daily check-in (seg-sex) ---------------------------------------
    const checkinHandled = await maybeDailyCheckin(row);
    if (checkinHandled === "fired") stats.daily_checkin += 1;
    else if (checkinHandled === "throttled") stats.skipped += 1;

    // TODO(T14): uncomment when weeklyReview lands
    // const weeklyHandled = await maybeWeeklyReview(row);
    // if (weeklyHandled === "fired") stats.weekly_review += 1;
    // else if (weeklyHandled === "throttled") stats.skipped += 1;
  }

  return NextResponse.json({ ok: true, ...stats });
}

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ---------------------------------------------------------------------------
// Streak em risco
// ---------------------------------------------------------------------------
async function maybeStreakRisk(
  row: DiagRow
): Promise<"fired" | "throttled" | "noop"> {
  const supabase = service();
  // Pega último evento de atividade do aluno
  const { data: last } = await supabase
    .from("diagnostic_activity")
    .select("created_at")
    .eq("diagnostic_id", row.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!last) return "noop"; // aluno nunca teve atividade — não tem streak a perder

  const lastCreatedAt = (last as { created_at: string }).created_at;
  const hoursSince = (Date.now() - new Date(lastCreatedAt).getTime()) / 3_600_000;
  if (hoursSince < 36 || hoursSince > 96) return "noop";
  // Janela: 36h-96h sem atividade. Antes disso, ainda tá no ritmo. Depois,
  // já passou do streak — vira candidato a comeback (gatilho diferente).

  // Throttle: max 1 streak_risk a cada 48h
  if (await hasNotificationRecently(row.id, "streak_risk", 48)) return "throttled";

  await sendEvNotification({
    diagnosticId: row.id,
    kind: "streak_risk",
    trigger: "streak_risk",
    title: "🔥 Sumiu, hein?",
    facts: {
      horas_sem_atividade: Math.round(hoursSince),
      ultimo_evento_em: new Date(lastCreatedAt).toISOString(),
    },
    fallback: `${Math.round(hoursSince)}h sem atividade. O que tá pegando?`,
    force: true, // ultrapassa quiet hours — é o tipo de mensagem que se perde se segurar
  });
  return "fired";
}

// ---------------------------------------------------------------------------
// Transição de fase (dia 31 → Fase 2, dia 61 → Fase 3)
// ---------------------------------------------------------------------------
async function maybePhaseTransition(
  row: DiagRow
): Promise<"fired" | "throttled" | "noop"> {
  const supabase = service();
  const cycleDay =
    Math.floor((Date.now() - new Date(row.created_at).getTime()) / 86_400_000) + 1;

  // Só dispara nos dias exatos de transição
  if (cycleDay !== 31 && cycleDay !== 61) return "noop";

  if (await hasNotificationRecently(row.id, "phase_transition", 24 * 7)) {
    // Já avisou na semana — não repete (segurança em re-runs do cron)
    return "throttled";
  }

  const phaseFrom = cycleDay === 31 ? "Fase 1 — Fundamentos" : "Fase 2 — Aplicação";
  const phaseTo = cycleDay === 31 ? "Fase 2 — Aplicação" : "Fase 3 — Integração";

  await sendEvNotification({
    diagnosticId: row.id,
    kind: "phase_transition",
    trigger: "phase_transition",
    title: `🚀 Entrando na ${phaseTo}`,
    facts: {
      dia_do_ciclo: cycleDay,
      fase_anterior: phaseFrom,
      fase_nova: phaseTo,
    },
    fallback: `Dia ${cycleDay} do ciclo. ${phaseFrom} → ${phaseTo}.`,
  });

  // Marca também como evento de progresso (registra XP por marco)
  await supabase.from("diagnostic_activity").insert({
    diagnostic_id: row.id,
    event_type: "phase_transition",
    event_data: { from: phaseFrom, to: phaseTo, day: cycleDay },
    xp_earned: 200,
  });

  return "fired";
}

// ---------------------------------------------------------------------------
// Daily check-in (seg-sex)
// ---------------------------------------------------------------------------
async function maybeDailyCheckin(
  row: DiagRow
): Promise<"fired" | "throttled" | "noop"> {
  // Coleta dados mínimos pro check-in (sem health-score; isso é trigger temporal)
  const cycleDay =
    Math.floor((Date.now() - new Date(row.created_at).getTime()) / 86_400_000) + 1;
  const phase =
    cycleDay <= 30 ? "Fase 1 — Fundamentos"
    : cycleDay <= 60 ? "Fase 2 — Aplicação"
    : "Fase 3 — Integração";

  // Conta tasks marcadas vs esperadas (lookup leve, sem usar collect.ts)
  const supabase = service();
  const { data: plan } = await supabase
    .from("plans")
    .select("data")
    .eq("diagnostic_id", row.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const data = (plan?.data as { phases?: Array<{ tasks?: unknown[] }>; progress?: { checkedTaskIds?: string[] } } | null) ?? null;
  const phasesPassed = cycleDay <= 30 ? 1 : cycleDay <= 60 ? 2 : 3;
  const tasksExpected = (data?.phases ?? []).slice(0, phasesPassed)
    .reduce((acc, p) => acc + (p.tasks?.length ?? 0), 0);
  const tasksChecked = Math.min(tasksExpected, (data?.progress?.checkedTaskIds ?? []).length);

  return fireDailyCheckin({
    diagnosticId: row.id,
    playerName: row.player_name,
    cycleDay,
    currentPhase: phase,
    tasksChecked,
    tasksExpected,
  });
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  if (req.headers.get("authorization") === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get("secret") === expected) return true;
  return false;
}
