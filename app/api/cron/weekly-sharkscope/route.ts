/**
 * GET /api/cron/weekly-sharkscope
 *
 * Roda às segundas 09h UTC. Pra cada aluno com SharkScope conectado
 * (player ou playergroup), busca as stats do MÊS CORRENTE usando o
 * filtro Date: e faz upsert em sharkscope_monthly_stats.
 *
 * Idempotente por (diagnostic_id, year, month) — re-rodar atualiza
 * a linha do mês corrente. Quando o mês fechar (dia 1, ~05h UTC), o
 * cron mensal sobrescreve com os dados finais e notifica o aluno.
 *
 * Este cron NÃO dispara notificação — é refresh silencioso pra alimentar
 * o contexto do EV (3 últimos meses no system prompt).
 *
 * Auth: Bearer ${CRON_SECRET} ou ?secret=... (dev).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSharkscopeClient, type SharkscopeSubject } from "@/lib/sharkscope";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface DiagRow {
  id: string;
  sharkscope_username: string | null;
  sharkscope_network: string | null;
  sharkscope_playergroup_id: string | null;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const { data: rows, error } = await supabase
    .from("reglife_diagnostic_results")
    .select(
      "id, sharkscope_username, sharkscope_network, sharkscope_playergroup_id"
    )
    .or("sharkscope_username.not.is.null,sharkscope_playergroup_id.not.is.null");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const client = getSharkscopeClient();
  const results: { id: string; ok: boolean; reason?: string }[] = [];

  for (const row of (rows ?? []) as DiagRow[]) {
    const network = row.sharkscope_network ?? "PokerStars";
    const useGroup = !!row.sharkscope_playergroup_id;
    const subject: SharkscopeSubject = useGroup
      ? { kind: "playergroup", identifier: row.sharkscope_playergroup_id! }
      : { kind: "player", identifier: row.sharkscope_username! };

    try {
      const stats = await client.fetchMonthlyStats(subject, network, year, month);
      if (!stats) {
        results.push({ id: row.id, ok: false, reason: "no stats returned" });
        continue;
      }

      const payload = {
        diagnostic_id: row.id,
        year,
        month,
        source: useGroup ? "playergroup" : "player",
        subject_value: subject.identifier,
        network,
        entries: stats.Entries ?? null,
        count_sessions: stats.Count ?? null,
        avg_stake: stats.AvStake ?? null,
        profit: stats.Profit ?? null,
        avg_roi: stats.AvROI ?? null,
        total_roi: stats.TotalROI ?? null,
        itm: stats.ITM ?? null,
        avg_entrants: stats.AvEntrants ?? null,
        final_tables: stats.FinalTables ?? null,
        re_entries: stats.ReEntries ?? null,
        raw: stats,
      };

      const { error: upErr } = await supabase
        .from("sharkscope_monthly_stats")
        .upsert(payload, { onConflict: "diagnostic_id,year,month" });

      if (upErr) throw upErr;

      results.push({ id: row.id, ok: true });
    } catch (err) {
      console.error(`[cron/weekly-sharkscope] ${row.id}:`, err);
      results.push({
        id: row.id,
        ok: false,
        reason: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    year,
    month,
    total: rows?.length ?? 0,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    failures: results.filter((r) => !r.ok),
  });
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  if (req.headers.get("authorization") === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get("secret") === expected) return true;
  return false;
}
