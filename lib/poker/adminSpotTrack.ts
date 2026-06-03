/**
 * Lógica pura usada pelo endpoint admin /api/admin/spot-track/[diagnosticId].
 *
 * Recebe o SavedPlan persistido em reglife_diagnostic_results.saved_plan e as
 * linhas da tabela spot_training_sessions, faz o merge respeitando a ordem
 * canônica de buildSpotTrack, e devolve um array enxuto pronto pro front.
 *
 * Sem I/O. Todas as decisões de estado (locked/active/completed) ficam aqui
 * — endpoint e componente só repassam o resultado.
 */

import type { SavedPlan } from "@/lib/poker/planStorage";
import { buildSpotTrack, type SpotTrackEntry } from "@/lib/poker/spotTrack";

export interface TrainingRow {
  leak_id: string;
  hands_played: number;
  hands_correct: number;
  completed_at: string | null;
  updated_at: string | null;
}

export interface AdminSpotEntry {
  /** 1-based para display. SpotTrackEntry.index é 0-based; somamos +1 aqui. */
  index: number;
  /** Total de spots na trilha — útil pra renderizar "Spot 1 / 3". */
  totalCount: number;
  /** Leak id (ex.: "cBet-BTN-40"). Null em filler slots (raros, mas possíveis). */
  leakId: string | null;
  /** Pretty label do leak (ex.: "Cbet do BTN em 40bb"). Vem direto do SpotTrackEntry.label. */
  spotLabel: string;
  /** Estado da gating sequencial. */
  state: "locked" | "active" | "completed";
  handsPlayed: number;
  handsCorrect: number;
  /** Inteiro 0-100, null quando handsPlayed === 0. */
  accuracyPct: number | null;
  completedAt: string | null;
  lastActivityAt: string | null;
}

/**
 * Mescla a ordem canônica da trilha com as linhas de treino do banco.
 *
 * Regra de estado (idêntica à derivação client em components/trainer/SpotTrack.tsx):
 *   - Primeira entry com completed_at == null → "active".
 *   - Anteriores → "completed".
 *   - Posteriores → "locked".
 *   - Tudo completo → todos "completed".
 */
export function mergeTrackWithTraining(
  plan: SavedPlan,
  rows: TrainingRow[],
): AdminSpotEntry[] {
  const track: SpotTrackEntry[] = buildSpotTrack(plan);
  if (track.length === 0) return [];

  const byLeak = new Map<string, TrainingRow>();
  for (const row of rows) byLeak.set(row.leak_id, row);

  // Acha o primeiro spot ainda não-completo. Falta de linha conta como não-completo.
  let activeIdx = -1;
  for (let i = 0; i < track.length; i++) {
    const id = track[i].leakId;
    const row = id ? byLeak.get(id) : undefined;
    if (!row || row.completed_at == null) {
      activeIdx = i;
      break;
    }
  }
  // -1 significa que tudo está completo → "active" não existe.
  const effectiveActive = activeIdx === -1 ? track.length : activeIdx;

  return track.map((entry, i) => {
    const row = entry.leakId ? byLeak.get(entry.leakId) : undefined;
    const handsPlayed = row?.hands_played ?? 0;
    const handsCorrect = row?.hands_correct ?? 0;
    const accuracyPct =
      handsPlayed > 0 ? Math.round((handsCorrect / handsPlayed) * 100) : null;

    const state: AdminSpotEntry["state"] =
      i < effectiveActive ? "completed" : i === effectiveActive ? "active" : "locked";

    return {
      index: i + 1,
      totalCount: track.length,
      leakId: entry.leakId,
      spotLabel: entry.label,
      state,
      handsPlayed,
      handsCorrect,
      accuracyPct,
      completedAt: row?.completed_at ?? null,
      lastActivityAt: row?.updated_at ?? null,
    };
  });
}

/**
 * Formata um timestamp ISO em string relativa curta:
 *   - null/undefined → "—"
 *   - mesma data (UTC) do "agora" → "hoje"
 *   - 1..7 dias atrás → "{N}d"
 *   - 8..30 dias atrás → "{N}sem" (semanas arredondadas pra baixo, min 1)
 *   - >30 dias → "+1mês"
 *
 * UTC é suficiente — "hoje vs ontem" precision não muda o sinal pro EV.
 * Recebe `nowIso` opcional pra ser determinístico em testes manuais.
 */
export function formatRelative(
  iso: string | null | undefined,
  nowIso?: string,
): string {
  if (!iso) return "—";
  const now = nowIso ? new Date(nowIso) : new Date();
  const then = new Date(iso);
  if (isNaN(then.getTime())) return "—";

  const utcDayDiff =
    Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86_400_000) -
    Math.floor(Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate()) / 86_400_000);

  if (utcDayDiff <= 0) return "hoje";
  if (utcDayDiff <= 7) return `${utcDayDiff}d`;
  if (utcDayDiff <= 30) {
    const weeks = Math.max(1, Math.floor(utcDayDiff / 7));
    return `${weeks}sem`;
  }
  return "+1mês";
}
