/**
 * lib/health/collect.ts — Coleta o PlayerState atual de um aluno.
 *
 * Faz Promise.allSettled das queries em paralelo. Falha em uma fonte
 * (ex: SharkScope) não impede o cálculo — o componente vira null e
 * o score.ts redistribui pesos.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PlayerState, SpotSummary } from "./types";

function service(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface DiagRow {
  id: string;
  created_at: string;
  spot_summaries: SpotSummary[] | null;
  sharkscope_summary: { avgRoi: number | null } | null;
  roi_baseline: number | null;
  previous_diagnostic_id: string | null;
}

/** Busca o retake MAIS RECENTE deste lead — se o lead refez o diagnóstico,
 *  o id mais novo na cadeia previous_diagnostic_id é o retake atual. */
async function fetchMostRecentRetake(
  supabase: SupabaseClient,
  diagnosticId: string
): Promise<SpotSummary[] | null> {
  // O "retake" é a linha que aponta de volta pra este id via previous_diagnostic_id.
  const { data } = await supabase
    .from("reglife_diagnostic_results")
    .select("spot_summaries")
    .eq("previous_diagnostic_id", diagnosticId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const spots = (data?.spot_summaries as SpotSummary[] | undefined) ?? null;
  return spots && spots.length > 0 ? spots : null;
}

function cycleDayFrom(createdAt: string): number {
  return Math.max(1, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000) + 1);
}

export async function collectPlayerState(diagnosticId: string): Promise<PlayerState> {
  const supabase = service();

  // Conclusão na Fase A: não há plano persistido por diagnostic_id no banco
  // (a tabela `plans` usa user_id e o app sem-auth guarda o plano no localStorage).
  // Contamos eventos task_checked em diagnostic_activity como tasksChecked.
  // tasksExpected fica 0 (deixa o score.ts redistribuir o peso da Conclusão).
  // Quando o auth + persistência do plano chegarem (Fase C), aqui passa a olhar
  // o totalTasks real e calcular tasksExpected pela fase atravessada.

  const [diagRes, retakeRes, taskEventsRes, pulsesRes] = await Promise.allSettled([
    supabase
      .from("reglife_diagnostic_results")
      .select("id, created_at, spot_summaries, sharkscope_summary, roi_baseline, previous_diagnostic_id")
      .eq("id", diagnosticId)
      .single<DiagRow>(),
    fetchMostRecentRetake(supabase, diagnosticId),
    supabase
      .from("diagnostic_activity")
      .select("*", { count: "exact", head: true })
      .eq("diagnostic_id", diagnosticId)
      .eq("event_type", "task_checked"),
    supabase
      .from("pulse_responses")
      .select("emoji, created_at")
      .eq("diagnostic_id", diagnosticId)
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  const diag = diagRes.status === "fulfilled" ? diagRes.value.data : null;
  const retakeSpots = retakeRes.status === "fulfilled" ? retakeRes.value : null;
  const tasksChecked =
    taskEventsRes.status === "fulfilled" ? (taskEventsRes.value.count ?? 0) : 0;
  const pulses = pulsesRes.status === "fulfilled" ? (pulsesRes.value.data ?? []) : [];

  if (!diag) {
    throw new Error(`[health/collect] diagnostic ${diagnosticId} não encontrado`);
  }

  const cycleDay = cycleDayFrom(diag.created_at);
  const diagnosticSpots = diag.spot_summaries ?? [];

  return {
    diagnosticId: diag.id,
    cycleDay,
    diagnosticSpots,
    retakeSpots,
    roiBaseline: diag.roi_baseline,
    roi30d: diag.sharkscope_summary?.avgRoi ?? null,
    tasksChecked,
    tasksExpected: 0,   // Fase A: defere Conclusão (sem plano persistido no banco)
    recentPulses: pulses.map((p) => p.emoji as PlayerState["recentPulses"][number]),
  };
}

/** Lista todos os alunos ativos (ciclo ≤ 120 dias) — usado pelo cron. */
export async function listActiveStudents(): Promise<string[]> {
  const supabase = service();
  const cutoff = new Date(Date.now() - 120 * 86_400_000).toISOString();
  const { data } = await supabase
    .from("reglife_diagnostic_results")
    .select("id, created_at")
    .gte("created_at", cutoff);
  return (data ?? []).map((r) => r.id);
}
