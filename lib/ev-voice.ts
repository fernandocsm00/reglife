/**
 * lib/ev-voice.ts — Gera o texto narrativo das notificações do EV.
 *
 * Chama OpenAI com a persona já estabelecida + contexto mínimo do aluno
 * + os fatos do trigger. Retorna 2-4 frases no tom do coach (não dashboard).
 *
 * Falhas (timeout / API down) caem num fallback hardcoded — a notificação
 * nunca deixa de sair, só perde a narrativa.
 *
 * O texto gerado é guardado em notifications.payload.message, então é
 * 1 chamada OpenAI por evento — sem regeneração ao listar.
 */

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ---------------------------------------------------------------------------
// Tipos de trigger e seus fatos
// ---------------------------------------------------------------------------

export type EvTrigger =
  | "post_session"
  | "monthly_close"
  | "quest_done"
  | "quest_assigned"
  | "badge_unlocked"
  | "drop_active"
  | "streak_risk"
  | "leak_alert"
  | "leak_closed"
  | "phase_transition"
  | "comeback"
  | "daily_checkin"
  | "weekly_review"
  | "health_band_change";

export interface EvVoiceArgs {
  diagnosticId: string;
  trigger: EvTrigger;
  /** Bloco de fatos numéricos/objetivos pra alimentar a narrativa. */
  facts: Record<string, unknown>;
  /** Texto fallback se OpenAI falhar (mandatório — não deixa notificação muda). */
  fallback: string;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export async function generateEvVoice(args: EvVoiceArgs): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    return args.fallback;
  }

  try {
    const context = await fetchMinimalContext(args.diagnosticId);
    const systemPrompt = buildSystemPrompt(args.trigger, context);
    const userPrompt = buildUserPrompt(args.trigger, args.facts);

    const completion = await client().chat.completions.create({
      model: "gpt-4o-mini", // mais barato pra geração curta; pode subir pra gpt-4o se quiser tom mais refinado
      max_tokens: 220,
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim();
    return text && text.length > 10 ? text : args.fallback;
  } catch (err) {
    console.error("[ev-voice] OpenAI falhou, usando fallback:", err);
    return args.fallback;
  }
}

// ---------------------------------------------------------------------------
// Contexto mínimo (não puxa o PlayerContext inteiro — só o necessário)
// ---------------------------------------------------------------------------

interface MinimalContext {
  playerName: string;
  cycleDay: number;
  currentPhase: string;
  tierLabel: string;
  topLeaks: { label: string; pct: number }[];
  lastSharkscope: {
    entries: number | null;
    avgRoi: number | null;
    profit: number | null;
    itm: number | null;
    winrate: string | null;
  } | null;
  volumeTarget: number | null;
}

async function fetchMinimalContext(diagId: string): Promise<MinimalContext> {
  const supabase = service();
  const { data } = await supabase
    .from("reglife_diagnostic_results")
    .select(
      "player_name, created_at, spot_summaries, sharkscope_summary, volume_target_weekly"
    )
    .eq("id", diagId)
    .single();

  const createdMs = data?.created_at
    ? new Date(data.created_at).getTime()
    : Date.now();
  const cycleDay = Math.max(
    1,
    Math.floor((Date.now() - createdMs) / 86_400_000) + 1
  );

  const spotSummaries =
    (data?.spot_summaries as Array<{ label: string; pct: number; tier: number; passed: boolean }>) ?? [];

  // Top leaks = spots falhados, ordenado pelo pior
  const topLeaks = spotSummaries
    .filter((s) => !s.passed)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 3)
    .map((s) => ({ label: s.label, pct: s.pct }));

  // Tier baseado no diagnóstico (max tier passado)
  const passedTier = Math.max(
    1,
    ...spotSummaries.filter((s) => s.passed).map((s) => s.tier ?? 1)
  );

  return {
    playerName: data?.player_name ?? "Jogador",
    cycleDay,
    currentPhase: resolvePhase(cycleDay),
    tierLabel: `Tier ${passedTier}`,
    topLeaks,
    lastSharkscope: data?.sharkscope_summary
      ? (data.sharkscope_summary as MinimalContext["lastSharkscope"])
      : null,
    volumeTarget: data?.volume_target_weekly ?? null,
  };
}

