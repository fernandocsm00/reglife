import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";
import { generatePlanPdf } from "@/lib/pdf/generatePlanPdf";
import {
  getPlanPdfPublicUrl,
  uploadPlanPdf,
} from "@/lib/pdf/storage";
import { sendPlanReportEmail } from "@/lib/email";
import { sendPlanReportWhatsapp } from "@/lib/notify";
import {
  requireDiagSession,
  setDiagSessionCookie,
} from "@/lib/session";
import { LEAD_CATEGORY_LABELS } from "@/lib/poker/leadScoring";
import type { SavedPlan } from "@/lib/poker/planStorage";

const DEFAULT_RESULTS_WEBHOOK_URL =
  "https://webhook-n8n.reglife.com.br/webhook/a0c6f323-a9af-4e32-84a2-6f5b997d671d";

interface ResultsWebhookSpotSummary {
  label: string;
  action: string;
  tier: number;
  correct: number;
  total: number;
  pct: number;
  passed: boolean;
}

interface ResultsWebhookPayload {
  event: "diagnostic.completed";
  diagnosticId: string;
  previousDiagnosticId: string | null;
  completedAt: string;
  player: {
    name: string;
    email: string | null;
    phone: string | null;
  };
  result: {
    overallPct: number;
    spotsPlayed: number;
    spotsFailed: number;
    totalDrills: number;
    totalCorrect: number;
    stoppedEarly: boolean;
    isElite: boolean;
    spotSummaries: ResultsWebhookSpotSummary[];
  };
  leadScoring: {
    score: number | null;
    category: string | null;
    categoryLabel: string | null;
    stakeGrade: number | null;
    quiz: Record<string, string> | null;
  };
  pdfUrl: string | null;
}

