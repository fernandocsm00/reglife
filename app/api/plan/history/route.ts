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
import { requireDiagSession } from "@/lib/session";

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

interface DiagRow {
  id: string;
  email: string | null;
  sharkscope_username: string | null;
  sharkscope_network: string | null;
  sharkscope_playergroup_id: string | null;
}

/**
 * Resolve a linha do diagnóstico que tem Sharkscope conectado pra esse aluno.
 *
 * Cenário: aluno fez vários nivelamentos. Admin conectou Sharkscope numa
 * linha antiga. O localStorage do aluno aponta pra uma linha mais recente
 * que está sem conexão. Fazemos fallback procurando, pelo email, a linha
 * mais recente que tenha Sharkscope conectado.
 *
 * Retorna a linha atual se ela já tem conexão; senão a linha de fallback;
 * senão a linha atual mesmo (e o caller decide o que fazer).
 */
async function resolveEffectiveDiagRow(
  supabase: ReturnType<typeof service>,
  diagId: string
): Promise<DiagRow | null> {
  const { data: current } = await supabase
    .from("reglife_diagnostic_results")
    .select("id, email, sharkscope_username, sharkscope_network, sharkscope_playergroup_id")
    .eq("id", diagId)
    .single<DiagRow>();

  if (!current) return null;
  if (current.sharkscope_username || current.sharkscope_playergroup_id) return current;
  if (!current.email) return current;

  const { data: fallback } = await supabase
    .from("reglife_diagnostic_results")
    .select("id, email, sharkscope_username, sharkscope_network, sharkscope_playergroup_id")
    .eq("email", current.email)
    .or("sharkscope_username.not.is.null,sharkscope_playergroup_id.not.is.null")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<DiagRow>();

  return fallback ?? current;
}

// ---------------------------------------------------------------------------
// GET — lista o histórico mensal + estado da conexão SharkScope
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const diagId = parseDiagId(req.nextUrl.searchParams.get("userId"));
  if (!diagId) {
    return NextResponse.json({ rows: [], connected: false });
  }

  const session = await requireDiagSession(diagId);
  if (!session.ok) return session.response;

  const supabase = service();
  const effective = await resolveEffectiveDiagRow(supabase, diagId);
  const effectiveId = effective?.id ?? diagId;

  const { data: rowsData } = await supabase
    .from("sharkscope_monthly_stats")
    .select(
      "year, month, source, subject_value, network, entries, count_sessions, avg_stake, profit, avg_roi, total_roi, itm, avg_entrants, final_tables, re_entries, created_at"
    )
    .eq("diagnostic_id", effectiveId)
    .order("year", { ascending: false })
    .order("month", { ascending: false });

  const rows = rowsData ?? [];
  const connected = !!(effective?.sharkscope_playergroup_id || effective?.sharkscope_username);

  return NextResponse.json({
    rows,
    connected,
    source: effective?.sharkscope_playergroup_id ? "playergroup" : effective?.sharkscope_username ? "player" : null,
    subject: effective?.sharkscope_playergroup_id ?? effective?.sharkscope_username ?? null,
    network: effective?.sharkscope_network ?? null,
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

  const session = await requireDiagSession(diagId);
  if (!session.ok) return session.response;

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
  const row = await resolveEffectiveDiagRow(supabase, diagId);

  if (!row) {
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
  // Os monthly stats devem ser gravados sob o id da linha que tem a conexão,
  // pra que o GET acima encontre — não o diagId vindo do localStorage.
  const targetDiagId = row.id;

  try {
    const client = getSharkscopeClient();
    const res = await client.fetchMonthlyStats(subject, network, year, month);
    if (!res.success) {
      const detail =
        "blocked" in res
          ? `Conta bloqueada por privacy no SharkScope (${subject.kind}=${subject.identifier})`
          : `SharkScope: ${(res as { error: string }).error} (${subject.kind}=${subject.identifier})`;
      return NextResponse.json({ error: detail }, { status: 502 });
    }
    const stats = res.stats;

    const payload = {
      diagnostic_id: targetDiagId,
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