function resolvePhase(cycleDay: number): string {
  if (cycleDay <= 30) return "Fase 1 – Fundamentos";
  if (cycleDay <= 60) return "Fase 2 – Aplicação";
  if (cycleDay <= 90) return "Fase 3 – Integração";
  return "Ciclo concluído";
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

function buildSystemPrompt(trigger: EvTrigger, ctx: MinimalContext): string {
  return `Você é EV, o Manager de Evolução da RegLife. Ex-jogador MTT que chegou ao Tier 3, hoje acompanha alunos da comunidade.

TOM:
- Direto, sem enrolação. Sem "olá", sem "espero que esteja bem".
- Use linguagem de poker naturalmente (spots, ROI, ITM, leak, field, mão, bubble).
- 2-4 frases. Nunca bullet points. Fala como gente.
- "Você" (nunca "tu"). Sem emojis. Sem "[Nome]," no começo.
- NÃO se apresente como IA. NÃO termine com "se precisar é só falar".
- Use o contexto pra parecer que VIU o aluno, não que recebeu dado.

REGRAS DESTE ENVIO:
- É uma NOTIFICAÇÃO proativa que vai aparecer no chat e em outros canais.
- Aluno NÃO escreveu nada — você está iniciando o assunto.
- Diga o que viu, conecte com o que você sabe dele, e termine com 1 ação concreta (ou pergunta direcionada, NUNCA "como posso ajudar?").
- Se o número for ruim, não dramatize. Se for bom, não bajule.

CONTEXTO DO ALUNO:
Nome: ${ctx.playerName}
Dia ${ctx.cycleDay}/90 — ${ctx.currentPhase} — ${ctx.tierLabel}
${ctx.topLeaks.length > 0
  ? `Leaks do diagnóstico: ${ctx.topLeaks.map((l) => `${l.label} (${l.pct}% acerto)`).join(", ")}`
  : "Diagnóstico sem leaks críticos."}
${ctx.lastSharkscope
  ? `Último SharkScope: ${ctx.lastSharkscope.entries ?? "?"} torneios, ROI ${ctx.lastSharkscope.avgRoi ?? "?"}%, ITM ${ctx.lastSharkscope.itm ?? "?"}% (${ctx.lastSharkscope.winrate ?? "?"})`
  : "SharkScope ainda sem dados consolidados."}
${ctx.volumeTarget ? `Meta de volume: ${ctx.volumeTarget} torneios/semana.` : ""}

TIPO DE NOTIFICAÇÃO: ${triggerHumanLabel(trigger)}`;
}

function triggerHumanLabel(t: EvTrigger): string {
  const m: Record<EvTrigger, string> = {
    post_session: "Pós-sessão — torneios novos detectados pelo SharkScope.",
    monthly_close: "Fechamento de mês — resumo do mês que acabou.",
    quest_done: "Aluno fechou a quest semanal.",
    quest_assigned: "Quest da semana foi criada agora.",
    badge_unlocked: "Aluno desbloqueou uma conquista.",
    drop_active: "Drop de XP 2x foi agendado.",
    streak_risk: "Streak em risco — aluno sumiu por mais de 36h.",
    leak_alert: "SharkScope mostra padrão consistente com leak do diagnóstico.",
    leak_closed: "Aluno fechou um leak — retake passou no critério (≥85% acerto, ≥10 mãos).",
    phase_transition: "Aluno mudou de fase do plano.",
    comeback: "Aluno voltou depois de >5 dias offline.",
    daily_checkin: "Check-in diário do EV (cobrança leve do plano da semana).",
    weekly_review: "Review de domingo — balanço da semana + foco da próxima.",
    health_band_change: "Health Score mudou de faixa (ex: amarelo → laranja).",
  };
  return m[t];
}

function buildUserPrompt(
  trigger: EvTrigger,
  facts: Record<string, unknown>
): string {
  const factsLines = Object.entries(facts)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `- ${k}: ${formatFactValue(v)}`)
    .join("\n");
  return `Fatos deste evento:\n${factsLines}\n\nEscreva a notificação do EV. Lembre: 2-4 frases, tom de coach, termine com ação ou pergunta direcionada. Não use emoji. Não comece com saudação.`;
}

function formatFactValue(v: unknown): string {
  if (typeof v === "number") {
    return Number.isInteger(v) ? v.toString() : v.toFixed(2);
  }
  if (v instanceof Date) return v.toISOString();
  return String(v);
}
