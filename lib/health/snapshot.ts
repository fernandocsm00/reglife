/**
 * lib/health/snapshot.ts — Persiste HealthScore do dia e devolve os deltas.
 *
 * Insere/atualiza 1 row em player_health_snapshots (PK: diagnostic_id + day).
 * Compara com o snapshot do dia anterior pra detectar:
 *   - band change  (ex: yellow → orange)
 *   - leaks fechados novos (delta de leaksClosed)
 *
 * Devolve um `SnapshotDiff` que o cron usa pra decidir quais triggers disparar.
 */

import { createClient } from "@supabase/supabase-js";
import type { HealthScore } from "./types";

export interface SnapshotDiff {
  /** Mudou de faixa? null no primeiro snapshot da história do aluno. */
  bandChange: { from: HealthScore["band"]; to: HealthScore["band"] } | null;
  /** Quantos leaks fecharam HOJE (≥1 → dispara trigger leak_closed). */
  newlyClosedCount: number;
}

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "[health/snapshot] NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios"
    );
  }
  return createClient(url, key);
}

function today(): string {
  // Data no fuso UTC pra coincidir com o cron diário 06h local (ok mesmo
  // se o aluno for de fuso diferente — snapshot é por dia UTC).
  return new Date().toISOString().slice(0, 10);
}

function yesterday(): string {
  const d = new Date(Date.now() - 86_400_000);
  return d.toISOString().slice(0, 10);
}

export async function persistSnapshot(
  diagnosticId: string,
  score: HealthScore
): Promise<SnapshotDiff> {
  const supabase = service();
  const day = today();

  // Pega o snapshot mais recente ANTES de inserir o de hoje
  const { data: prev } = await supabase
    .from("player_health_snapshots")
    .select("band, breakdown")
    .eq("diagnostic_id", diagnosticId)
    .lt("day", day)
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle<{ band: HealthScore["band"]; breakdown: HealthScore["breakdown"] }>();

  // Upsert do snapshot de hoje
  const row = {
    diagnostic_id: diagnosticId,
    day,
    resultado: score.breakdown.resultado,
    leak_score: score.breakdown.leakScore,
    roi_score: score.breakdown.roiScore,
    conclusao: score.breakdown.conclusao,
    sentimento: score.breakdown.sentimento,
    health: score.health,
    band: score.band,
    breakdown: score.breakdown,
  };
  const { error } = await supabase
    .from("player_health_snapshots")
    .upsert(row, { onConflict: "diagnostic_id,day" });
  if (error) throw new Error(`[health/snapshot] upsert: ${error.message}`);

  // Diff
  const bandChange =
    prev && prev.band !== score.band ? { from: prev.band, to: score.band } : null;
  const newlyClosedCount =
    score.breakdown.leaksClosed - (prev?.breakdown?.leaksClosed ?? 0);

  return {
    bandChange,
    newlyClosedCount: Math.max(0, newlyClosedCount),
  };
}

export { yesterday }; // exportado pra testes futuros
