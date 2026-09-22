/**
 * POST /api/leads — captura do lead no momento que o quiz é enviado.
 *
 * Cria a linha em `reglife_diagnostic_results` com dados de identidade,
 * canais, quiz v3 e produto pelo perfil (product_profile). NÃO gera PDF nem dispara email/WhatsApp —
 * isso só acontece depois que o teste é concluído (via /api/results).
 *
 * Após o insert, dispara um webhook fire-and-forget pra automação
 * (n8n) com a resposta do quiz já enriquecida com labels. URL configurável
 * via env LEAD_WEBHOOK_URL.
 *
 * Retorna `{ id }` que o frontend guarda no store e usa pro UPDATE no fim
 * do teste. Lead que abandona no meio do teste já fica registrado no /admin
 * E já foi entregue pro funil de marketing via webhook.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";
import { setDiagSessionCookie } from "@/lib/session";
import { clientIp, hit, rateLimitResponse } from "@/lib/rate-limit";
import {
  QUIZ_QUESTIONS,
  computeStakeGrade,
  labelOf,
  objetivoToProfitGoal,
  parseQuizAnswers,
  studyTimeFromTorneios,
  weeklyVolumeTarget,
  type QuizAnswers,
} from "@/lib/poker/leadScoring";
import { profileProduct, type Product } from "@/lib/poker/productFit";
import { parseLeadSource, type LeadEntry, type LeadUtm } from "@/lib/leadSource";

const DEFAULT_WEBHOOK_URL =
  "https://webhook-n8n.reglife.com.br/webhook/c877387c-88da-44a5-960f-a9f52ee9af69";

/**
 * Enriquece as respostas do quiz v3 com labels human-readable, pro n8n
 * não precisar mapear de "25_34" pra "25 a 34 anos" lá do outro lado.
 */
function enrichQuiz(answers: QuizAnswers) {
  return Object.fromEntries(
    QUIZ_QUESTIONS.map((q) => [
      q.key,
      { value: answers[q.key], label: labelOf(q.key, answers[q.key]) },
    ])
  );
}

interface WebhookPayload {
  event: "lead.quiz_submitted";
  diagnosticId: string;
  createdAt: string;
  player: {
    name: string;
    email: string | null;
    phone: string | null;
  };
  stakeGrade: number;
  productProfile: Product | null;
  source: {
    entry: LeadEntry;
    utm: LeadUtm | null;
  };
  quiz: ReturnType<typeof enrichQuiz>;
  preferences: {
    notifyChannels: string[];
    whatsappPhone: string | null;
  };
  legacy: {
    profitGoal: string | null;
    studyTime: string | null;
    volumeTargetWeekly: number | null;
  };
}

async function fireLeadWebhook(payload: WebhookPayload): Promise<void> {
  const url = process.env.LEAD_WEBHOOK_URL ?? DEFAULT_WEBHOOK_URL;
  if (!url) {
    console.warn("[leads] webhook desabilitado (sem LEAD_WEBHOOK_URL e sem default)");
    return;
  }
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // n8n geralmente é rápido, mas não bloqueia o response do lead
      // se demorar pra responder
      signal: AbortSignal.timeout(10_000),
    });
    const elapsed = Date.now() - startedAt;
    if (res.ok) {
      console.log(
        `[leads] webhook OK status=${res.status} elapsed=${elapsed}ms diagnosticId=${payload.diagnosticId}`
      );
    } else {
      const body = await res.text().catch(() => "");
      console.error(
        `[leads] webhook FAIL status=${res.status} elapsed=${elapsed}ms diagnosticId=${payload.diagnosticId} body=${body.slice(0, 200)}`
      );
    }
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(
      `[leads] webhook EXCEPTION elapsed=${elapsed}ms diagnosticId=${payload.diagnosticId} error=${msg}`
    );
  }
}

