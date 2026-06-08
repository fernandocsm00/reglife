/**
 * POST /api/leads — captura do lead no momento que o quiz é enviado.
 *
 * Cria a linha em `reglife_diagnostic_results` com dados de identidade,
 * canais e quiz (lead score). NÃO gera PDF nem dispara email/WhatsApp —
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
  ABI_OPTIONS,
  BANCA_OPTIONS,
  IDADE_OPTIONS,
  LEAD_CATEGORY_LABELS,
  OBJETIVO_OPTIONS,
  TEMPO_OPTIONS,
  VOLUME_OPTIONS,
  type QuizAnswers,
  type QuizOption,
  type LeadCategory,
} from "@/lib/poker/leadScoring";

const DEFAULT_WEBHOOK_URL =
  "https://webhook-n8n.reglife.com.br/webhook/c877387c-88da-44a5-960f-a9f52ee9af69";

function labelOf<T extends string>(
  options: QuizOption<T>[],
  value: string | null | undefined
): string | null {
  if (!value) return null;
  return options.find((o) => o.value === value)?.label ?? null;
}

/**
 * Enriquece as respostas do quiz com labels human-readable, pro n8n
 * não precisar mapear de "25_34" pra "25 a 34 anos" lá do outro lado.
 */
function enrichQuiz(answers: QuizAnswers | null) {
  if (!answers) return null;
  return {
    idade: { value: answers.idade, label: labelOf(IDADE_OPTIONS, answers.idade) },
    tempo: { value: answers.tempo, label: labelOf(TEMPO_OPTIONS, answers.tempo) },
    objetivo: {
      value: answers.objetivo,
      label: labelOf(OBJETIVO_OPTIONS, answers.objetivo),
    },
    abi: { value: answers.abi, label: labelOf(ABI_OPTIONS, answers.abi) },
    volume: { value: answers.volume, label: labelOf(VOLUME_OPTIONS, answers.volume) },
    banca: { value: answers.banca, label: labelOf(BANCA_OPTIONS, answers.banca) },
  };
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
  leadScore: number | null;
  leadCategory: LeadCategory | null;
  leadCategoryLabel: string | null;
  stakeGrade: number | null;
  quiz: ReturnType<typeof enrichQuiz>;
  preferences: {
    notifyChannels: string[];
    whatsappPhone: string | null;
    /** null = lead legacy sem pergunta explícita; true/false = escolheu no onboarding */
    whatsappOptIn: boolean | null;
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
      ? (body.quizAnswers as QuizAnswers)
      : null;
  const leadScore =
    typeof body.leadScore === "number" && Number.isFinite(body.leadScore)
      ? Math.round(body.leadScore)
      : null;
  const leadCategory =
    typeof body.leadCategory === "string"
      ? (body.leadCategory as LeadCategory)
      : null;
  const stakeGrade =
    typeof body.stakeGrade === "number" && Number.isFinite(body.stakeGrade)
      ? body.stakeGrade
      : null;
  const notifyCadence: "leve" | "ritmada" | "intensa" =
    body.notifyCadence === "leve" || body.notifyCadence === "intensa"
      ? body.notifyCadence
      : "ritmada";

  // Consentimento explícito pra contato via WhatsApp. Form novo manda
  // sempre boolean; payloads legados (sem o campo) gravam null e ficam
  // tratados como "tácito" pela camada de notify.
  const whatsappOptIn: boolean | null =
    typeof body.whatsappOptIn === "boolean" ? body.whatsappOptIn : null;

  // SharkScope: nick + network informados no onboarding (step 7). Quando o
  // aluno marca "não tenho conta", chegam como null e ficam vazios na linha
  // — o cron weekly-sharkscope e o admin modal pulam linhas sem nick.
  const sharkscopeUsername: string | null =
    typeof body.sharkscopeUsername === "string" &&
    body.sharkscopeUsername.trim().length > 0
      ? body.sharkscopeUsername.trim()
      : null;
  const sharkscopeNetwork: string | null =
    typeof body.sharkscopeNetwork === "string" &&
    body.sharkscopeNetwork.trim().length > 0
      ? body.sharkscopeNetwork.trim()
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
        notify_cadence: notifyCadence,
        whatsapp_opt_in: whatsappOptIn,
        sharkscope_username: sharkscopeUsername,
        sharkscope_network: sharkscopeNetwork,
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
    leadScore,
    leadCategory,
    leadCategoryLabel: leadCategory ? LEAD_CATEGORY_LABELS[leadCategory] : null,
    stakeGrade,
    quiz: enrichQuiz(quizAnswers),
    preferences: {
      notifyChannels,
      whatsappPhone,
      whatsappOptIn,
    },
    legacy: {
      profitGoal: body.profitGoal ?? null,
      studyTime: body.studyTime ?? "ate15",
      volumeTargetWeekly: volumeTarget,
    },
  };
  void fireLeadWebhook(payload);

  return NextResponse.json({ id: data.id }, { status: 201 });
}
