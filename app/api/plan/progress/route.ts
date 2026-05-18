/**
 * /api/plan/progress
 *
 * POST: registra um evento de progresso do aluno (task marcada, aula
 *       assistida, quest avançada, etc.) e retorna XP ganho.
 * GET:  retorna agregados (XP total, XP semanal, streak, volume da semana,
 *       quest ativa) — usado pelo HUD de /meu-plano.
 *
 * Ambos aceitam `userId` no formato:
 *  - "diag:<uuid>"  → grava em diagnostic_activity (Fase 1 sem-auth)
 *  - "<uuid>"       → modo com-auth, grava em xp_events + plan_progress
 *                     (não implementado aqui — cai pra noop até auth chegar)
 *
 * Body (POST):
 *   { userId, eventType, eventData?, xpReward? }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hasNotificationRecently, sendEvNotification } from "@/lib/notify";
import { requireDiagSession } from "@/lib/session";

const DEFAULT_XP_BY_EVENT: Record<string, number> = {
  task_checked: 10,
  lesson_checked: 5,
  task_unchecked: 0,
  lesson_unchecked: 0,
  session_logged: 25,
  manager_replied: 20,
  quest_progress: 0,    // o ganho vem só no quest_completed
  quest_completed: 100, // pode ser sobrescrito pelo reward_xp da quest
};

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function parseDiagId(userId: string): string | null {
  return userId.startsWith("diag:") ? userId.slice("diag:".length) : null;
}

// ---------------------------------------------------------------------------
// POST — registra evento
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, eventType, eventData, xpReward } = body as {
    userId?: string;
    eventType?: string;
    eventData?: Record<string, unknown>;
    xpReward?: number;
  };

  if (!userId || !eventType) {
    return NextResponse.json(
      { error: "userId e eventType são obrigatórios" },
      { status: 400 }
    );
  }

  const diagId = parseDiagId(userId);
  if (!diagId) {
    // Path com auth ainda não está implementado nessa fase
    return NextResponse.json({ ok: true, skipped: "auth path not wired yet" });
  }

  const session = await requireDiagSession(diagId);
  if (!session.ok) return session.response;

  const baseXp = xpReward ?? DEFAULT_XP_BY_EVENT[eventType] ?? 0;
  const supabase = service();

  // Detecta comeback ANTES de gravar o novo evento (precisamos do "último anterior")
  const wasComeback = await detectComeback(supabase, diagId);

  // Aplica multiplicador se há um xp_drop ativo agora
  const multiplier = await activeXpMultiplier(supabase);
  const xp = Math.round(baseXp * multiplier);

  const { error } = await supabase.from("diagnostic_activity").insert({
    diagnostic_id: diagId,
    event_type: eventType,
    event_data: { ...(eventData ?? {}), multiplier: multiplier > 1 ? multiplier : undefined },
    xp_earned: xp,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Avança quest aberta quando o evento é compatível com o target_kind
  await advanceOpenQuest(diagId, eventType, eventData);

  // Verifica milestones de badge (não bloqueia a resposta)
  void checkBadges(diagId).catch(() => {});

  // Comeback: aluno voltou depois de gap longo (não bloqueia)
  if (wasComeback) {
    void sendComebackMessage(diagId, wasComeback).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    xpEarned: xp,
    multiplier: multiplier > 1 ? multiplier : undefined,
  });
}

// ---------------------------------------------------------------------------
// Comeback detection — gap >5 dias entre eventos
// ---------------------------------------------------------------------------
async function detectComeback(
  supabase: ReturnType<typeof service>,
  diagId: string
): Promise<number | null> {
  const { data: last } = await supabase
    .from("diagnostic_activity")
    .select("created_at")
    .eq("diagnostic_id", diagId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!last) return null;
  const daysSince =
    (Date.now() - new Date(last.created_at as string).getTime()) / 86_400_000;
  if (daysSince < 5) return null;
  return Math.round(daysSince);
}

async function sendComebackMessage(diagId: string, daysAway: number): Promise<void> {
  // Throttle: max 1 comeback msg a cada 7d (cobre re-runs ou múltiplos eventos seguidos no retorno)
  if (await hasNotificationRecently(diagId, "streak_risk", 24)) return; // já tem mensagem fresca? não dobra
  await sendEvNotification({
    diagnosticId: diagId,
    kind: "post_session", // sem kind dedicado pra comeback — usa o canal geral
    trigger: "comeback",
    title: "👋 Voltou.",
    facts: {
      dias_ausente: daysAway,
    },
    fallback: `${daysAway} dias sem aparecer. Bom te ver de volta.`,
  });
}

// ---------------------------------------------------------------------------
// GET — agregados pro HUD
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });
  }

  const diagId = parseDiagId(userId);
  if (!diagId) {
    // Sem auth: retorna zeros pra não quebrar o frontend
    return NextResponse.json({
      totalXp: 0,
      weeklyXp: 0,
      currentStreak: 0,
      weeklyVolume: 0,
      volumeTarget: null,
      activeQuest: null,
    });
  }

  const session = await requireDiagSession(diagId);
  if (!session.ok) return session.response;

  const supabase = service();

  // Roda em paralelo: totais, streak, volume delta, quest ativa, target
  const [totalsRes, eventsRes, snapsRes, diagRes, questRes] =
    await Promise.allSettled([
      supabase
        .from("diagnostic_activity_totals")
        .select("total_xp, weekly_xp, last_active_date")
        .eq("diagnostic_id", diagId)
        .single(),

      // Pega últimos 30 dias de datas com atividade pra computar streak
      supabase
        .from("diagnostic_activity")
        .select("created_at")
        .eq("diagnostic_id", diagId)
        .gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
        .order("created_at", { ascending: false }),

      // Snapshot mais recente + um de ~7d atrás pra calcular delta de volume
      supabase
        .from("sharkscope_diag_snapshots")
        .select("created_at, entries_total")
        .eq("diagnostic_id", diagId)
        .order("created_at", { ascending: false })
        .limit(20),

      supabase
        .from("reglife_diagnostic_results")
        .select("volume_target_weekly")
        .eq("id", diagId)
        .single(),

      supabase
        .from("weekly_quests")
        .select(
          "id, title, description, target_kind, target_count, progress, reward_xp, completed_at, expires_at, week_start"
        )
        .eq("diagnostic_id", diagId)
        .order("week_start", { ascending: false })
        .limit(1)
        .single(),
    ]);

  const totals =
    totalsRes.status === "fulfilled" ? totalsRes.value.data : null;
  const events = eventsRes.status === "fulfilled" ? eventsRes.value.data : [];
  const snaps = snapsRes.status === "fulfilled" ? snapsRes.value.data : [];
  const diag = diagRes.status === "fulfilled" ? diagRes.value.data : null;
  const quest = questRes.status === "fulfilled" ? questRes.value.data : null;

  return NextResponse.json({
    totalXp: totals?.total_xp ?? 0,
    weeklyXp: totals?.weekly_xp ?? 0,
    currentStreak: computeStreak(events ?? []),
    weeklyVolume: computeWeeklyVolume(snaps ?? []),
    volumeTarget: diag?.volume_target_weekly ?? null,
    activeQuest: quest ?? null,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeStreak(events: { created_at: string }[]): number {
  if (events.length === 0) return 0;
  const days = new Set(
    events.map((e) => new Date(e.created_at).toISOString().slice(0, 10))
  );
  let streak = 0;
  const cursor = new Date();
  // Tolera ainda não ter feito nada hoje: começa contando de hoje OU ontem.
  if (!days.has(cursor.toISOString().slice(0, 10))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (!days.has(cursor.toISOString().slice(0, 10))) return 0;
  }
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

function computeWeeklyVolume(
  snaps: { created_at: string; entries_total: number | null }[]
): number {
  if (snaps.length === 0) return 0;
  // Pega o mais recente
  const latest = snaps[0];
  if (latest.entries_total == null) return 0;
  // Snapshot mais antigo dentro da janela de 7 dias (mais distante = mais cedo)
  const sevenDaysAgo = Date.now() - 7 * 86_400_000;
  const baseline = snaps.find(
    (s) => new Date(s.created_at).getTime() <= sevenDaysAgo
  );
  if (!baseline?.entries_total) {
    // Sem baseline: assume que tudo é "essa semana" (ou só tem 1 ponto)
    return 0;
  }
  return Math.max(0, latest.entries_total - baseline.entries_total);
}

// ---------------------------------------------------------------------------
// XP drops globais — retorna multiplicador atual (1.0 se não há drop ativo)
// ---------------------------------------------------------------------------
async function activeXpMultiplier(
  supabase: ReturnType<typeof service>
): Promise<number> {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("xp_drops")
    .select("multiplier")
    .lte("starts_at", now)
    .gte("ends_at", now)
    .order("multiplier", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.multiplier ? Number(data.multiplier) : 1.0;
}

// ---------------------------------------------------------------------------
// Badges — checa milestones e dispara notificação ao desbloquear
// ---------------------------------------------------------------------------

interface BadgeCheck {
  id: string;
  label: string;
  icon: string;
  /** Retorna true se a condição foi satisfeita. */
  predicate: (stats: BadgeStats) => boolean;
}

