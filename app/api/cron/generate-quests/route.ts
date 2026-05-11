/**
 * GET /api/cron/generate-quests
 *
 * Toda segunda 9h BR: cria 1 quest semanal por aluno ativo.
 * Estratégia mínima nesta fase:
 *   - Se o aluno tem leak quente conhecido (top do diagnóstico) → quest
 *     de tipo `tasks` apontando pra fechar 3 tasks dessa semana.
 *   - Se tem volume target + sharkscope conectado → adicional `volume`.
 *
 * Quando o simulador postar resultados de spot, evoluímos pra `spot_accuracy`.
 *
 * Idempotente: não cria quest duplicada na mesma semana ISO.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendRexNotification } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface DiagRow {
  id: string;
  player_name: string;
  spot_summaries: Array<{ label: string; pct: number; passed: boolean }>;
  volume_target_weekly: number | null;
  sharkscope_username: string | null;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { weekStart, weekEnd } = currentIsoWeek();

  const { data: rows, error } = await supabase
    .from("reglife_diagnostic_results")
    .select(
      "id, player_name, spot_summaries, volume_target_weekly, sharkscope_username"
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const created: { id: string; questId: string }[] = [];
  const skipped: string[] = [];

  for (const r of (rows ?? []) as DiagRow[]) {
    // Já tem quest dessa semana?
    const { data: existing } = await supabase
      .from("weekly_quests")
      .select("id")
      .eq("diagnostic_id", r.id)
      .eq("week_start", weekStart.toISOString().slice(0, 10))
      .limit(1)
      .maybeSingle();

    if (existing) {
      skipped.push(r.id);
      continue;
    }

    const quest = pickQuestForRow(r, weekEnd);
    if (!quest) {
      skipped.push(r.id);
      continue;
    }

    const { data: inserted, error: insErr } = await supabase
      .from("weekly_quests")
      .insert({
        diagnostic_id: r.id,
        week_start: weekStart.toISOString().slice(0, 10),
        title: quest.title,
        description: quest.description,
        target_kind: quest.target_kind,
        target_payload: quest.target_payload ?? null,
        target_count: quest.target_count,
        progress: 0,
        reward_xp: quest.reward_xp,
        expires_at: weekEnd.toISOString(),
      })
      .select("id")
      .single();

    if (insErr || !inserted) {
      console.error(`[cron/generate-quests] insert failed for ${r.id}`, insErr);
      continue;
    }

    // Rex apresenta a quest da semana com narrativa
    await sendRexNotification({
      diagnosticId: r.id,
      kind: "quest_assigned",
      trigger: "quest_assigned",
      title: `🎯 Quest da semana: ${quest.title}`,
      facts: {
        titulo: quest.title,
        descricao: quest.description,
        meta: `${quest.target_count} ${quest.target_kind}`,
        recompensa_xp: quest.reward_xp,
        prazo: weekEnd.toISOString(),
      },
      fallback: `${quest.title} — vale ${quest.reward_xp} XP. Prazo: domingo.`,
      payload: { quest_id: inserted.id },
    });

    created.push({ id: r.id, questId: inserted.id });
  }

  return NextResponse.json({
    ok: true,
    weekStart: weekStart.toISOString().slice(0, 10),
    created: created.length,
    skipped: skipped.length,
  });
}

// ---------------------------------------------------------------------------
// Heurística de geração — vai evoluir conforme tivermos mais sinais
// ---------------------------------------------------------------------------

function pickQuestForRow(r: DiagRow, weekEnd: Date) {
  const failingSpot = r.spot_summaries?.find((s) => !s.passed);
  if (failingSpot) {
    return {
      title: `Fechar 3 tasks essa semana — foco em ${failingSpot.label}`,
      description: `Você caiu em ${failingSpot.label} no diagnóstico (${failingSpot.pct}%). Fechar 3 tasks do plano essa semana já bota você na trilha de correção.`,
      target_kind: "tasks" as const,
      target_count: 3,
      reward_xp: 150,
      target_payload: { spot_label: failingSpot.label },
    };
  }
  if (r.volume_target_weekly) {
    return {
      title: `Bater meta de volume: ${r.volume_target_weekly} torneios`,
      description:
        "Sem volume não tem amostra. Joga até bater a meta — é assim que o ROI sai do barulho estatístico.",
      target_kind: "volume" as const,
      target_count: r.volume_target_weekly,
      reward_xp: 200,
    };
  }
  return {
    title: "Marcar 5 aulas como assistidas",
    description: "Mantém o ritmo do plano. Cinco aulas, qualquer fase.",
    target_kind: "lessons" as const,
    target_count: 5,
    reward_xp: 100,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Segunda 00:00 e domingo 23:59 da semana ISO atual (UTC). */
function currentIsoWeek(): { weekStart: Date; weekEnd: Date } {
  const now = new Date();
  const day = now.getUTCDay(); // 0 dom, 1 seg, ...
  const offsetToMonday = (day + 6) % 7;
  const weekStart = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - offsetToMonday
    )
  );
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000 - 1);
  return { weekStart, weekEnd };
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  if (req.headers.get("authorization") === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get("secret") === expected) return true;
  return false;
}
