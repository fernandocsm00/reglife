/**
 * GET /api/cron/monthly-sharkscope
 *
 * Roda no dia 1 de cada mês 06h UTC (03h BRT). Para cada aluno com
 * SharkScope conectado (player ou playergroup), busca as stats do
 * mês ANTERIOR usando o filtro Date: e salva em sharkscope_monthly_stats.
 *
 * Pode ser chamado manualmente passando ?year=YYYY&month=MM (e opcionalmente
 * ?diagnosticId=...) pra backfill de meses específicos.
 *
 * Idempotente por (diagnostic_id, year, month) — re-rodar atualiza a linha.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSharkscopeClient, type SharkscopeSubject } from "@/lib/sharkscope";
import { sendEvNotification } from "@/lib/notify";

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

  // Mês a coletar — default: mês anterior
  const yearParam = req.nextUrl.searchParams.get("year");
  const monthParam = req.nextUrl.searchParams.get("month");
  const diagParam = req.nextUrl.searchParams.get("diagnosticId");

  let year: number;
  let month: number;
  if (yearParam && monthParam) {
    year = parseInt(yearParam, 10);
    month = parseInt(monthParam, 10);
  } else {
    const now = new Date();
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    year = prev.getUTCFullYear();
    month = prev.getUTCMonth() + 1;
  }

  if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "year/month inválidos" }, { status: 400 });
  }

  let query = supabase
    .from("reglife_diagnostic_results")
    .select(
      "id, sharkscope_username, sharkscope_network, sharkscope_playergroup_id"
    )
    .or("sharkscope_username.not.is.null,sharkscope_playergroup_id.not.is.null");

  if (diagParam) query = query.eq("id", diagParam);

  const { data: rows, error } = await query;
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
      const res = await client.fetchMonthlyStats(subject, network, year, month);
      if (!res.success) {
        const reason =
          "blocked" in res
            ? `blocked by privacy (${subject.kind}=${subject.identifier})`
            : `sharkscope error (${subject.kind}=${subject.identifier}): ${
                (res as { error: string }).error
              }`;
        results.push({ id: row.id, ok: false, reason });
        continue;
      }
      const stats = res.stats;

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

      // Upsert por (diagnostic_id, year, month)
      const { error: upErr } = await supabase
        .from("sharkscope_monthly_stats")
        .upsert(payload, { onConflict: "diagnostic_id,year,month" });

      if (upErr) throw upErr;

      // Avisa o aluno que o resumo mensal está pronto (uma vez por linha)
      if (stats.Entries && stats.Entries > 0) {
        const monthName = MONTH_NAMES_PT[month - 1];
        const profit = stats.Profit ?? 0;
        const profitStr = `${profit >= 0 ? "+" : "-"}$${Math.abs(profit).toFixed(0)}`;
        const roiStr =
          stats.AvROI != null ? `${stats.AvROI.toFixed(1)}%` : "?";

        await sendEvNotification({
          diagnosticId: row.id,
          kind: "post_session",
          trigger: "monthly_close",
          title: `📊 Fechamento de ${monthName}/${year}`,
          facts: {
            mes: `${monthName}/${year}`,
            torneios: stats.Entries,
            profit: profitStr,
            roi_medio: roiStr,
            itm: stats.ITM,
            mesas_finais: stats.FinalTables,
            buy_in_medio: stats.AvStake,
          },
          fallback: `${stats.Entries} torneios em ${monthName} · profit ${profitStr} · ROI ${roiStr}. Veja o detalhamento em "Meu histórico".`,
          payload: { year, month },
        });
      }

      results.push({ id: row.id, ok: true });
    } catch (err) {
      console.error(`[cron/monthly-sharkscope] ${row.id}:`, err);
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

const MONTH_NAMES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  if (req.headers.get("authorization") === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get("secret") === expected) return true;
  return false;
}
