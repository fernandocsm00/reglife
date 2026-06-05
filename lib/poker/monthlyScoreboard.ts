/**
 * Lógica pura do placar mensal usado em /meu-plano.
 *
 * Recebe SavedPlan + linhas de spot_training_sessions + entries do mês corrente
 * no sharkscope_monthly_stats. Devolve um ScoreboardData pronto pro front.
 *
 * Reusa mergeTrackWithTraining da entrega admin spot track — gating é o mesmo.
 */

import type { SavedPlan } from "@/lib/poker/planStorage";
import {
  mergeTrackWithTraining,
  type TrainingRow,
} from "@/lib/poker/adminSpotTrack";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface MonthMeta {
  /** Ano UTC. */
  year: number;
  /** Mês 1..12. */
  month: number;
  /** Nome em português ("junho", "julho", ...). */
  label: string;
}

export interface SpotProgressEntry {
  /** 1-based para display. */
  index: number;
  /** Null em filler slots. */
  leakId: string | null;
  /** Pretty label do leak (ex.: "Cbet do BTN em 40bb"). */
  spotLabel: string;
  state: "locked" | "active" | "completed";
  handsPlayed: number;
  /** Sempre 50 na v1 (constante do sistema). */
  handsTarget: number;
  /** Math.min(100, round(handsPlayed/handsTarget * 100)). */
  progressPct: number;
  /** Inteiro 0-100 ou null quando handsPlayed === 0. */
  accuracyPct: number | null;
}

export interface ScoreboardData {
  month: MonthMeta;
  spots: { goal: number; completed: number };
  volume: { goal: number | null; current: number | null; hasSharkscope: boolean };
  hands: { goal: number; current: number | null; pending: boolean };
  spotProgress: SpotProgressEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTH_LABEL_PT: Record<number, string> = {
  1: "janeiro",   2: "fevereiro", 3: "março",   4: "abril",
  5: "maio",      6: "junho",     7: "julho",   8: "agosto",
  9: "setembro", 10: "outubro",  11: "novembro", 12: "dezembro",
};

/**
 * Devolve o nome do mês em PT. Aceita 1..12; fora disso retorna string vazia.
 * Exposto para reuso eventual em outros pontos.
 */
export function monthLabelPT(month: number): string {
  return MONTH_LABEL_PT[month] ?? "";
}

/** Start-of-month UTC em ISO. */
function startOfMonthUTCIso(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  ).toISOString();
}

/** Start-of-next-month UTC em ISO. */
function startOfNextMonthUTCIso(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  ).toISOString();
}

// ---------------------------------------------------------------------------
// Builder principal
// ---------------------------------------------------------------------------

/**
 * Monta o objeto que vai pro front.
 *
 * - `trainingRows`: TODAS as linhas do aluno (sem filtro de mês). A lib filtra
 *   por mês corrente UTC para calcular `spots.completed`. `mergeTrackWithTraining`
 *   continua usando o dataset completo para gating.
 * - `monthlyEntries`: passado direto, pode ser null.
 * - `volumeTargetWeekly`: do SavedPlan.volumeTargetWeekly. null ou ≤0 → goal=null.
 * - `nowIso`: opcional, determinístico para smoke tests.
 */
export function buildMonthlyScoreboard(args: {
  plan: SavedPlan;
  trainingRows: TrainingRow[];
  volumeTargetWeekly: number | null;
  monthlyEntries: number | null;
  hasSharkscope: boolean;
  nowIso?: string;
}): ScoreboardData {
  const { plan, trainingRows, volumeTargetWeekly, monthlyEntries, hasSharkscope } = args;
  const now = args.nowIso ? new Date(args.nowIso) : new Date();

  // ----- month --------------------------------------------------------------
  const month: MonthMeta = {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    label: monthLabelPT(now.getUTCMonth() + 1),
  };

  // ----- spots.completed (filtra por mês corrente UTC) ----------------------
  const startThis = startOfMonthUTCIso(now);
  const startNext = startOfNextMonthUTCIso(now);
  const spotsCompletedThisMonth = trainingRows.filter((row) => {
    if (!row.completed_at) return false;
    return row.completed_at >= startThis && row.completed_at < startNext;
  }).length;

  // ----- volume.goal --------------------------------------------------------
  const volumeGoal =
    volumeTargetWeekly !== null && volumeTargetWeekly > 0
      ? volumeTargetWeekly * 4
      : null;

  // ----- spotProgress (reusa mergeTrackWithTraining) ------------------------
  const merged = mergeTrackWithTraining(plan, trainingRows);
  const spotProgress: SpotProgressEntry[] = merged.map((entry) => {
    const handsTarget = 50;
    const progressPct =
      handsTarget > 0
        ? Math.min(100, Math.round((entry.handsPlayed / handsTarget) * 100))
        : 0;
    return {
      index: entry.index,
      leakId: entry.leakId,
      spotLabel: entry.spotLabel,
      state: entry.state,
      handsPlayed: entry.handsPlayed,
      handsTarget,
      progressPct,
      accuracyPct: entry.accuracyPct,
    };
  });

  // ----- hands.goal (depende do tamanho da trilha) --------------------------
  const handsGoal = spotProgress.length * 50;

  return {
    month,
    spots: { goal: 3, completed: spotsCompletedThisMonth },
    volume: { goal: volumeGoal, current: monthlyEntries, hasSharkscope },
    hands: { goal: handsGoal, current: null, pending: true },
    spotProgress,
  };
}