export async function POST(req: NextRequest) {
  // Rate-limit: 5 leads/h por IP. Lead real submete uma vez — limite é pra
  // barrar bots/scripts inflando a base e disparando webhook n8n em loop.
  const limitCheck = hit(`leads:ip:${clientIp(req)}`, 5, 60 * 60 * 1000);
  if (!limitCheck.ok) return rateLimitResponse(limitCheck);

  const body = await req.json();

  // Quiz v3: validado e todas as derivações recalculadas no servidor —
  // não confia no que o cliente mandou pra plano/produto.
  const quizAnswers = parseQuizAnswers(body.quizAnswers);
  if (!quizAnswers) {
    return NextResponse.json({ error: "quizAnswers inválido" }, { status: 400 });
  }
  const stakeGrade = computeStakeGrade(quizAnswers);
  const profitGoal = objetivoToProfitGoal(quizAnswers.objetivo);
  const studyTime = studyTimeFromTorneios(quizAnswers.torneiosMes);
  const volumeTarget = weeklyVolumeTarget(quizAnswers.torneiosMes);
  const productProfile = profileProduct(quizAnswers);

  // Origem: porta de entrada (/ ou /plano) + UTMs capturadas na landing.
  // Revalidado aqui — o cliente manda o que estava no sessionStorage.
  const leadSource = parseLeadSource(body.leadSource);

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("[api/leads] SUPABASE env vars not configured");
    return NextResponse.json(
      { error: "Server misconfigured: missing Supabase env vars" },
      { status: 500 }
    );
  }

  const notifyChannels: string[] = Array.isArray(body.notifyChannels)
    ? body.notifyChannels.filter((c: unknown) => typeof c === "string")
    : ["email"];

  const whatsappPhone =
    typeof body.whatsappPhone === "string" && body.whatsappPhone.trim()
      ? body.whatsappPhone.trim()
      : null;

  const { data, error } = await supabase
    .from("reglife_diagnostic_results")
    .insert([
      {
        player_name: body.playerName ?? "Jogador",
        email: body.email ?? null,
        phone: body.phone ?? null,
        study_time: studyTime,
        profit_goal: profitGoal,
        volume_target_weekly: volumeTarget,
        notify_channels: notifyChannels,
        whatsapp_phone: whatsappPhone,
        quiz_answers: quizAnswers,
        lead_score: null,
        lead_category: null,
        stake_grade: stakeGrade,
        product_profile: productProfile,
        lead_entry: leadSource.entry,
        lead_utm: leadSource.utm,
        // Test ainda não rodou — fica vazio
        stopped_early: false,
        spots_played: 0,
        spots_failed: 0,
        spot_summaries: [],
        results: [],
      },
    ])
    .select("id, created_at")
    .single();

  if (error) {
    console.error("[api/leads] insert error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Cookie HttpOnly ligando o navegador desse lead ao diagnosticId recém-criado.
  // Tem que rodar ANTES de qualquer NextResponse.json — o Set-Cookie é gravado
  // no objeto de response que o `cookies()` retorna implicitamente.
  // Se SESSION_SECRET estiver mal configurado, isso throwa: NÃO derruba o
  // response. O lead já foi inserido e o frontend precisa do id pra
  // ligar ao plano (UPDATE no fim do teste). Sem cookie, o lead vai
  // tomar 401 em /api/plan/* depois — mas o admin enxerga a linha certo.
  try {
    await setDiagSessionCookie(data.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[api/leads] setDiagSessionCookie falhou: ${msg}`);
  }

  // Dispara webhook pra n8n em background — não bloqueia a resposta
  const payload: WebhookPayload = {
    event: "lead.quiz_submitted",
    diagnosticId: data.id,
    createdAt: data.created_at ?? new Date().toISOString(),
    player: {
      name: body.playerName ?? "Jogador",
      email: body.email ?? null,
      phone: body.phone ?? null,
    },
    stakeGrade,
    productProfile,
    source: leadSource,
    quiz: enrichQuiz(quizAnswers),
    preferences: {
      notifyChannels,
      whatsappPhone,
    },
    legacy: {
      profitGoal,
      studyTime,
      volumeTargetWeekly: volumeTarget,
    },
  };
  void fireLeadWebhook(payload);

  return NextResponse.json({ id: data.id }, { status: 201 });
}
