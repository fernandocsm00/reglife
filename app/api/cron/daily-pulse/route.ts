/**
 * GET /api/cron/daily-pulse
 *
 * Cron diário 21h UTC (18h BRT). É o "olho" do Rex que verifica condições
 * que dependem do tempo:
 *   - streak_risk: aluno sem atividade há ≥36h
 *   - phase_transition: dia 31 ou 61 do ciclo (mudança de fase)
 *
 * Cada trigger é throttled — Rex não fala 2x do mesmo no mesmo dia.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hasNotificationRecently, sendRexNotification } from "@/lib/notify";

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

  await sendRexNotification({
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

  await sendRexNotification({
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

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  if (req.headers.get("authorization") === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get("secret") === expected) return true;
  return false;
}
