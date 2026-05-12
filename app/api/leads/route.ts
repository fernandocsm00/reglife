/**
 * POST /api/leads — captura do lead no momento que o quiz é enviado.
 *
 * Cria a linha em `reglife_diagnostic_results` com dados de identidade,
 * canais e quiz (lead score). NÃO gera PDF nem dispara email/WhatsApp —
 * isso só acontece depois que o teste é concluído (via /api/results).
 *
 * Retorna `{ id }` que o frontend guarda no store e usa pro UPDATE no fim
 * do teste. Lead que abandona no meio do teste já fica registrado no /admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("[api/leads] SUPABASE env vars not configured");
    return NextResponse.json(
      { error: "Server misconfigured: missing Supabase env vars" },
      { status: 500 }
    );
  }

  const volumeTarget =
    typeof body.volumeTargetWeekly === "number" && body.volumeTargetWeekly > 0
      ? Math.round(body.volumeTargetWeekly)
      : null;

  const notifyChannels: string[] = Array.isArray(body.notifyChannels)
    ? body.notifyChannels.filter((c: unknown) => typeof c === "string")
    : ["email"];

  const whatsappPhone =
    typeof body.whatsappPhone === "string" && body.whatsappPhone.trim()
      ? body.whatsappPhone.trim()
      : null;

  const quizAnswers =
    body.quizAnswers && typeof body.quizAnswers === "object"
      ? body.quizAnswers
      : null;
  const leadScore =
    typeof body.leadScore === "number" && Number.isFinite(body.leadScore)
      ? Math.round(body.leadScore)
      : null;
  const leadCategory =
    typeof body.leadCategory === "string" ? body.leadCategory : null;
  const stakeGrade =
    typeof body.stakeGrade === "number" && Number.isFinite(body.stakeGrade)
      ? body.stakeGrade
      : null;

  const { data, error } = await supabase
    .from("reglife_diagnostic_results")
    .insert([
      {
        player_name: body.playerName ?? "Jogador",
        email: body.email ?? null,
        phone: body.phone ?? null,
        study_time: body.studyTime ?? "ate15",
        profit_goal: body.profitGoal ?? null,
        volume_target_weekly: volumeTarget,
        notify_channels: notifyChannels,
        whatsapp_phone: whatsappPhone,
        quiz_answers: quizAnswers,
        lead_score: leadScore,
        lead_category: leadCategory,
        stake_grade: stakeGrade,
        // Test ainda não rodou — fica vazio
        stopped_early: false,
        spots_played: 0,
        spots_failed: 0,
        spot_summaries: [],
        results: [],
      },
    ])
    .select("id")
    .single();

  if (error) {
    console.error("[api/leads] insert error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