async function fireResultsWebhook(payload: ResultsWebhookPayload): Promise<void> {
  const url = process.env.RESULTS_WEBHOOK_URL ?? DEFAULT_RESULTS_WEBHOOK_URL;
  if (!url) {
    console.warn("[results] webhook desabilitado (sem RESULTS_WEBHOOK_URL e sem default)");
    return;
  }
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    const elapsed = Date.now() - startedAt;
    if (res.ok) {
      console.log(
        `[results] webhook OK status=${res.status} elapsed=${elapsed}ms diagnosticId=${payload.diagnosticId}`
      );
    } else {
      const respBody = await res.text().catch(() => "");
      console.error(
        `[results] webhook FAIL status=${res.status} elapsed=${elapsed}ms diagnosticId=${payload.diagnosticId} body=${respBody.slice(0, 200)}`
      );
    }
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(
      `[results] webhook EXCEPTION elapsed=${elapsed}ms diagnosticId=${payload.diagnosticId} error=${msg}`
    );
  }
}

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

  // Se vier diagnosticId no body, é o caso "lead já existe (criado pelo
  // /api/leads no fim do quiz) e agora termina o teste" → UPDATE.
  // Sem id no body, segue o INSERT legado (back-compat).
  const existingId =
    typeof body.diagnosticId === "string" && body.diagnosticId.trim()
      ? body.diagnosticId.trim()
      : null;

  // Em retake o frontend manda o id da tentativa anterior aqui pra ligar
  // as linhas. Só faz sentido no INSERT — ignorado no UPDATE.
  const previousDiagnosticId =
    typeof body.previousDiagnosticId === "string" && body.previousDiagnosticId.trim()
      ? body.previousDiagnosticId.trim()
      : null;

  let diagnosticId: string;

  if (existingId) {
    // Path normal: lead já chamou /api/leads no fim do quiz e tem cookie.
    // Cookie tem que bater com o diagnosticId do body — protege contra IDOR.
    const session = await requireDiagSession(existingId);
    if (!session.ok) return session.response;

    const { data: updated, error: updErr } = await supabase
      .from("reglife_diagnostic_results")
      .update({
        // Sobrescreve campos do teste sem mexer em identidade/quiz que já
        // foram salvos no /api/leads
        stopped_early: body.stoppedEarly ?? false,
        spots_played: body.spotsPlayed ?? 0,
        spots_failed: body.spotsFailed ?? 0,
        spot_summaries: body.spotSummaries ?? [],
        results: body.results ?? [],
        saved_plan: savedPlan ?? null,
        // Permite refresh dos canais caso lead tenha mudado preferência no quiz
        notify_channels: notifyChannels,
        whatsapp_phone: whatsappPhone,
      })
      .eq("id", existingId)
      .select("id")
      .single();

    if (updErr || !updated) {
      console.error("[api/results] update error", updErr);
      return NextResponse.json(
        { error: updErr?.message ?? "diagnosticId não encontrado" },
        { status: updErr ? 500 : 404 }
      );
    }
    diagnosticId = updated.id;
  } else {
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
          previous_diagnostic_id: previousDiagnosticId,
        },
      ])
      .select("id")
      .single();

    if (error) {
      console.error("[api/results] insert error", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    diagnosticId = data.id;
    // Path legado (sem /api/leads anterior) — emite o cookie agora pra que
    // /api/plan/pdf POST e demais rotas funcionem nessa mesma sessão.
    // Se SESSION_SECRET estiver mal configurado, isso throwa: NÃO derruba
    // o response. A linha já foi inserida e o frontend precisa do id pra
    // o card de PDF aparecer. O usuário perde a sessão (PDF não baixa) mas
    // pelo menos vê o estado correto.
    try {
      await setDiagSessionCookie(diagnosticId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[api/results] setDiagSessionCookie falhou: ${msg}`);
    }
  }
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

  // Webhook do score técnico: dispara fire-and-forget pra n8n quando há
  // dados de spots reais (não quando alguém envia /api/results sem ter
  // jogado nenhuma mão). Inclui o score por spot, overall, status
  // (elite/early-stop/completo) e cross-reference com o lead scoring
  // do quiz pra n8n cruzar com a entrega do plano.
  const spotSummaries = Array.isArray(body.spotSummaries) ? body.spotSummaries : [];
  if (spotSummaries.length > 0) {
    const totalDrills = spotSummaries.reduce(
      (a: number, s: { total?: number }) => a + (s.total ?? 0),
      0
    );
    const totalCorrect = spotSummaries.reduce(
      (a: number, s: { correct?: number }) => a + (s.correct ?? 0),
      0
    );
    const overallPct =
      totalDrills > 0 ? Math.round((totalCorrect / totalDrills) * 100) : 0;
    const isElite =
      !body.stoppedEarly &&
      spotSummaries.every((s: { passed?: boolean }) => s.passed === true);
    const origin = req.nextUrl.origin;
    const webhookPayload: ResultsWebhookPayload = {
      event: "diagnostic.completed",
      diagnosticId,
      previousDiagnosticId,
      completedAt: new Date().toISOString(),
      player: {
        name: body.playerName ?? "Jogador",
        email: body.email ?? null,
        phone: body.phone ?? null,
      },
      result: {
        overallPct,
        spotsPlayed: body.spotsPlayed ?? spotSummaries.length,
        spotsFailed: body.spotsFailed ?? 0,
        totalDrills,
        totalCorrect,
        stoppedEarly: body.stoppedEarly ?? false,
        isElite,
        spotSummaries,
      },
      leadScoring: {
        score: leadScore,
        category: leadCategory,
        categoryLabel:
          leadCategory && leadCategory in LEAD_CATEGORY_LABELS
            ? LEAD_CATEGORY_LABELS[leadCategory as keyof typeof LEAD_CATEGORY_LABELS]
            : null,
        stakeGrade,
        quiz: quizAnswers as Record<string, string> | null,
      },
      // Aluno elite e abandono não têm PDF — null nesses casos.
      pdfUrl: pdfUrl ? `${origin}/r/${diagnosticId}` : null,
    };
    void fireResultsWebhook(webhookPayload);
  }

  return NextResponse.json({ id: diagnosticId, pdfUrl }, { status: 201 });
}

// GET /api/results — list all (admin)
// Acesso protegido pelo middleware.ts (HTTP Basic Auth com ADMIN_USER /
// ADMIN_PASSWORD). Quem chega aqui já passou pelo middleware.
export async function GET() {
  const { data, error } = await supabase
    .from("reglife_diagnostic_results")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
