/**
 * GET /api/cron/sharkscope-sync
 *
 * Cron diário (Vercel cron / pg_cron) que sincroniza SharkScope pra todo
 * aluno com `sharkscope_username` definido. Cada execução:
 *   1. Busca o snapshot completo via SharkScope
 *   2. Insere uma linha em `sharkscope_diag_snapshots` (histórico pra delta)
 *   3. Atualiza `sharkscope_snapshot` / `sharkscope_summary` /
 *      `sharkscope_last_sync` em `reglife_diagnostic_results`
 *
 * Auth: Bearer ${CRON_SECRET} (Vercel cron envia esse header automaticamente
 * se você setar CRON_SECRET na env). Em dev pode chamar com ?secret=...
 *
 * Rate limit do SharkScopeClient já é 600ms entre requests; com 100 alunos
 * tipicamente roda em ~3min. Em escala maior, dividir por dia da semana.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSharkscopeClient } from "@/lib/sharkscope";
import { hasNotificationRecently, sendEvNotification } from "@/lib/notify";

const POST_SESSION_MIN_DELTA = 3; // só notifica se rolou ao menos 3 torneios novos
// Downswing: profit/(volume*stake médio) abaixo desse threshold → leak alert
const DOWNSWING_ROI_THRESHOLD = -25; // -25% de ROI no pacote de torneios novos
const DOWNSWING_MIN_VOLUME = 8;       // só dispara se foram ≥8 torneios (amostra mínima)

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min

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

  const { data: rows, error } = await supabase
    .from("reglife_diagnostic_results")
    .select(
      "id, sharkscope_username, sharkscope_network, sharkscope_playergroup_id"
    )
    .or("sharkscope_username.not.is.null,sharkscope_playergroup_id.not.is.null");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const diagRows = (rows ?? []) as DiagRow[];
  const client = getSharkscopeClient();
  const results: { id: string; ok: boolean; reason?: string }[] = [];

  for (const row of diagRows) {
    if (!row.sharkscope_username && !row.sharkscope_playergroup_id) continue;
    const network = row.sharkscope_network ?? "PokerStars";
    const useGroup = !!row.sharkscope_playergroup_id;
    const source: "player" | "playergroup" = useGroup ? "playergroup" : "player";
    const identifier = useGroup
      ? row.sharkscope_playergroup_id!
      : row.sharkscope_username!;

    try {
      // Pega snapshot anterior pra calcular delta (entries novos, ROI, profit)
      const { data: prevRow } = await supabase
        .from("sharkscope_diag_snapshots")
        .select("entries_total, profit_total, avg_roi")
        .eq("diagnostic_id", row.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const snapshot = useGroup
        ? await client.fetchGroupSnapshot(identifier, network)
        : await client.fetchPlayerSnapshot(identifier, network);

      const summary = {
        entries: snapshot.overall?.Entries ?? null,
        profit: snapshot.overall?.Profit ?? null,
        avgRoi: snapshot.overall?.AvROI ?? null,
        itm: snapshot.overall?.ITM ?? null,
        pkoRatio: snapshot.pkoRatio,
        winrate: snapshot.winrate,
      };

      // Histórico de snapshots (pra delta de volume semanal)
      await supabase.from("sharkscope_diag_snapshots").insert({
        diagnostic_id: row.id,
        snapshot,
        entries_total: snapshot.overall?.Entries ?? null,
        profit_total: snapshot.overall?.Profit ?? null,
        avg_roi: snapshot.overall?.AvROI ?? null,
        itm: snapshot.overall?.ITM ?? null,
        source,
      });

      // Estado atual na linha do diagnóstico
      await supabase
        .from("reglife_diagnostic_results")
        .update({
          sharkscope_snapshot: snapshot,
          sharkscope_summary: summary,
          sharkscope_last_sync: new Date().toISOString(),
        })
        .eq("id", row.id);

      // Trigger pós-sessão: detecta torneios novos desde a última sync
      if (prevRow?.entries_total != null && summary.entries != null) {
        const deltaEntries = summary.entries - prevRow.entries_total;
        if (deltaEntries >= POST_SESSION_MIN_DELTA) {
          const deltaProfit =
            summary.profit != null && prevRow.profit_total != null
              ? Number(summary.profit) - Number(prevRow.profit_total)
              : null;
          const profitStr =
            deltaProfit != null
              ? `${deltaProfit >= 0 ? "+" : "-"}$${Math.abs(deltaProfit).toFixed(0)}`
              : "?";
          const roiStr =
            summary.avgRoi != null ? `${summary.avgRoi.toFixed(1)}%` : "?";

          // ROI aproximado do pacote: profit / (volume * buy-in médio)
          let packageRoi: number | null = null;
          if (deltaProfit != null && summary.entries && summary.entries > 0) {
            const avgBuyin = await fetchAvgStake(row.id);
            if (avgBuyin && avgBuyin > 0) {
              packageRoi = (deltaProfit / (deltaEntries * avgBuyin)) * 100;
            }
          }

          // Downswing pesado tem trigger próprio (leak_alert) — não duplica
          // o post_session, escolhe o tom mais cirúrgico.
          const packageRoiValue = packageRoi;
          const isDownswing =
            packageRoiValue !== null &&
            deltaEntries >= DOWNSWING_MIN_VOLUME &&
            packageRoiValue <= DOWNSWING_ROI_THRESHOLD &&
            !(await hasNotificationRecently(row.id, "leak_alert", 48));

          if (isDownswing && packageRoiValue !== null) {
            await sendEvNotification({
              diagnosticId: row.id,
              kind: "leak_alert",
              trigger: "leak_alert",
              title: "🎯 Padrão chamando atenção",
              facts: {
                torneios_no_pacote: deltaEntries,
                profit_no_pacote: profitStr,
                roi_estimado_do_pacote: `${packageRoiValue.toFixed(1)}%`,
                roi_geral_acumulado: roiStr,
                itm: summary.itm,
              },
              fallback: `${deltaEntries} torneios, profit ${profitStr}, ROI ${packageRoiValue.toFixed(1)}% no pacote. Tá rolando alguma coisa — vamos olhar?`,
              payload: { deltaEntries, deltaProfit, packageRoi: packageRoiValue },
            });
          } else {
            await sendEvNotification({
              diagnosticId: row.id,
              kind: "post_session",
              trigger: "post_session",
              title: `${deltaEntries} torneios novos no SharkScope`,
              facts: {
                torneios_novos: deltaEntries,
                profit_no_periodo: profitStr,
                roi_medio_acumulado: roiStr,
                itm: summary.itm,
              },
              fallback: `Profit ${profitStr} nos ${deltaEntries} torneios novos · ROI acumulado ${roiStr}.`,
              payload: {
                deltaEntries,
                deltaProfit,
                avgRoi: summary.avgRoi,
              },
            });
          }
        }
      }

      results.push({ id: row.id, ok: true });
    } catch (err) {
      console.error(`[cron/sharkscope-sync] ${row.id}:`, err);
      results.push({
        id: row.id,
        ok: false,
        reason: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    total: diagRows.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    failures: results.filter((r) => !r.ok),
  });
}

/** Lê o avg stake atual do snapshot bruto pra calcular ROI aproximado do pacote. */
async function fetchAvgStake(diagId: string): Promise<number | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const snapshot = await supabase
    .from("sharkscope_diag_snapshots")
    .select("snapshot")
    .eq("diagnostic_id", diagId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const data = snapshot.data as { snapshot?: { overall?: { AvStake?: number } } } | null;
  return data?.snapshot?.overall?.AvStake ?? null;
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Em dev sem secret configurado, libera (apenas pra evitar bloqueio
    // acidental — em prod sempre defina CRON_SECRET).
    return process.env.NODE_ENV !== "production";
  }
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${expected}`) return true;
  // Fallback pra teste manual via query param
  if (req.nextUrl.searchParams.get("secret") === expected) return true;
  return false;
}
