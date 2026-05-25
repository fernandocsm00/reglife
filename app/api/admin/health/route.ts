/**
 * GET /api/admin/health
 *
 * Lista o snapshot MAIS RECENTE de cada aluno + alguns metadados pra alimentar
 * a aba "Saúde" no admin. Devolve só o que a UI precisa — sem breakdown.
 *
 * Sem auth dedicado: o `/admin` hoje confia no `/api/results` que é protegido
 * por session no middleware (mesma convenção). Mantemos.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { HealthBand } from "@/lib/health/types";

export const dynamic = "force-dynamic";

interface Row {
  diagnostic_id: string;
  day: string;
  health: number;
  band: HealthBand;
  breakdown: { leaksClosed?: number; leaksTotal?: number } | null;
  reglife_diagnostic_results: {
    player_name: string;
    created_at: string;
  } | null;
}

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // PostgREST: distinct ON via order + limit emulado por subquery não é trivial.
  // Estratégia simples e correta: trazer os últimos 30 dias e dedup por
  // diagnostic_id no lado do JS (volume baixo, pesa pouco).
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("player_health_snapshots")
    .select("diagnostic_id, day, health, band, breakdown, reglife_diagnostic_results(player_name, created_at)")
    .gte("day", cutoff)
    .order("day", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const latest = new Map<string, Row>();
  for (const r of (data ?? []) as unknown as Row[]) {
    if (!latest.has(r.diagnostic_id)) latest.set(r.diagnostic_id, r);
  }

  const out = Array.from(latest.values()).map((r) => ({
    diagnosticId: r.diagnostic_id,
    playerName: r.reglife_diagnostic_results?.player_name ?? "?",
    cycleDay: r.reglife_diagnostic_results?.created_at
      ? Math.max(1, Math.floor((Date.now() - new Date(r.reglife_diagnostic_results.created_at).getTime()) / 86_400_000) + 1)
      : null,
    day: r.day,
    health: Number(r.health),
    band: r.band,
    leaksClosed: r.breakdown?.leaksClosed ?? 0,
    leaksTotal: r.breakdown?.leaksTotal ?? 0,
  }));

  // Pior primeiro (red → orange → yellow → green)
  const orderRank: Record<string, number> = { red: 0, orange: 1, yellow: 2, green: 3 };
  out.sort((a, b) => {
    const da = orderRank[a.band] - orderRank[b.band];
    return da !== 0 ? da : a.health - b.health;
  });

  // KPIs agregados
  const kpis = {
    total: out.length,
    by_band: {
      red: out.filter((r) => r.band === "red").length,
      orange: out.filter((r) => r.band === "orange").length,
      yellow: out.filter((r) => r.band === "yellow").length,
      green: out.filter((r) => r.band === "green").length,
    },
    avg_health: out.length > 0
      ? Number((out.reduce((s, r) => s + r.health, 0) / out.length).toFixed(1))
      : null,
  };

  return NextResponse.json({ kpis, rows: out });
}
