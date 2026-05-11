/**
 * Cliente fire-and-forget pra registrar eventos de progresso no backend.
 * Usado pelos toggles de task/aula no PlanScreen e pelos pontos de telemetria
 * de outras telas. Falhas são silenciosas — UX otimista, dado canônico vive
 * no localStorage até o auth chegar.
 */

export interface ProgressEvent {
  eventType:
    | "task_checked"
    | "task_unchecked"
    | "lesson_checked"
    | "lesson_unchecked"
    | "session_logged"
    | "manager_replied";
  eventData?: Record<string, unknown>;
  xpReward?: number;
}

export function postProgressEvent(
  diagnosticId: string | undefined,
  event: ProgressEvent
): void {
  if (!diagnosticId) return; // Plano legado sem id — nada a fazer
  const userId = `diag:${diagnosticId}`;
  void fetch("/api/plan/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, ...event }),
    keepalive: true,
  }).catch(() => {
    /* fire-and-forget */
  });
}

// ---------------------------------------------------------------------------
// Hook simples pra puxar agregados (HUD)
// ---------------------------------------------------------------------------

export interface PlanProgressSummary {
  totalXp: number;
  weeklyXp: number;
  currentStreak: number;
  weeklyVolume: number;
  volumeTarget: number | null;
  activeQuest: ActiveQuest | null;
}

export interface ActiveQuest {
  id: string;
  title: string;
  description: string | null;
  target_kind: string;
  target_count: number;
  progress: number;
  reward_xp: number;
  completed_at: string | null;
  expires_at: string;
  week_start: string;
}

export async function fetchPlanProgress(
  diagnosticId: string | undefined
): Promise<PlanProgressSummary | null> {
  if (!diagnosticId) return null;
  try {
    const res = await fetch(`/api/plan/progress?userId=diag:${diagnosticId}`);
    if (!res.ok) return null;
    return (await res.json()) as PlanProgressSummary;
  } catch {
    return null;
  }
}
