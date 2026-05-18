/**
 * POST /api/sharkscope/sync-diagnostic
 *
 * Variante do /api/sharkscope/sync que NÃO depende de auth.users.
 * Usa o id da linha em reglife_diagnostic_results pra identificar o aluno.
 *
 * Body: { diagnosticId: string; username?: string; network?: string }
 *  - Se username/network vierem, atualizam a linha antes de sincronizar.
 *  - Se vierem vazios, usa os já gravados na linha.
 *
 * Auth: gated pelo middleware (HTTP Basic Auth do /admin) — quem chega aqui
 * já passou pelas credenciais ADMIN_USER/ADMIN_PASSWORD. Sem secret no body.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSharkscopeClient } from "@/lib/sharkscope";

// Usa service_role pra UPDATE/INSERT (anon não tem policy de UPDATE em
// reglife_diagnostic_results, e o endpoint já é gated pelo ADMIN_SECRET).
// Lazy: createClient explode com URL/key vazios → quebraria o `next build`
// quando o env não tá presente no estágio de coleta de page data.
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { diagnosticId, username, network, playergroupId } = body as {
    diagnosticId?: string;
    username?: string;
    network?: string;
    playergroupId?: string;
  };

  if (!diagnosticId) {
    return NextResponse.json({ error: "diagnosticId obrigatório" }, { status: 400 });
  }

  const supabase = getSupabase();

  // Carrega a linha pra saber o nick/grupo/network atual
  const { data: row, error: loadErr } = await supabase
    .from("reglife_diagnostic_results")
    .select("id, sharkscope_username, sharkscope_network, sharkscope_playergroup_id")
    .eq("id", diagnosticId)
    .single();

  if (loadErr || !row) {
    return NextResponse.json(
      { error: loadErr?.message ?? "Diagnóstico não encontrado" },
      { status: 404 }
    );
  }

  // Normaliza valores finais (tratando string vazia como "limpar")
  const cleaned = (v: string | undefined) =>
    v === undefined ? undefined : v.trim() === "" ? null : v.trim();

  const finalUsername =
    cleaned(username) ?? row.sharkscope_username ?? null;
  const finalGroupId =
    cleaned(playergroupId) ?? row.sharkscope_playergroup_id ?? null;
  const finalNetwork =
    cleaned(network) ?? row.sharkscope_network ?? "PokerStars";

  if (!finalUsername && !finalGroupId) {
    return NextResponse.json(
      {
        error:
          "Informe ao menos um nick (username) ou um Player Group ID do SharkScope.",
      },
      { status: 400 }
    );
  }

  // Persiste mudanças antes de sincronizar (idempotente em re-clicks)
  const update: Record<string, unknown> = {};
  if (cleaned(username) !== undefined) update.sharkscope_username = finalUsername;
  if (cleaned(playergroupId) !== undefined)
    update.sharkscope_playergroup_id = finalGroupId;
  if (cleaned(network) !== undefined) update.sharkscope_network = finalNetwork;
  if (Object.keys(update).length > 0) {
    await supabase
      .from("reglife_diagnostic_results")
      .update(update)
      .eq("id", diagnosticId);
  }

  // Estratégia: PlayerGroup ganha quando preenchido (visão consolidada).
  const useGroup = !!finalGroupId;
  const subjectIdentifier = useGroup ? finalGroupId! : finalUsername!;

  try {
    const client = getSharkscopeClient();
    const snapshot = useGroup
      ? await client.fetchGroupSnapshot(subjectIdentifier, finalNetwork)
      : await client.fetchPlayerSnapshot(subjectIdentifier, finalNetwork);

    const summary = {
      entries: snapshot.overall?.Entries ?? null,
      profit: snapshot.overall?.Profit ?? null,
      avgRoi: snapshot.overall?.AvROI ?? null,
      itm: snapshot.overall?.ITM ?? null,
      pkoRatio: snapshot.pkoRatio,
      winrate: snapshot.winrate,
    };

    const { error: updateErr } = await supabase
      .from("reglife_diagnostic_results")
      .update({
        sharkscope_snapshot: snapshot,
        sharkscope_summary: summary,
        sharkscope_last_sync: new Date().toISOString(),
      })
      .eq("id", diagnosticId);

    if (updateErr) throw updateErr;

    return NextResponse.json({
      success: true,
      username: finalUsername,
      playergroupId: finalGroupId,
      network: finalNetwork,
      source: useGroup ? "playergroup" : "player",
      summary,
    });
  } catch (err) {
    console.error("[sharkscope/sync-diagnostic] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao sincronizar SharkScope" },
      { status: 500 }
    );
  }
}
