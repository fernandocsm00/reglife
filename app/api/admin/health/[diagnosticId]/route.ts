/**
 * GET /api/admin/health/[diagnosticId]
 *
 * Devolve o snapshot mais recente + histórico (até 7 dias, oldest→newest)
 * de um aluno específico. Alimenta o bloco detalhado em
 * /admin/resultado/[id] (sparkline + breakdown atual).
 *
 * Sem auth dedicado: segue a convenção do sibling /api/admin/health,
 * gating via middleware (mesma estratégia do /api/results).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { HealthBand } from "@/lib/health/types";

export const dynamic = "force-dynamic";

interface SnapshotRow {
  day: string;
  health: number;
  band: HealthBand;
  breakdown: {
    resultado?: number | null;
    conclusao?: number | null;
    sentimento?: number | null;
    leaksClosed?: number;
    leaksTotal?: number;
  } | null;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ diagnosticId: string }> }
) {
  const { diagnosticId } = await ctx.params;

  if (!diagnosticId) {
    return NextResponse.json({ error: "diagnosticId required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("player_health_snapshots")
    .select("day, health, band, breakdown")
    .eq("diagnostic_id", diagnosticId)
    .order("day", { ascending: false })
    .limit(7);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as SnapshotRow[];
  const snapshot = rows.length > 0 ? rows[0] : null;
  // history: oldest → newest pra plotar sparkline da esquerda pra direita
  const history = [...rows].reverse();

  return NextResponse.json({ snapshot, history });
}
