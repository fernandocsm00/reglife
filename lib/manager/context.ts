/**
 * Manager.IA — Context Builder
 *
 * Agrega todos os dados do aluno em um único objeto PlayerContext
 * que alimenta o system prompt do EV.
 *
 * Fontes:
 * - Supabase: plans, plan_progress, streaks, xp_events, manager_conversations
 * - SharkScope: sharkscope_snapshots (última snapshot disponível)
 */

import { createClient } from "@supabase/supabase-js";
import type { LeakBucket } from "@/lib/poker/leakAnalysis";
import { snapshotToText, type PlayerSnapshot } from "@/lib/sharkscope";
import {
  STUDY_TIME_LABELS,
  PROFIT_GOAL_LABELS,
} from "@/lib/poker/planBuilder";
import type { SavedPlan } from "@/lib/poker/planStorage";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface RecentMessage {
  role: "manager" | "player";
  content: string;
  createdAt: string;
}

export interface PlayerContext {
  userId: string;
  playerName: string;

  // Plano
  planId: string;
  cycleDay: number;
  currentPhase: "Fase 1 – Fundamentos" | "Fase 2 – Aplicação" | "Fase 3 – Integração" | "Ciclo concluído";
  playerTierLabel: string;
  accuracyPct: number;
  studyTimeLabel: string;
  profitGoalLabel: string;
  stoppedEarly: boolean;
  spotsPlayed: number;
  spotsFailed: number;

  // Leaks
  topLeaks: LeakBucket[];

  // Progresso
  checkedTasksCount: number;
  totalTasksCount: number;
  checkedLessonsCount: number;
  totalLessonsCount: number;

  // Gamificação
  currentStreak: number;
  longestStreak: number;
  totalXp: number;
  weeklyXp: number;

  // SharkScope
  sharkscopeText: string | null;
  lastSnapshot: PlayerSnapshot | null;

  // Histórico de conversa
  recentMessages: RecentMessage[];
}

// ---------------------------------------------------------------------------
// Builder principal
// ---------------------------------------------------------------------------

/**
 * Monta o contexto completo de um aluno para injetar no prompt do EV.
 * Usa o service_role key para acesso server-side sem restrições de RLS.
 */