interface BadgeStats {
  totalXp: number;
  taskChecks: number;
  lessonChecks: number;
  questCompletions: number;
  activeDays: number;
}

const BADGE_CHECKS: BadgeCheck[] = [
  {
    id: "lessons_10",
    label: "Estudioso",
    icon: "📚",
    predicate: (s) => s.lessonChecks >= 10,
  },
  {
    id: "lessons_30",
    label: "Dedicado",
    icon: "🎓",
    predicate: (s) => s.lessonChecks >= 30,
  },
  {
    id: "streak_7d",
    label: "Em Chamas",
    icon: "🔥",
    predicate: (s) => s.activeDays >= 7,
  },
  {
    id: "streak_30d",
    label: "Inabalável",
    icon: "💎",
    predicate: (s) => s.activeDays >= 30,
  },
];

async function checkBadges(diagId: string): Promise<void> {
  const supabase = service();

  // Pega badges já desbloqueados pra evitar duplicar
  const { data: unlocked } = await supabase
    .from("diagnostic_badges")
    .select("badge_id")
    .eq("diagnostic_id", diagId);
  const has = new Set((unlocked ?? []).map((r) => r.badge_id));

  // Stats agregadas
  const { data: events } = await supabase
    .from("diagnostic_activity")
    .select("event_type, xp_earned, created_at")
    .eq("diagnostic_id", diagId);

  if (!events) return;

  const stats: BadgeStats = {
    totalXp: events.reduce((a, e) => a + (e.xp_earned ?? 0), 0),
    taskChecks: events.filter((e) => e.event_type === "task_checked").length,
    lessonChecks: events.filter((e) => e.event_type === "lesson_checked").length,
    questCompletions: events.filter((e) => e.event_type === "quest_completed").length,
    activeDays: new Set(
      events.map((e) => new Date(e.created_at as string).toISOString().slice(0, 10))
    ).size,
  };

  for (const b of BADGE_CHECKS) {
    if (has.has(b.id)) continue;
    if (!b.predicate(stats)) continue;

    await supabase
      .from("diagnostic_badges")
      .insert({ diagnostic_id: diagId, badge_id: b.id });

    await sendEvNotification({
      diagnosticId: diagId,
      kind: "badge_unlocked",
      trigger: "badge_unlocked",
      title: `${b.icon} Conquista: ${b.label}`,
      facts: {
        badge: b.label,
        xp_total_aluno: stats.totalXp,
        aulas_marcadas: stats.lessonChecks,
        tasks_marcadas: stats.taskChecks,
        dias_ativos: stats.activeDays,
        quests_concluidas: stats.questCompletions,
        condicao: badgeBody(b.id, stats),
      },
      fallback: badgeBody(b.id, stats),
      payload: { badge_id: b.id },
    });
  }
}

