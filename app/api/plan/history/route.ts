/**
 * GET  /api/plan/history?userId=diag:<id>
 *      → retorna o histórico mensal do aluno (todas as linhas)
 *
 * POST /api/plan/history
 *      → backfill on-demand: dispara o cron mensal pra um mês específico
 *        Body: { userId: "diag:<id>", year, month }
 *        Não exige CRON_SECRET porque é o próprio aluno pedindo o seu mês.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSharkscopeClient, type SharkscopeSubject } from "@/lib/sharkscope";

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function parseDiagId(userId: string | null): string | null {
  if (!userId) return null;
  return userId.startsWith("diag:") ? userId.slice("diag:".length) : null;
}

// ---------------------------------------------------------------------------
// GET — lista o histórico mensal + estado da conexão SharkScope
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const diagId = parseDiagId(req.nextUrl.searchParams.get("userId"));
  if (!diagId) {
    return NextResponse.json({ rows: [], connected: false });
  }

  const supabase = service();

  const [rowsRes, diagRes] = await Promise.allSettled([
    supabase
      .from("sharkscope_monthly_stats")
      .select(
        "year, month, source, subject_value, network, entries, count_sessions, avg_stake, profit, avg_roi, total_roi, itm, avg_entrants, final_tables, re_entries, created_at"
      )
      .eq("diagnostic_id", diagId)
      .order("year", { ascending: false })
      .order("month", { ascending: false }),

    supabase
      .from("reglife_diagnostic_results")
      .select(
        "sharkscope_username, sharkscope_network, sharkscope_playergroup_id"
      )
      .eq("id", diagId)
      .single(),
  ]);

  const rows = rowsRes.status === "fulfilled" ? rowsRes.value.data ?? [] : [];
  const diag = diagRes.status === "fulfilled" ? diagRes.value.data : null;
  const connected = !!(diag?.sharkscope_playergroup_id || diag?.sharkscope_username);

  return NextResponse.json({
    rows,
    connected,
    source: diag?.sharkscope_playergroup_id ? "playergroup" : diag?.sharkscope_username ? "player" : null,
    subject: diag?.sharkscope_playergroup_id ?? diag?.sharkscope_username ?? null,
    network: diag?.sharkscope_network ?? null,
  });
}

// ---------------------------------------------------------------------------
// POST — backfill manual de um mês específico
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const body = await req.json();
  const diagId = parseDiagId(body.userId);
  const year = Number(body.year);
  const month = Number(body.month);

  if (!diagId) {
    return NextResponse.json({ error: "userId (diag:<id>) obrigatório" }, { status: 400 });
  }
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "year/month inválidos" }, { status: 400 });
  }

  // Não permite buscar mês futuro
  const now = new Date();
  const isFuture =
    year > now.getUTCFullYear() ||
    (year === now.getUTCFullYear() && month > now.getUTCMonth() + 1);
  if (isFuture) {
    return NextResponse.json({ error: "Mês ainda não fechou" }, { status: 400 });
  }

  const supabase = service();
  const { data: row, error: loadErr } = await supabase
    .from("reglife_diagnostic_results")
    .select(
      "id, sharkscope_username, sharkscope_network, sharkscope_playergroup_id"
    )
    .eq("id", diagId)
    .single();

  if (loadErr || !row) {
    return NextResponse.json({ error: "Diagnóstico não encontrado" }, { status: 404 });
  }
  if (!row.sharkscope_username && !row.sharkscope_playergroup_id) {
    return NextResponse.json(
      { error: "Conecte primeiro um nick ou Player Group do SharkScope" },
      { status: 400 }
    );
  }

  const useGroup = !!row.sharkscope_playergroup_id;
  const subject: SharkscopeSubject = useGroup
    ? { kind: "playergroup", identifier: row.sharkscope_playergroup_id! }
    : { kind: "player", identifier: row.sharkscope_username! };
  const network = row.sharkscope_network ?? "PokerStars";

  try {
    const client = getSharkscopeClient();
    const stats = await client.fetchMonthlyStats(subject, network, year, month);
    if (!stats) {
      return NextResponse.json(
        { error: "SharkScope não retornou dados pra esse mês" },
        { status: 502 }
      );
    }

    const payload = {
      diagnostic_id: diagId,
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
    return NextResponse.json({ ok: true, year, month, stats });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao sincronizar" },
      { status: 500 }
    );
  }
}