export async function buildPlayerContext(userId: string): Promise<PlayerContext> {
  const supabase = createServiceClient();

  // Busca em paralelo para minimizar latência
  const [profileRes, planRes, streakRes, xpRes, snapshotRes, messagesRes] =
    await Promise.allSettled([
      supabase
        .from("player_profiles")
        .select("display_name, study_time, profit_goal")
        .eq("id", userId)
        .single(),

      supabase
        .from("plans")
        .select("id, data, player_tier, accuracy_pct, study_time, profit_goal, stopped_early, spots_played, spots_failed, created_at, cycle_day")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single(),

      supabase
        .from("streaks")
        .select("current_streak, longest_streak")
        .eq("user_id", userId)
        .single(),

      supabase
        .from("xp_totals")
        .select("total_xp, weekly_xp")
        .eq("user_id", userId)
        .single(),

      supabase
        .from("sharkscope_snapshots")
        .select("snapshot")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single(),

      supabase
        .from("manager_conversations")
        .select("role, content, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  // Extrai dados com fallbacks seguros
  const profile = settled(profileRes)?.data;
  const plan = settled(planRes)?.data;
  const streak = settled(streakRes)?.data;
  const xp = settled(xpRes)?.data;
  const snapshotRow = settled(snapshotRes)?.data;
  const messagesRows = settled(messagesRes)?.data ?? [];

  // Dados do plano
  const planData = plan?.data ?? {};
  const leaks: LeakBucket[] = planData.leaks ?? [];
  const phases = planData.phases ?? [];

  // Progresso do plano (checkedTaskIds e checkedLessonUrls ficam em planData.progress)
  const progress = planData.progress ?? { checkedTaskIds: [], checkedLessonUrls: [] };
  const checkedTaskIds: string[] = progress.checkedTaskIds ?? [];
  const checkedLessonUrls: string[] = progress.checkedLessonUrls ?? [];

  const totalTasks = phases.reduce((acc: number, p: any) => acc + (p.tasks?.length ?? 0), 0);
  const totalLessons = phases.reduce((acc: number, p: any) => acc + (p.lessons?.length ?? 0), 0);

  // Fase atual baseada no dia do ciclo
  const cycleDay = plan?.cycle_day ?? 1;
  const currentPhase = resolvePhase(cycleDay);

  // SharkScope
  const lastSnapshot: PlayerSnapshot | null = snapshotRow?.snapshot ?? null;
  const sharkscopeText = lastSnapshot ? snapshotToText(lastSnapshot) : null;

  // Mensagens recentes (invertidas para ordem cronológica)
  const recentMessages: RecentMessage[] = (messagesRows ?? [])
    .reverse()
    .map((m: any) => ({
      role: m.role as "manager" | "player",
      content: m.content,
      createdAt: m.created_at,
    }));

  // Labels
  const studyTime = plan?.study_time ?? planData.studyTime ?? "ate15";
  const profitGoal = plan?.profit_goal ?? planData.profitGoal ?? "usd1k";

  return {
    userId,
    playerName: profile?.display_name ?? planData.playerName ?? "Jogador",

    planId: plan?.id ?? "",
    cycleDay,
    currentPhase,
    playerTierLabel: planData.playerTierLabel ?? `Tier ${plan?.player_tier ?? 1}`,
    accuracyPct: plan?.accuracy_pct ?? planData.accuracyPct ?? 0,
    studyTimeLabel: STUDY_TIME_LABELS[studyTime as keyof typeof STUDY_TIME_LABELS] ?? studyTime,
    profitGoalLabel: PROFIT_GOAL_LABELS[profitGoal as keyof typeof PROFIT_GOAL_LABELS] ?? profitGoal,
    stoppedEarly: plan?.stopped_early ?? planData.stoppedEarly ?? false,
    spotsPlayed: plan?.spots_played ?? planData.spotsPlayed ?? 0,
    spotsFailed: plan?.spots_failed ?? planData.spotsFailed ?? 0,

    topLeaks: leaks.slice(0, 5),

    checkedTasksCount: checkedTaskIds.length,
    totalTasksCount: totalTasks,
    checkedLessonsCount: checkedLessonUrls.length,
    totalLessonsCount: totalLessons,

    currentStreak: streak?.current_streak ?? 0,
    longestStreak: streak?.longest_streak ?? 0,
    totalXp: xp?.total_xp ?? 0,
    weeklyXp: xp?.weekly_xp ?? 0,

    sharkscopeText,
    lastSnapshot,

    recentMessages,
  };
}

// ---------------------------------------------------------------------------
// Builder no-auth (Fase 1) — usa reglife_diagnostic_results + plano do FE
// ---------------------------------------------------------------------------

/**
 * Variante para enquanto não temos auth.
 * - `diagnosticId`: id da linha em reglife_diagnostic_results
 * - `plan`: SavedPlan do localStorage (frontend envia junto)
 * - `recentMessages`: últimas trocas dessa sessão (memória curta sem persistir)
 *
 * Não grava XP/streak/conversation porque essas tabelas têm FK em auth.users.
 */
export async function buildPlayerContextFromDiagnostic(args: {
  diagnosticId: string;
  plan: SavedPlan | null;
  recentMessages?: RecentMessage[];
}): Promise<PlayerContext> {
  const { diagnosticId, plan, recentMessages = [] } = args;
  const supabase = createServiceClient();

  const { data: row } = await supabase
    .from("reglife_diagnostic_results")
    .select(
      "player_name, email, study_time, profit_goal, stopped_early, spots_played, spots_failed, sharkscope_snapshot, sharkscope_summary, sharkscope_username, sharkscope_network, sharkscope_last_sync"
    )
    .eq("id", diagnosticId)
    .single();

  // Plano (vem do FE, fonte de verdade nessa fase sem-auth)
  const phases = plan?.phases ?? [];
  const totalTasks = phases.reduce((acc, p) => acc + (p.tasks?.length ?? 0), 0);
  const totalLessons = phases.reduce((acc, p) => acc + (p.lessons?.length ?? 0), 0);
  const checkedTaskIds = plan?.progress?.checkedTaskIds ?? [];
  const checkedLessonUrls = plan?.progress?.checkedLessonUrls ?? [];

  const cycleDay = plan
    ? Math.max(1, Math.floor((Date.now() - plan.createdAt) / 86_400_000) + 1)
    : 1;

  // SharkScope — vem do snapshot completo se existir, senão monta texto curto a partir do summary
  const lastSnapshot: PlayerSnapshot | null =
    (row?.sharkscope_snapshot as PlayerSnapshot | undefined) ?? null;
  const summary = row?.sharkscope_summary as
    | { entries: number | null; profit: number | null; avgRoi: number | null; itm: number | null; pkoRatio: number | null; winrate: string | null }
    | null;

  let sharkscopeText: string | null = null;
  if (lastSnapshot) {
    sharkscopeText = snapshotToText(lastSnapshot);
  } else if (summary && row?.sharkscope_username) {
    sharkscopeText = [
      `=== SharkScope: ${row.sharkscope_username} @ ${row.sharkscope_network ?? "?"} ===`,
      `Torneios: ${summary.entries ?? "?"} | ROI médio: ${summary.avgRoi ?? "?"}% | ITM: ${summary.itm ?? "?"}%`,
      summary.winrate ? `Classificação: ${summary.winrate}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const studyTime = (plan?.studyTime ?? row?.study_time ?? "ate15") as string;
  const profitGoal = (plan?.profitGoal ?? row?.profit_goal ?? "usd1k") as string;

  return {
    userId: `diag:${diagnosticId}`,
    playerName: plan?.playerName ?? row?.player_name ?? "Jogador",
    planId: plan?.id ?? "",
    cycleDay,
    currentPhase: resolvePhase(cycleDay),
    playerTierLabel: plan?.playerTierLabel ?? "Tier 1",
    accuracyPct: plan?.accuracyPct ?? 0,
    studyTimeLabel:
      STUDY_TIME_LABELS[studyTime as keyof typeof STUDY_TIME_LABELS] ?? studyTime,
    profitGoalLabel:
      PROFIT_GOAL_LABELS[profitGoal as keyof typeof PROFIT_GOAL_LABELS] ?? profitGoal,
    stoppedEarly: plan?.stoppedEarly ?? row?.stopped_early ?? false,
    spotsPlayed: plan?.spotsPlayed ?? row?.spots_played ?? 0,
    spotsFailed: plan?.spotsFailed ?? row?.spots_failed ?? 0,
    topLeaks: (plan?.leaks ?? []).slice(0, 5),
    checkedTasksCount: checkedTaskIds.length,
    totalTasksCount: totalTasks,
    checkedLessonsCount: checkedLessonUrls.length,
    totalLessonsCount: totalLessons,
    currentStreak: 0,
    longestStreak: 0,
    totalXp: 0,
    weeklyXp: 0,
    sharkscopeText,
    lastSnapshot,
    recentMessages,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolvePhase(cycleDay: number): PlayerContext["currentPhase"] {
  if (cycleDay <= 30) return "Fase 1 – Fundamentos";
  if (cycleDay <= 60) return "Fase 2 – Aplicação";
  if (cycleDay <= 90) return "Fase 3 – Integração";
  return "Ciclo concluído";
}

function settled<T>(result: PromiseSettledResult<T>): T | null {
  if (result.status === "fulfilled") return result.value;
  return null;
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios");
  }
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// Helper para gravar XP + streak após ação do aluno
// ---------------------------------------------------------------------------

export async function recordActivity(
  userId: string,
  xp: number,
  reason: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const supabase = createServiceClient();

  await Promise.all([
    // XP event
    supabase.from("xp_events").insert({
      user_id: userId,
      xp,
      reason,
      metadata: metadata ?? null,
    }),
    // Streak
    supabase.rpc("record_activity", { p_user_id: userId }),
  ]);
}

// ---------------------------------------------------------------------------
// Helper para salvar mensagem na conversa
// ---------------------------------------------------------------------------

export async function saveMessage(
  userId: string,
  role: "manager" | "player",
  content: string,
  triggerType?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("manager_conversations").insert({
    user_id: userId,
    role,
    content,
    trigger_type: triggerType ?? null,
    metadata: metadata ?? null,
  });
}