function badgeBody(id: string, s: BadgeStats): string {
  switch (id) {
    case "lessons_10":
      return "10 aulas marcadas como assistidas. Tá no caminho.";
    case "lessons_30":
      return "30 aulas. Isso é base sólida.";
    case "streak_7d":
      return `7 dias seguidos com atividade (atual: ${s.activeDays}). Mantém o ritmo.`;
    case "streak_30d":
      return "30 dias. Disciplina virou hábito.";
    default:
      return "";
  }
}

async function advanceOpenQuest(
  diagId: string,
  eventType: string,
  eventData?: Record<string, unknown>
): Promise<void> {
  const supabase = service();

  const { data: quest } = await supabase
    .from("weekly_quests")
    .select("id, target_kind, target_count, progress, reward_xp")
    .eq("diagnostic_id", diagId)
    .is("completed_at", null)
    .gte("expires_at", new Date().toISOString())
    .order("week_start", { ascending: false })
    .limit(1)
    .single();

  if (!quest) return;

  // Mapeia tipos de evento que avançam cada target_kind
  const matches: Record<string, string[]> = {
    tasks: ["task_checked"],
    lessons: ["lesson_checked"],
    volume: ["session_logged"],
    spot_accuracy: ["session_logged"], // refinar depois quando simulador postar
  };

  if (!matches[quest.target_kind]?.includes(eventType)) return;

  const newProgress = Math.min(quest.target_count, quest.progress + 1);
  const completed = newProgress >= quest.target_count;

  await supabase
    .from("weekly_quests")
    .update({
      progress: newProgress,
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("id", quest.id);

  if (completed) {
    // Bônus de XP no fechamento da quest
    await supabase.from("diagnostic_activity").insert({
      diagnostic_id: diagId,
      event_type: "quest_completed",
      event_data: { quest_id: quest.id, ...eventData },
      xp_earned: quest.reward_xp,
    });
    // Avisa o aluno — EV comenta a vitória
    await sendEvNotification({
      diagnosticId: diagId,
      kind: "quest_done",
      trigger: "quest_done",
      title: "🏁 Quest da semana concluída!",
      facts: {
        recompensa_xp: quest.reward_xp,
        target_count: quest.target_count,
      },
      fallback: `Quest fechada · +${quest.reward_xp} XP. Próxima na segunda.`,
      payload: { quest_id: quest.id },
    });
  }
}
