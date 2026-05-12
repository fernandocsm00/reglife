import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { generatePlanPdf } from "@/lib/pdf/generatePlanPdf";
import {
  getPlanPdfPublicUrl,
  uploadPlanPdf,
} from "@/lib/pdf/storage";
import { sendPlanReportEmail } from "@/lib/email";
import { sendPlanReportWhatsapp } from "@/lib/notify";
import type { SavedPlan } from "@/lib/poker/planStorage";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("[api/results] SUPABASE env vars not configured");
    return NextResponse.json(
      { error: "Server misconfigured: missing Supabase env vars" },
      { status: 500 }
    );
  }

  const ssUsername =
    typeof body.sharkscopeUsername === "string" && body.sharkscopeUsername.trim()
      ? body.sharkscopeUsername.trim()
      : null;
  const ssNetwork = ssUsername ? body.sharkscopeNetwork ?? "PokerStars" : null;
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

  const savedPlan = body.savedPlan as SavedPlan | undefined;

  // Lead scoring (admin-side, lead não vê)
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
        study_time: body.studyTime ?? null,
        profit_goal: body.profitGoal ?? null,
        stopped_early: body.stoppedEarly ?? false,
        spots_played: body.spotsPlayed ?? 0,
        spots_failed: body.spotsFailed ?? 0,
        spot_summaries: body.spotSummaries ?? [],
        results: body.results ?? [],
        sharkscope_username: ssUsername,
        sharkscope_network: ssNetwork,
        volume_target_weekly: volumeTarget,
        notify_channels: notifyChannels,
        whatsapp_phone: whatsappPhone,
        saved_plan: savedPlan ?? null,
        quiz_answers: quizAnswers,
        lead_score: leadScore,
        lead_category: leadCategory,
        stake_grade: stakeGrade,
      },
    ])
    .select("id")
    .single();

  if (error) {
    console.error("[api/results] insert error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const diagnosticId = data.id;
  let pdfUrl: string | null = null;

  if (savedPlan) {
    try {
      const planWithId: SavedPlan = { ...savedPlan, diagnosticId };
      const buffer = await generatePlanPdf(planWithId);
      const upload = await uploadPlanPdf(diagnosticId, buffer);
      if (upload.ok) {
        pdfUrl = getPlanPdfPublicUrl(diagnosticId);

        const origin = req.nextUrl.origin;
        const shortUrl = `${origin}/r/${diagnosticId}`;

        // Registra no feed in-app que o plano foi entregue (fire-and-forget)
        supabase
          .from("notifications")
          .insert({
            diagnostic_id: diagnosticId,
            kind: "plan_delivered",
            title: "Seu plano foi entregue",
            body: "Relatório do nivelamento disponível. Baixe quando quiser.",
            payload: { pdfUrl, shortUrl },
            channels_sent: ["in_app"],
          })
          .then(({ error }) => {
            if (error)
              console.error("[api/results] notification insert failed", error);
          });

        if (notifyChannels.includes("email") && body.email) {
          void sendPlanReportEmail({
            to: body.email,
            playerName: body.playerName ?? "Jogador",
            pdfBuffer: buffer,
            downloadUrl: shortUrl,
          }).catch((err) =>
            console.error("[api/results] email dispatch failed", err)
          );
        }

        if (notifyChannels.includes("whatsapp") && whatsappPhone) {
          void sendPlanReportWhatsapp({
            phone: whatsappPhone,
            playerName: body.playerName ?? "Jogador",
            pdfUrl: shortUrl,
          }).catch((err) =>
            console.error("[api/results] whatsapp dispatch failed", err)
          );
        }
      } else {
        console.error("[api/results] PDF upload failed:", upload.error);
      }
    } catch (err) {
      console.error("[api/results] PDF generation failed:", err);
    }
  }

  return NextResponse.json({ id: diagnosticId, pdfUrl }, { status: 201 });
}

// GET /api/results — list all (admin)
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const expected = process.env.ADMIN_SECRET ?? "reglife2024";
  if (secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("reglife_diagnostic_results")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
